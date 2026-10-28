import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { verifyProbeAttestation } from "./attestation.mjs";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const { publicKey: otherKey, privateKey: otherPrivate } = generateKeyPairSync("ed25519");
const now = Date.parse("2026-10-28T22:00:00Z");
const commit = "a".repeat(40);
const make = (overrides = {}, signer = privateKey) => {
  const payload = JSON.stringify({
    source: "trusted-runner",
    jobId: "job_12345678",
    target: "osiris-web/staging",
    commit,
    nonce: randomBytes(16).toString("hex"),
    checkedAt: new Date(now).toISOString(),
    credentialExpiry: new Date(now + 3_600_000).toISOString(),
    checks: {
      connectivity: "PASS",
      authentication: "PASS",
      authorization: "PASS",
      providerStatus: "PASS",
      quota: "PASS",
      sourceBaseline: "PASS",
    },
    ...overrides,
  });
  return {
    payload,
    signature: sign(null, Buffer.from(payload), signer).toString("base64"),
  };
};
const opts = () => ({
  trustedPublicKey: publicKey.export({ type: "spki", format: "pem" }),
  expectedJobId: "job_12345678",
  expectedTarget: "osiris-web/staging",
  expectedCommit: commit,
  now,
  consumeNonce: async () => true,
});

test("authentic probe remains red until independent owner approval", async () => {
  const result = await verifyProbeAttestation({ ...opts(), envelope: make() });
  assert.equal(result.decision, "PREFLIGHT_BLOCKED");
  assert.ok(result.reasons.includes("OWNER_APPROVAL_MISSING"));
});
test("forged signature is rejected", async () => {
  const result = await verifyProbeAttestation({
    ...opts(),
    envelope: make({}, otherPrivate),
  });
  assert.deepEqual(result.reasons, ["INVALID_SIGNATURE"]);
});
test("tampering with signed payload is rejected", async () => {
  const envelope = make();
  envelope.payload = envelope.payload.replace("osiris-web", "other-web");
  const result = await verifyProbeAttestation({ ...opts(), envelope });
  assert.deepEqual(result.reasons, ["INVALID_SIGNATURE"]);
});
test("wrong job identity is rejected", async () => {
  const result = await verifyProbeAttestation({
    ...opts(),
    envelope: make({ jobId: "job_other123" }),
  });
  assert.deepEqual(result.reasons, ["CONTEXT_MISMATCH"]);
});
test("wrong source commit is rejected", async () => {
  const result = await verifyProbeAttestation({
    ...opts(),
    envelope: make({ commit: "b".repeat(40) }),
  });
  assert.deepEqual(result.reasons, ["CONTEXT_MISMATCH"]);
});
test("replay or unavailable nonce store fails closed", async () => {
  const result = await verifyProbeAttestation({
    ...opts(),
    consumeNonce: async () => false,
    envelope: make(),
  });
  assert.deepEqual(result.reasons, ["REPLAY_OR_NONCE_STORE_UNAVAILABLE"]);
});
test("stale signed probe fails closed", async () => {
  const result = await verifyProbeAttestation({
    ...opts(),
    envelope: make({ checkedAt: new Date(now - 900_000).toISOString() }),
  });
  assert.deepEqual(result.reasons, ["STALE_ATTESTATION"]);
});
test("ownerApproval in signed provider data cannot authorize execution", async () => {
  const result = await verifyProbeAttestation({
    ...opts(),
    envelope: make({ ownerApproval: true }),
  });
  assert.ok(result.reasons.includes("OWNER_APPROVAL_MISSING"));
});
test("key type and missing replay guard fail closed", async () => {
  const result = await verifyProbeAttestation({
    ...opts(),
    consumeNonce: undefined,
    envelope: make(),
  });
  assert.deepEqual(result.reasons, ["INVALID_ATTESTATION_CONFIG"]);
});
