import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context.js";

const mocks = vi.hoisted(() => ({
  db: {},
  list: vi.fn(),
  acknowledge: vi.fn(),
  operator: vi.fn(),
  getDb: vi.fn(),
  emailStatus: vi.fn(),
}));
vi.mock("./vault-db.js", () => ({
  getVaultDb: mocks.getDb,
  ensureVaultOperator: mocks.operator,
}));
vi.mock("./pegasus-store.js", () => ({
  listPegasusAlerts: mocks.list,
  acknowledgePegasusAlert: mocks.acknowledge,
  getPegasusOverview: vi.fn(),
}));
vi.mock("./email-outbox.js", () => ({
  getEmailAlarmStatus: mocks.emailStatus,
}));
import { pegasusRouter } from "./pegasus-router.js";

function caller(user: { id: number } | null = { id: 1 }) {
  return pegasusRouter.createCaller({
    user,
    databaseUrl: "postgresql://test-only",
    req: {},
    res: {},
    ai: null,
  } as TrpcContext);
}

describe("durable PEGASUS alert API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDb.mockReturnValue(mocks.db);
    mocks.operator.mockResolvedValue({ id: 42 });
    mocks.list.mockResolvedValue([]);
  });
  it("lists using the vault operator, not the legacy user ID", async () => {
    await expect(caller().listAlerts({ limit: 50 })).resolves.toEqual([]);
    expect(mocks.list).toHaveBeenCalledWith(mocks.db, 42, 50);
  });
  it("rejects unauthenticated reads", async () => {
    await expect(caller(null).listAlerts({ limit: 50 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("bounds reads", async () => {
    await expect(caller().listAlerts({ limit: 101 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("reports storage outages instead of an empty inbox", async () => {
    mocks.getDb.mockReturnValue(null);
    await expect(caller().listAlerts({ limit: 50 })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it("does not acknowledge a foreign or missing alert", async () => {
    mocks.acknowledge.mockResolvedValue(false);
    await expect(
      caller().acknowledgeAlert({ alertId: 9 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.acknowledge).toHaveBeenCalledWith(mocks.db, 42, 9);
  });
  it("scopes email status to the authenticated vault operator", async () => {
    mocks.emailStatus.mockResolvedValue({ enabled: false, deliveries: [] });
    await caller().emailAlarmStatus();
    expect(mocks.emailStatus).toHaveBeenCalledWith(mocks.db, 42);
  });
  it("rejects unauthenticated email-status reads", async () => {
    await expect(caller(null).emailAlarmStatus()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(mocks.emailStatus).not.toHaveBeenCalled();
  });
});
