import test from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { createPostgresChallengeStore } from "../rule-zero/postgres-challenge-store.mjs";

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
        query: async (sql, params) => ({
          rows: await client.unsafe(
            sql,
            sql.includes("INSERT INTO")
              ? [params[0], client.json(JSON.parse(params[1]))]
              : params
          ),
        }),
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

test("real PostgreSQL: service grants are narrow and untrusted role is denied", async () => {
  const admin = postgres(options);
  let service;
  let untrusted;
  try {
    await admin.unsafe(`CREATE TABLE osiris_webauthn_challenges (
      challenge_key text PRIMARY KEY,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await admin.unsafe("REVOKE ALL ON osiris_webauthn_challenges FROM PUBLIC");
    await admin.unsafe("CREATE ROLE cat_approval_runner LOGIN PASSWORD 'disposable_runner_only'");
    await admin.unsafe("CREATE ROLE cat_untrusted LOGIN PASSWORD 'disposable_untrusted_only'");
    await admin.unsafe("GRANT USAGE ON SCHEMA public TO cat_approval_runner");
    await admin.unsafe("GRANT INSERT, SELECT, DELETE ON osiris_webauthn_challenges TO cat_approval_runner");
    service = postgres({
      ...options,
      username: "cat_approval_runner",
      password: "disposable_runner_only",
    });
    untrusted = postgres({
      ...options,
      username: "cat_untrusted",
      password: "disposable_untrusted_only",
    });
    const store = createPostgresChallengeStore({
      query: async (sql, params) => ({
        rows: await service.unsafe(
          sql,
          sql.includes("INSERT INTO")
            ? [params[0], service.json(JSON.parse(params[1]))]
            : params
        ),
      }),
    });
    assert.equal(await store.putIfAbsent("restricted-key", { ownerId: "synthetic_owner" }), true);
    await assert.rejects(
      untrusted.unsafe("SELECT payload FROM osiris_webauthn_challenges"),
      error => error.code === "42501"
    );
    await assert.rejects(
      untrusted.unsafe("DELETE FROM osiris_webauthn_challenges WHERE challenge_key = $1", ["restricted-key"]),
      error => error.code === "42501"
    );
    await assert.rejects(
      service.unsafe("UPDATE osiris_webauthn_challenges SET payload = '{}'::jsonb"),
      error => error.code === "42501"
    );
    assert.deepEqual(await store.take("restricted-key"), { ownerId: "synthetic_owner" });
  } finally {
    if (service) await service.end();
    if (untrusted) await untrusted.end();
    await admin.unsafe("DROP TABLE IF EXISTS osiris_webauthn_challenges");
    await admin.unsafe("DROP ROLE IF EXISTS cat_approval_runner");
    await admin.unsafe("DROP ROLE IF EXISTS cat_untrusted");
    await admin.end();
  }
});
