import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { listPegasusAlerts } from "./pegasus-store.js";

describe("PEGASUS alert projection", () => {
  it("filters by owner, limits rows, and excludes event payloads and identifiers", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn(() => ({ limit }));
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    const db = { select } as unknown as Parameters<typeof listPegasusAlerts>[0];
    await expect(listPegasusAlerts(db, 42, 50)).resolves.toEqual([]);
    const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
    expect(query.params).toEqual([42]);
    expect(query.sql).toContain('"pegasus_alerts"."owner_id"');
    expect(limit).toHaveBeenCalledWith(50);
    expect(Object.keys(select.mock.calls[0][0]).sort()).toEqual([
      "createdAt",
      "id",
      "requiresApproval",
      "ruleId",
      "severity",
      "status",
      "title",
    ]);
  });
});
