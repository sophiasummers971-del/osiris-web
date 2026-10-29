import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptMonitoringToken } from "./token-crypto";

const store = vi.hoisted(() => ({
  db: {},
  claim: vi.fn(),
  start: vi.fn(),
  stage: vi.fn(),
  link: vi.fn(),
  finish: vi.fn(),
  fail: vi.fn(),
  reauthorize: vi.fn(),
}));
vi.mock("../vault-db.js", () => ({ getVaultDb: () => store.db }));
vi.mock("./connection-store.js", () => ({
  claimDueMonitoringConnections: store.claim,
  startMonitoringRun: store.start,
  stageMonitoringObservation: store.stage,
  linkObservationToPegasusEvent: store.link,
  finishMonitoringRun: store.finish,
  failMonitoringRun: store.fail,
  requireMonitoringReauthorization: store.reauthorize,
}));
import { runDueMonitoring } from "./runner";

const key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const environment = {
  databaseUrl: "postgresql://synthetic.invalid/db",
  tokenEncryptionKey: key,
  ownerId: 42,
  connectionId: 8,
  googleOAuth: {
    enabled: true,
    clientId: "synthetic-client",
    clientSecret: "synthetic-secret",
    redirectUri: "https://synthetic.invalid/integrations/google/callback",
    tokenEncryptionKey: key,
  },
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const quota = (reason: string) => ({
  error: { errors: [{ reason }], message: "private provider detail" },
});

describe("Google polling error recovery through the real OAuth and Gmail collectors", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    store.claim.mockResolvedValue([
      {
        id: 8,
        ownerId: 42,
        provider: "google",
        providerAccountId: "synthetic-account",
        encryptedAccessToken: await encryptMonitoringToken(
          "synthetic-access",
          key
        ),
        encryptedRefreshToken: await encryptMonitoringToken(
          "synthetic-refresh",
          key
        ),
        checkpoint: { historyId: "100" },
      },
    ]);
    store.start.mockResolvedValue({ id: "synthetic-run" });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    [403, quota("rateLimitExceeded")],
    [403, quota("userRateLimitExceeded")],
    [403, quota("dailyLimitExceeded")],
    [429, { error: { message: "private provider detail" } }],
  ])(
    "keeps credentials eligible after quota status %s and resumes the unchanged checkpoint",
    async (status, body) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(json({ access_token: "synthetic-access" }))
        .mockResolvedValueOnce(json(body, status))
        .mockResolvedValueOnce(json({ access_token: "synthetic-access" }))
        .mockResolvedValueOnce(json({ historyId: "102", history: [] }));
      vi.stubGlobal("fetch", fetcher);
      expect(await runDueMonitoring(environment)).toMatchObject({
        processed: 0,
        failed: 1,
      });
      expect(store.reauthorize).not.toHaveBeenCalled();
      expect(store.finish).not.toHaveBeenCalled();
      expect(store.stage).not.toHaveBeenCalled();
      expect(store.fail).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: "GOOGLE_RATE_LIMITED" })
      );
      expect(JSON.stringify(store.fail.mock.calls)).not.toContain(
        "private provider detail"
      );
      expect(await runDueMonitoring(environment)).toMatchObject({
        processed: 1,
        failed: 0,
      });
      expect(String(fetcher.mock.calls[3][0])).toContain("startHistoryId=100");
      expect(store.finish).toHaveBeenCalledWith(
        expect.objectContaining({
          checkpoint: expect.objectContaining({ historyId: "102" }),
        })
      );
      expect(fetcher).toHaveBeenCalledTimes(4);
    }
  );

  it.each([
    [401, {}],
    [403, quota("insufficientPermissions")],
    [403, {}],
    [
      403,
      {
        error: {
          errors: [
            { reason: "rateLimitExceeded" },
            { reason: "insufficientPermissions" },
          ],
        },
      },
    ],
    [403, { error: { errors: [null] } }],
  ])(
    "still stops polling on denied or unclassified authorization status %s",
    async (status, body) => {
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(json({ access_token: "synthetic-access" }))
        .mockResolvedValueOnce(json(body, status));
      vi.stubGlobal("fetch", fetcher);
      expect(await runDueMonitoring(environment)).toMatchObject({
        processed: 0,
        failed: 1,
      });
      expect(store.reauthorize).toHaveBeenCalledWith(store.db, 8);
      expect(store.finish).not.toHaveBeenCalled();
      expect(store.stage).not.toHaveBeenCalled();
      expect(store.fail).toHaveBeenCalledWith(
        expect.objectContaining({
          errorCode: "GOOGLE_REAUTHORIZATION_REQUIRED",
        })
      );
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  );

  it("stops on invalid_grant before requesting mailbox metadata", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      json(
        {
          error: "invalid_grant",
          error_description: "private provider detail",
        },
        400
      )
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await runDueMonitoring(environment)).toMatchObject({
      processed: 0,
      failed: 1,
    });
    expect(store.reauthorize).toHaveBeenCalledWith(store.db, 8);
    expect(store.finish).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
