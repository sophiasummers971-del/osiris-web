import test from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { createPostgresChallengeStore } from "./postgres-challenge-store.mjs";

// Explicitly refuse all non-disposable targets; never run with production DB.
if (
  process.env.CAT_POSTGRES_DISPOSABLE !== "1" ||
  !["127.0.0.1", "localhost"].includes(process.env.PGHOST) ||
  process.env.PGDATABASE !== "cat_challenge_test"
) {
  throw new Error("DISPOSABLE_LOCAL_POSTGRES_REQUIRED");
}
const options = {
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  username: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 3,
};
test("real PostgreSQL: independent connections atomically consume once", async () => {
  const admin = postgres(options);
  const first = postgres(options);
  const second = postgres(options);
  try {
    await admin.unsafe(`CREATE TABLE osiris_webauthn_challenges (
      challenge_key text PRIMARY KEY,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    const adapter = client =>
      createPostgresChallengeStore({
        query: async (sql, params) => ({ rows: await client.unsafe(sql, params) }),
      });
    const a = adapter(first);
    const b = adapter(second);
    const key = "cat-real-atomic-claim";
    const payload = { tenantId: "synthetic_tenant", expiresAt: 1000000 };
    assert.equal(await a.putIfAbsent(key, payload), true);
    assert.equal(await b.putIfAbsent(key, { other: true }), false);
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).take(key))
    );
    assert.equal(results.filter(Boolean).length, 1);
    assert.deepEqual(results.find(Boolean), payload);
    assert.equal(await a.take(key), null);
  } finally {
    await admin.unsafe("DROP TABLE IF EXISTS osiris_webauthn_challenges");
    await Promise.all([admin.end(), first.end(), second.end()]);
  }
});
