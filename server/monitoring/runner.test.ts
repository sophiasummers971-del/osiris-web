import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  getVaultDb: vi.fn(),
  claim: vi.fn(),
  start: vi.fn(),
  stage: vi.fn(),
  link: vi.fn(),
  finish: vi.fn(),
  fail: vi.fn(),
  decrypt: vi.fn(),
  monitor: vi.fn(),
  record: vi.fn(),
  google: vi.fn(),
  token: vi.fn(),
  reauthorize: vi.fn(),
}));

vi.mock("../vault-db.js", () => ({ getVaultDb: mocks.getVaultDb }));
vi.mock("./connection-store.js", () => ({
  claimDueMonitoringConnections: mocks.claim,
  startMonitoringRun: mocks.start,
  stageMonitoringObservation: mocks.stage,
  linkObservationToPegasusEvent: mocks.link,
  finishMonitoringRun: mocks.finish,
  failMonitoringRun: mocks.fail,
  requireMonitoringReauthorization: mocks.reauthorize,
}));
vi.mock("./token-crypto.js", () => ({
  decryptMonitoringToken: mocks.decrypt,
}));
vi.mock("./github-monitor.js", () => ({
  monitorGitHubAccount: mocks.monitor,
}));
vi.mock("../pegasus-store.js", () => ({
  recordPegasusEvent: mocks.record,
}));

vi.mock("./google-monitor.js", () => ({ monitorGoogleMail: mocks.google }));
vi.mock("./google-oauth.js", () => ({ googleToken: mocks.token }));

import { runDueMonitoring } from "./runner.js";

describe("scheduled monitoring runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVaultDb.mockReturnValue(mocks.db);
    mocks.claim.mockResolvedValue([]);
  });

  it("does nothing until both database and encryption key are configured", async () => {
    await expect(
      runDueMonitoring({
        databaseUrl: "postgresql://database",
        tokenEncryptionKey: undefined,
      })
    ).resolves.toEqual({
      processed: 0,
      failed: 0,
      configured: false,
      configurationError: "MONITORING_TOKEN_KEY_UNAVAILABLE",
    });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("records a new provider state once and advances the checkpoint", async () => {
    const connection = {
      id: 7,
      provider: "github",
      ownerId: 42,
      encryptedAccessToken: "v1.encrypted.token",
      checkpoint: {},
    };
    const event = {
      source: "github",
      category: "configuration",
      signal: "PROTECTION_DISABLED",
      severity: "critical",
      confidence: 100,
      observedAt: new Date("2026-09-15T12:00:00.000Z"),
      details: {},
    };
    mocks.claim.mockResolvedValue([connection]);
    mocks.start.mockResolvedValue({ id: "run-1" });
    mocks.decrypt.mockResolvedValue("plaintext-token");
    mocks.monitor.mockResolvedValue({
      checkpoint: { twoFactorAuthentication: false },
      observation: {
        externalId: "github:account:123:fingerprint",
        kind: "github.account_profile",
        event,
      },
    });
    mocks.stage.mockResolvedValue({ id: 9, pegasusEventId: null });
    mocks.record.mockResolvedValue({ eventId: 11, alertCount: 1 });

    await expect(
      runDueMonitoring(
        {
          databaseUrl: "postgresql://database",
          tokenEncryptionKey: "encryption-key",
        },
        new Date("2026-09-15T12:00:00.000Z")
      )
    ).resolves.toEqual({
      processed: 1,
      failed: 0,
      configured: true,
      configurationError: null,
    });

    expect(mocks.record).toHaveBeenCalledWith(
      mocks.db,
      42,
      event,
      "github:account:123:fingerprint"
    );
    expect(mocks.link).toHaveBeenCalledWith(mocks.db, 9, 11);
    expect(mocks.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        connectionId: 7,
        observationCount: 1,
      })
    );
    expect(mocks.fail).not.toHaveBeenCalled();
  });

  it("scopes a forced manual run to the authenticated owner", async () => {
    await runDueMonitoring(
      {
        databaseUrl: "postgresql://database",
        tokenEncryptionKey: "encryption-key",
        ownerId: 42,
        connectionId: 7,
        force: true,
      },
      new Date("2026-09-15T12:00:00.000Z")
    );

    expect(mocks.claim).toHaveBeenCalledWith(
      mocks.db,
      new Date("2026-09-15T12:00:00.000Z"),
      new Date("2026-09-15T12:15:00.000Z"),
      10,
      { ownerId: 42, connectionId: 7, force: true }
    );
  });

  it("stores only a sanitized failure code", async () => {
    mocks.claim.mockResolvedValue([
      {
        id: 7,
        provider: "github",
        ownerId: 42,
        encryptedAccessToken: "v1.encrypted.token",
        checkpoint: {},
      },
    ]);
    mocks.start.mockResolvedValue({ id: "run-1" });
    mocks.decrypt.mockRejectedValue(new Error("raw secret provider detail"));

    await expect(
      runDueMonitoring({
        databaseUrl: "postgresql://database",
        tokenEncryptionKey: "encryption-key",
      })
    ).resolves.toEqual({
      processed: 0,
      failed: 1,
      configured: true,
      configurationError: null,
    });
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "GITHUB_MONITORING_FAILED" })
    );
    expect(JSON.stringify(mocks.fail.mock.calls)).not.toContain(
      "raw secret provider detail"
    );
  });
});

it("stops Google polling on expired history without advancing the checkpoint", async () => {
  vi.clearAllMocks();
  mocks.getVaultDb.mockReturnValue(mocks.db);
  mocks.claim.mockResolvedValue([
    {
      id: 8,
      ownerId: 42,
      provider: "google",
      providerAccountId: "123",
      encryptedAccessToken: "a",
      encryptedRefreshToken: "r",
      checkpoint: { historyId: "100" },
    },
  ]);
  mocks.start.mockResolvedValue({ id: "google-run" });
  mocks.decrypt.mockResolvedValue("refresh");
  mocks.token.mockResolvedValue({ accessToken: "access" });
  mocks.google.mockRejectedValue(new Error("GOOGLE_HISTORY_EXPIRED"));
  const result = await runDueMonitoring({
    databaseUrl: "postgresql://db",
    tokenEncryptionKey: "key",
    googleOAuth: { enabled: true },
  });
  expect(result.failed).toBe(1);
  expect(mocks.reauthorize).toHaveBeenCalledWith(mocks.db, 8);
  expect(mocks.finish).not.toHaveBeenCalled();
  expect(mocks.fail).toHaveBeenCalledWith(
    expect.objectContaining({ errorCode: "GOOGLE_HISTORY_EXPIRED" })
  );
});
