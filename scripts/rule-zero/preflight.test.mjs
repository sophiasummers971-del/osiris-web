import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePreflight } from "./preflight.mjs";

const now = Date.parse("2026-10-28T22:00:00Z");
const clean = () => ({
  source: "trusted-runner",
  jobId: "job_12345678",
  target: "osiris-web/staging",
  checkedAt: new Date(now).toISOString(),
  credentialExpiry: new Date(now + 3600_000).toISOString(),
  ownerApproval: true,
  checks: {
    connectivity: "PASS",
    authentication: "PASS",
    authorization: "PASS",
    providerStatus: "PASS",
    quota: "PASS",
    sourceBaseline: "PASS",
  },
});

test("valid trusted fresh evidence passes", () =>
  assert.equal(evaluatePreflight(clean(), now).light, "GREEN"));

for (const [name, modify] of [
  ["missing", (e) => { e.checks = undefined; }],
  ["expired", (e) => { e.credentialExpiry = new Date(now - 1000).toISOString(); }],
  ["unknown", (e) => { e.checks.authentication = "UNKNOWN"; }],
  ["blocked", (e) => { e.checks.authorization = "FAIL"; }],
  ["stale", (e) => { e.checkedAt = new Date(now - 3600_000).toISOString(); }],
  ["untrusted", (e) => { e.source = "ticket"; }],
  ["unapproved", (e) => { e.ownerApproval = false; }],
  ["provider-outage", (e) => { e.checks.providerStatus = "FAIL"; }],
  ["rate-limited", (e) => { e.checks.quota = "FAIL"; }],
  ["wrong-target", (e) => { e.target = ""; }],
])
  test(`${name} is red`, () => {
    const e = clean();
    modify(e);
    assert.equal(evaluatePreflight(e, now).decision, "PREFLIGHT_BLOCKED");
  });
