import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {},
  ensureOperator: vi.fn(),
  getVaultDb: vi.fn(),
  listActivity: vi.fn(),
}));

vi.mock("./vault-db.js", () => ({
  ensureVaultOperator: mocks.ensureOperator,
  getVaultDb: mocks.getVaultDb,
}));

vi.mock("./monitoring/connection-store.js", () => ({
  disconnectMonitoringConnection: vi.fn(),
  getOwnedMonitoringConnectionSecret: vi.fn(),
  listMonitoringActivity: mocks.listActivity,
  listMonitoringConnections: vi.fn(),
  upsertGitHubConnection: vi.fn(),
}));

vi.mock("./monitoring/runner.js", () => ({ runDueMonitoring: vi.fn() }));

import type { TrpcContext } from "./_core/context.js";
import { monitoringRouter } from "./monitoring-router.js";

describe("monitoring.listActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVaultDb.mockReturnValue(mocks.db);
    mocks.ensureOperator.mockResolvedValue({ id: 42 });
    mocks.listActivity.mockResolvedValue({ runs: [], observations: [] });
  });

  it("scopes history to the authenticated operator and bounds the result", async () => {
    const caller = monitoringRouter.createCaller({
      user: { id: 1 },
      databaseUrl: "postgresql://database",
      githubOAuth: {},
      req: {},
      res: {},
      ai: null,
    } as TrpcContext);

    await expect(caller.listActivity({ limit: 8 })).resolves.toEqual({
      runs: [],
      observations: [],
    });
    expect(mocks.listActivity).toHaveBeenCalledWith(mocks.db, 42, 8);
  });

  it("rejects unbounded history requests", async () => {
    const caller = monitoringRouter.createCaller({
      user: { id: 1 },
      databaseUrl: "postgresql://database",
      githubOAuth: {},
      req: {},
      res: {},
      ai: null,
    } as TrpcContext);

    await expect(caller.listActivity({ limit: 100 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.listActivity).not.toHaveBeenCalled();
  });
});
