import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJSON } from "./plan-y.mjs";
import { createTrustedApprovalGate } from "./trusted-approval.mjs";

const keys = generateKeyPairSync("ed25519");
const wrong = generateKeyPairSync("ed25519");
const now = Date.parse("2026-10-30T17:00:00Z");
const original = {
  schema: "osiris.human-job-approval/v1",
  approvalId: "approval_12345",
  jobId: "job_12345678",
  planHash: "a".repeat(64),
  ownerId: "owner_12345",
  tenantId: "tenant_12345",
  challengeId: "challenge_12345",
  issuedAt: new Date(now - 1000).toISOString(),
  expiresAt: new Date(now + 60000).toISOString(),
  ceremonyVerified: true,
};
const expected = Object.fromEntries(
  ["jobId", "planHash", "ownerId", "tenantId", "challengeId"].map(k => [
    k,
    original[k],
  ])
);
function signed(value = original, key = keys.privateKey) {
  const payload = canonicalJSON(value);
  return {
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  };
}
function harness() {
  const used = new Set();
  let claims = 0;
  return {
    gate: createTrustedApprovalGate({
      authorityKey: keys.publicKey,
      clock: () => now,
      consumeOnce: async key => {
        claims++;
        if (used.has(key)) return false;
        used.add(key);
        return true;
      },
    }),
    claims: () => claims,
  };
}
test("approved signed receipt admits once and rejects replay", async () => {
  const h = harness();
  assert.equal((await h.gate({ envelope: signed(), expected })).approved, true);
  assert.equal(
    (await h.gate({ envelope: signed(), expected })).approved,
    false
  );
  assert.equal(h.claims(), 2);
});
for (const [name, field, value] of [
  ["plan", "planHash", "b".repeat(64)],
  ["owner", "ownerId", "different_owner"],
  ["tenant", "tenantId", "different_tenant"],
  ["job", "jobId", "different_job1"],
  ["challenge", "challengeId", "different_challenge"],
])
  test(`changed ${name} denied before claim`, async () => {
    const h = harness();
    assert.equal(
      (
        await h.gate({
          envelope: signed({ ...original, [field]: value }),
          expected,
        })
      ).approved,
      false
    );
    assert.equal(h.claims(), 0);
  });
test("forged signature denied", async () => {
  const h = harness();
  assert.equal(
    (await h.gate({ envelope: signed(original, wrong.privateKey), expected }))
      .approved,
    false
  );
  assert.equal(h.claims(), 0);
});
test("no ceremony verification denied", async () => {
  const h = harness();
  assert.equal(
    (
      await h.gate({
        envelope: signed({ ...original, ceremonyVerified: false }),
        expected,
      })
    ).approved,
    false
  );
  assert.equal(h.claims(), 0);
});
test("expired receipt denied", async () => {
  const h = harness();
  assert.equal(
    (
      await h.gate({
        envelope: signed({
          ...original,
          expiresAt: new Date(now - 1).toISOString(),
        }),
        expected,
      })
    ).approved,
    false
  );
  assert.equal(h.claims(), 0);
});
test("claim store unavailable denies", async () => {
  const gate = createTrustedApprovalGate({
    authorityKey: keys.publicKey,
    clock: () => now,
    consumeOnce: async () => {
      throw Error("offline");
    },
  });
  assert.equal((await gate({ envelope: signed(), expected })).approved, false);
});
