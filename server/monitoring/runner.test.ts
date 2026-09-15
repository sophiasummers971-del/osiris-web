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
}));

vi.mock("../vault-db.js", () => ({ getVaultDb: mocks.getVaultDb }));
vi.mock("./connection-store.js", () => ({
  claimDueMonitoringConnections: mocks.claim,
  startMonitoringRun: mocks.start,
  stageMonitoringObservation: mocks.stage,
  linkObservationToPegasusEvent: mocks.link,
  finishMonitoringRun: mocks.finish,
  failMonitoringRun: mocks.fail,
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

import { runDueMonitoring } from "./runner.js";

describe("scheduled monitoring runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVaultDb.mockReturnValue(mocks.db);
    mocks.claim.mockResolvedValue([]);
  });

  it("does nothing until both database and encryption key are configured", async () => {
    await expect(
      runDueMonitoring({ databaseUrl: "postgresql://database", tokenEncryptionKey: undefined })
    ).resolves.toEqual({ processed: 0, failed: 0, configured: false });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("records a new provider state once and advances the checkpoint", async () => {
    const connection = {
      id: 7,
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
    ).resolves.toEqual({ processed: 1, failed: 0, configured: true });

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

  it("stores only a sanitized failure code", async () => {
    mocks.claim.mockResolvedValue([
      {
        id: 7,
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
    ).resolves.toEqual({ processed: 0, failed: 1, configured: true });
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "GITHUB_MONITORING_FAILED" })
    );
    expect(JSON.stringify(mocks.fail.mock.calls)).not.toContain(
      "raw secret provider detail"
    );
  });
});
