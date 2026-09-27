import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  owned: vi.fn(),
  disconnect: vi.fn(),
  upsert: vi.fn(),
  complete: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("./vault-db.js", () => ({
  getVaultDb: () => ({}),
  ensureVaultOperator: async () => ({ id: 42 }),
}));
vi.mock("./monitoring/connection-store.js", () => ({
  getOwnedMonitoringConnectionSecret: mocks.owned,
  disconnectMonitoringConnection: mocks.disconnect,
  upsertGoogleConnection: mocks.upsert,
}));
vi.mock("./monitoring/token-crypto.js", () => ({
  encryptMonitoringToken: async () => "encrypted",
  decryptMonitoringToken: async () => "token",
}));
vi.mock("./monitoring/google-oauth.js", () => ({
  requireGoogleConfiguration: () => ({ tokenEncryptionKey: "key" }),
  beginGoogleAuthorization: vi.fn(),
  completeGoogleAuthorization: mocks.complete,
  revokeGoogleToken: mocks.revoke,
}));
import { googleMonitoringRouter } from "./google-monitoring-router";
import type { TrpcContext } from "./_core/context";
const context = {
  user: { id: 1 },
  databaseUrl: "postgresql://db",
  googleOAuth: {},
  req: {},
  res: {},
  ai: null,
} as TrpcContext;
describe("Google router ownership", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects anonymous connections", async () => {
    await expect(
      googleMonitoringRouter.createCaller({ ...context, user: null }).begin()
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("rejects disconnect of another owner's connection", async () => {
    mocks.owned.mockResolvedValue(null);
    await expect(
      googleMonitoringRouter
        .createCaller(context)
        .disconnect({ connectionId: 7 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.owned).toHaveBeenCalledWith({}, 42, 7);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
  it("stops locally even if remote revocation fails", async () => {
    mocks.owned.mockResolvedValue({
      id: 7,
      provider: "google",
      encryptedRefreshToken: "encrypted",
    });
    mocks.revoke.mockRejectedValue(new Error("private"));
    await expect(
      googleMonitoringRouter
        .createCaller(context)
        .disconnect({ connectionId: 7 })
    ).resolves.toEqual({ disconnected: true, revoked: false });
    expect(mocks.disconnect).toHaveBeenCalledWith({}, 42, 7);
  });
  it("persists encrypted tokens under authenticated owner and never returns them", async () => {
    mocks.complete.mockResolvedValue({
      accessToken: "access",
      refreshToken: "refresh",
      accountId: "123",
      email: "owner@example.com",
      historyId: "100",
    });
    mocks.upsert.mockResolvedValue({ id: 7 });
    const result = await googleMonitoringRouter
      .createCaller(context)
      .complete({ code: "code", state: "state" });
    expect(result).toEqual({ connected: true, connectionId: 7 });
    expect(mocks.complete).toHaveBeenCalledWith("code", "state", 42, {
      tokenEncryptionKey: "key",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 42,
        encryptedAccessToken: "encrypted",
        encryptedRefreshToken: "encrypted",
      })
    );
  });
});
