import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const mocks = vi.hoisted(() => ({ where: vi.fn(), drizzle: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));

describe("legacy notification ownership", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "mysql://test-only");
    mocks.where.mockResolvedValue([{ affectedRows: 1 }]);
    mocks.drizzle.mockReturnValue({
      update: () => ({ set: () => ({ where: mocks.where }) }),
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(["markNotificationAsRead", "dismissNotification"] as const)(
    "%s does not log raw database errors or their nested secrets",
    async operation => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const failure = new Error("private-query-marker", {
        cause: {
          password: "synthetic-secret-marker",
          params: ["private-evidence-marker"],
        },
      });
      mocks.where.mockRejectedValue(failure);
      const db = await import("./db.js");
      await expect(db[operation](77, 42)).rejects.toBe(failure);
      expect(log).toHaveBeenCalledOnce();
      const output = JSON.stringify(log.mock.calls);
      expect(output).toContain("OPERATION_FAILED");
      expect(output).not.toContain("private-");
      expect(output).not.toContain("synthetic-secret-marker");
    }
  );

  it.each(["markNotificationAsRead", "dismissNotification"] as const)(
    "%s filters updates by notification AND authenticated owner",
    async operation => {
      const db = await import("./db.js");
      const updated = await db[operation](77, 42);
      const query = new MySqlDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
      expect(query.params).toEqual([77, 42]);
      expect(query.sql).toContain("`notifications`.`userId`");
      expect(updated).toBe(true);
    }
  );

  it.each(["markNotificationAsRead", "dismissNotification"] as const)(
    "%s does not claim success for missing or foreign notifications",
    async operation => {
      mocks.where.mockResolvedValue([{ affectedRows: 0 }]);
      const db = await import("./db.js");
      await expect(db[operation](77, 42)).resolves.toBe(false);
    }
  );

  it.each(["markNotificationAsRead", "dismissNotification"] as const)(
    "%s fails closed when storage is unavailable",
    async operation => {
      vi.stubEnv("DATABASE_URL", "");
      const db = await import("./db.js");
      await expect(db[operation](77, 42)).rejects.toThrow(
        "Notification storage is not configured"
      );
      expect(mocks.where).not.toHaveBeenCalled();
    }
  );
});
