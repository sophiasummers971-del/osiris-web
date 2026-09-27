import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
const manifest = JSON.parse(
  fs.readFileSync("drizzle/postgres-manifest.json", "utf8")
);
const actual = fs
  .readdirSync("drizzle/migrations")
  .filter(x => x.endsWith(".sql"))
  .sort();
assert.deepEqual(
  actual,
  manifest.migrations.map(x => x.file),
  "Migration files must match the reviewed manifest and order"
);
for (const entry of manifest.migrations) {
  const sql = fs.readFileSync(`drizzle/migrations/${entry.file}`, "utf8");
  assert.equal(
    crypto.createHash("sha256").update(sql).digest("hex"),
    entry.sha256,
    `Reviewed migration changed: ${entry.file}`
  );
  assert.ok(sql.trim().length, "Empty migration");
  assert.ok(
    !/\bAUTO_INCREMENT\b|ENGINE\s*=\s*InnoDB/i.test(sql),
    "MySQL DDL in PostgreSQL sequence"
  );
}
console.log(
  `PASS: ${actual.length} reviewed PostgreSQL migrations, order and checksums verified.`
);
console.log(
  "PREREQUISITE: original Vault schema and Supabase auth/storage schemas must already exist. This is NOT an empty-database bootstrap or a live drift check."
);
console.log(
  `Historical baseline prerequisite: ${manifest.externalBaseline.reason}`
);
