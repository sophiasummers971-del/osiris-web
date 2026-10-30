import test from "node:test";
import assert from "node:assert/strict";
import { createPostgresChallengeStore } from "./postgres-challenge-store.mjs";

function fakeDb() {
  const records = new Map();
  return {
    async query(sql, params) {
      if (sql.includes("INSERT INTO")) {
        if (records.has(params[0])) return { rows: [], rowCount: 0 };
        records.set(params[0], JSON.parse(params[1]));
        return { rows: [{ key: params[0] }], rowCount: 1 };
      }
      if (sql.includes("DELETE FROM")) {
        const value = records.get(params[0]);
        records.delete(params[0]);
        return {
          rows: value ? [{ payload: value }] : [],
          rowCount: value ? 1 : 0,
        };
      }
      throw Error("UNEXPECTED_SQL");
    },
  };
}
test("two separate store adapters race and exactly one consumes", async () => {
  const db = fakeDb();
  const first = createPostgresChallengeStore(db);
  const second = createPostgresChallengeStore(db);
  const key = "challenge-test";
  const value = { tenantId: "tenant_12345", expiresAt: 123 };
  assert.equal(await first.putIfAbsent(key, value), true);
  const outcomes = await Promise.all([first.take(key), second.take(key)]);
  assert.equal(outcomes.filter(Boolean).length, 1);
  assert.deepEqual(outcomes.find(Boolean), value);
});
test("duplicate insert rejects without overwriting", async () => {
  const store = createPostgresChallengeStore(fakeDb());
  assert.equal(await store.putIfAbsent("a", { value: 1 }), true);
  assert.equal(await store.putIfAbsent("a", { value: 2 }), false);
  assert.deepEqual(await store.take("a"), { value: 1 });
});
test("database outage does not produce a successful claim", async () => {
  const store = createPostgresChallengeStore({
    query: async () => {
      throw Error("db offline");
    },
  });
  await assert.rejects(store.putIfAbsent("a", {}));
  await assert.rejects(store.take("a"));
});
