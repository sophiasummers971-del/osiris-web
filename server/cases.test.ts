import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { TrpcContext } from "./_core/context.js";

const mocks = vi.hoisted(() => ({ getDb: vi.fn(), operator: vi.fn() }));
vi.mock("./vault-db.js", () => ({
  getVaultDb: mocks.getDb,
  ensureVaultOperator: mocks.operator,
}));
import { casesRouter } from "./cases.js";

const dialect = new PgDialect();
const predicates: Array<{ sql: string; params: unknown[] }> = [];
const transaction = vi.fn();
let owned = true;
const db = {
  transaction,
  select: () => ({
    from: () => ({
      where: (predicate: SQL) => {
        predicates.push(dialect.sqlToQuery(predicate));
        return {
          limit: async () => (owned ? [{ id: 5, ownerId: 42 }] : []),
          orderBy: async () => [],
        };
      },
    }),
  }),
};
function caller(
  authenticated = true,
  databaseUrl: string | null = "postgresql://test-only"
) {
  return casesRouter.createCaller({
    user: authenticated ? { id: 1 } : null,
    databaseUrl,
    req: {},
    res: {},
    ai: null,
  } as TrpcContext);
}
const evidence = {
  caseId: 5,
  label: "TEST ONLY",
  sourceType: "observation" as const,
  capturedAt: new Date("2026-09-16T12:00:00Z"),
};

describe("vault case API access boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    predicates.length = 0;
    owned = true;
    mocks.getDb.mockReturnValue(db);
    mocks.operator.mockResolvedValue({ id: 42 });
  });
  it("rejects anonymous list, detail, create, and evidence operations before storage", async () => {
    const api = caller(false);
    for (const operation of [
      () => api.list(),
      () => api.detail({ caseId: 5 }),
      () => api.create({ title: "TEST ONLY" }),
      () => api.addEvidence(evidence),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
  it("scopes the register to the vault operator rather than the legacy user", async () => {
    await caller().list();
    expect(predicates[0].sql).toContain('"owner_id"');
    expect(predicates[0].params).toEqual([42]);
  });
  it("checks case ID and owner before reading evidence or audit records", async () => {
    owned = false;
    await expect(caller().detail({ caseId: 5 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(predicates).toHaveLength(1);
    expect(predicates[0].sql).toContain('"owner_id"');
    expect(predicates[0].params).toEqual([5, 42]);
  });
  it("rejects foreign or missing cases before starting an evidence write", async () => {
    owned = false;
    await expect(caller().addEvidence(evidence)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(predicates[0].params).toEqual([5, 42]);
    expect(predicates[0].sql).toContain('"owner_id"');
    expect(transaction).not.toHaveBeenCalled();
  });
  it("scopes evidence reads to both the owned case and vault operator", async () => {
    await expect(caller().detail({ caseId: 5 })).resolves.toMatchObject({
      evidence: [],
      audit: [],
    });
    expect(predicates[1].sql).toContain('"owner_id"');
    expect(predicates[1].params).toEqual([5, 42]);
    expect(predicates[2].params).toEqual([5]);
  });
  it("reports missing storage rather than an empty successful register", async () => {
    mocks.getDb.mockReturnValue(null);
    await expect(caller(true, null).list()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
  it("rejects invalid case IDs and malformed content hashes before writes", async () => {
    await expect(caller().detail({ caseId: 0 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      caller().addEvidence({ ...evidence, contentHash: "not-sha256" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(transaction).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
});
