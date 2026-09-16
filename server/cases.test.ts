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
const storage = { upload: vi.fn(), download: vi.fn() };
let owned = true;
let fileRecord: Record<string, unknown> | undefined;
const db = {
  transaction,
  select: () => ({
    from: () => ({
      where: (predicate: SQL) => {
        predicates.push(dialect.sqlToQuery(predicate));
        return {
          limit: async () =>
            owned
              ? [
                  predicates.length > 1 && fileRecord
                    ? fileRecord
                    : { id: 5, ownerId: 42 },
                ]
              : [],
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
    evidenceStorage: storage,
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
    fileRecord = undefined;
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
      () =>
        api.uploadEvidence({
          caseId: 5,
          label: "TEST ONLY",
          filename: "x.txt",
          mime: "text/plain",
          base64: "aGVsbG8=",
        }),
      () => api.downloadEvidence({ caseId: 5, evidenceId: 1 }),
    ])
      await expect(operation()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });
  it("scopes the register to the vault operator rather than the legacy user", async () => {
    await caller().list();
    expect(predicates[0].sql).toContain('"owner_id"');
    expect(predicates[0].params).toEqual([42]);
  });
  it("rejects file operations on a foreign case before using privileged storage", async () => {
    owned = false;
    await expect(
      caller().uploadEvidence({
        caseId: 5,
        label: "TEST ONLY",
        filename: "x.txt",
        mime: "text/plain",
        base64: "aGVsbG8=",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      caller().downloadEvidence({ caseId: 5, evidenceId: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.download).not.toHaveBeenCalled();
  });
  it("hashes the actual bytes and uses an owner-generated path before recording metadata", async () => {
    const values = vi.fn(() => ({ returning: async () => [{ id: 8 }] }));
    transaction.mockImplementation(async callback =>
      callback({ insert: () => ({ values }) })
    );
    await caller().uploadEvidence({
      caseId: 5,
      label: "TEST ONLY",
      filename: "x.txt",
      mime: "text/plain",
      base64: "aGVsbG8=",
    });
    expect(storage.upload.mock.calls[0][0]).toMatch(
      /^operators\/42\/cases\/5\/[0-9a-f-]{36}\.txt$/
    );
    expect(values.mock.calls[0][0]).toMatchObject({
      contentHash:
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      fileSizeBytes: 5,
      storageBucket: "osiris-evidence",
      ownerId: 42,
    });
  });
  it("does not write metadata if storage rejects the upload", async () => {
    storage.upload.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(
      caller().uploadEvidence({
        caseId: 5,
        label: "TEST ONLY",
        filename: "x.txt",
        mime: "text/plain",
        base64: "aGVsbG8=",
      })
    ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
  it("never signs a record without a trusted owner-scoped file path", async () => {
    await expect(
      caller().downloadEvidence({ caseId: 5, evidenceId: 1 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(predicates[1].params).toEqual([1, 5, 42]);
    expect(storage.download).not.toHaveBeenCalled();
  });
  it("returns an expiring attachment link for an owned file", async () => {
    const path =
      "operators/42/cases/5/12345678-1234-1234-1234-123456789abc.txt";
    fileRecord = {
      storageBucket: "osiris-evidence",
      storagePath: path,
      originalFilename: "note.txt",
    };
    storage.download.mockResolvedValueOnce(
      "https://storage.example/signed-test"
    );
    await expect(
      caller().downloadEvidence({ caseId: 5, evidenceId: 8 })
    ).resolves.toEqual({
      url: "https://storage.example/signed-test",
      expiresIn: 60,
    });
    expect(storage.download).toHaveBeenCalledWith(path, "note.txt");
  });
  it.each([
    "operators/43/cases/5/12345678-1234-1234-1234-123456789abc.txt",
    "operators/42/cases/5/../secret.txt",
  ])("rejects unsafe stored paths: %s", async storagePath => {
    fileRecord = { storageBucket: "osiris-evidence", storagePath };
    await expect(
      caller().downloadEvidence({ caseId: 5, evidenceId: 8 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(storage.download).not.toHaveBeenCalled();
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
