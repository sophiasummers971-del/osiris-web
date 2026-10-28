import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { createRuleZeroLauncher } from "./launcher.mjs";

const keys = generateKeyPairSync("ed25519");
const job = {
  id: "job_12345678",
  target: "osiris-web/staging",
  commit: "a".repeat(40),
};
const now = Date.parse("2026-10-28T22:00:00Z");
const checks = {
  connectivity: "PASS",
  authentication: "PASS",
  authorization: "PASS",
  providerStatus: "PASS",
  quota: "PASS",
  sourceBaseline: "PASS",
};

function harness(overrides = {}) {
  let launches = 0;
  const deps = {
    signingKey: keys.privateKey,
    pinnedPublicKey: keys.publicKey,
    clock: () => now,
    probe: async () => ({
      jobId: job.id,
      target: job.target,
      commit: job.commit,
      checkedAt: new Date(now).toISOString(),
      checks,
      credentialExpiry: new Date(now + 3_600_000).toISOString(),
    }),
    consumeNonce: async () => true,
    verifyOwnerApproval: async () => ({
      approved: true,
      approvalId: "approval_12345678",
      jobId: job.id,
      target: job.target,
      commit: job.commit,
      expiresAt: new Date(now + 60000).toISOString(),
    }),
    launch: async () => {
      launches++;
      return {
        runId: "run_12345",
        jobId: job.id,
        target: job.target,
        commit: job.commit,
      };
    },
    ...overrides,
  };
  return {
    run: createRuleZeroLauncher(deps),
    launchCount: () => launches,
  };
}

test("fully approved verified job starts once", async () => {
  const h = harness();
  assert.equal((await h.run(job)).decision, "LAUNCHED");
  assert.equal(h.launchCount(), 1);
});
test("missing owner approval blocks launcher", async () => {
  const h = harness({ verifyOwnerApproval: async () => false });
  assert.equal((await h.run(job)).light, "RED");
  assert.equal(h.launchCount(), 0);
});
test("unknown auth blocks launcher", async () => {
  const h = harness({
    probe: async () => ({
      jobId: job.id,
      target: job.target,
      commit: job.commit,
      checkedAt: new Date(now).toISOString(),
      checks: { ...checks, authentication: "UNKNOWN" },
      credentialExpiry: new Date(now + 3600000).toISOString(),
    }),
  });
  assert.equal((await h.run(job)).decision, "PREFLIGHT_BLOCKED");
  assert.equal(h.launchCount(), 0);
});
test("unavailable replay store blocks launcher", async () => {
  const h = harness({
    consumeNonce: async () => {
      throw Error("store down");
    },
  });
  assert.equal((await h.run(job)).light, "RED");
  assert.equal(h.launchCount(), 0);
});
test("wrong key blocks launcher", async () => {
  const other = generateKeyPairSync("ed25519");
  const h = harness({ pinnedPublicKey: other.publicKey });
  assert.equal((await h.run(job)).light, "RED");
  assert.equal(h.launchCount(), 0);
});
test("invalid job never probes or launches", async () => {
  const h = harness({
    probe: () => {
      throw Error("must not probe");
    },
  });
  assert.equal((await h.run({ ...job, commit: "bad" })).light, "RED");
  assert.equal(h.launchCount(), 0);
});
