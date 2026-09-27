import fs from "node:fs";
import assert from "node:assert/strict";
// This repository config has no comments; permit its JSONC trailing commas.
const config = JSON.parse(
  fs.readFileSync("wrangler.jsonc", "utf8").replace(/,\s*([}\]])/g, "$1")
);
assert.equal(config.main, "worker/index.ts");
assert.ok(config.compatibility_flags.includes("nodejs_compat"));
assert.ok(config.hyperdrive.some(x => x.binding === "HYPERDRIVE"));
assert.equal(config.ai.binding, "AI");
assert.deepEqual(config.triggers.crons, ["*/15 * * * *"]);
assert.deepEqual(config.assets.run_worker_first, ["/api/*"]);
assert.equal(config.assets.binding, "ASSETS");
const recipient = fs
  .readFileSync("server/email-test.ts", "utf8")
  .match(/EMAIL_TEST_RECIPIENT\s*=\s*"([^"]+)"/)[1];
assert.match(recipient, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
assert.equal(
  config.send_email.find(x => x.name === "email_verify").destination_address,
  recipient
);
for (const key of Object.keys(config.vars))
  assert.ok(
    !/SECRET|PASSWORD|SERVICE_ROLE|TOKEN_KEY/.test(key),
    `Secret in vars: ${key}`
  );
console.log(
  "PASS: repository Cloudflare binding, routing, cron and recipient contract. Remote configuration NOT inspected."
);
