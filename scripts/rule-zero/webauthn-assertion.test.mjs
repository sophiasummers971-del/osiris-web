import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyWebAuthnAssertion } from "./webauthn-assertion.mjs";

const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const rpId = "osiris.example.test";
const origin = "https://osiris.example.test";
const challenge = "test_challenge_123";
function assertion(options = {}) {
  const data = {
    type: "webauthn.get",
    challenge,
    origin,
    crossOrigin: false,
    ...options.client,
  };
  const clientBytes = Buffer.from(JSON.stringify(data));
  const auth = Buffer.alloc(37);
  createHash("sha256")
    .update(options.rpId || rpId)
    .digest()
    .copy(auth);
  auth[32] = options.flags ?? 0x05;
  auth.writeUInt32BE(options.counter ?? 2, 33);
  const signature = sign(
    "sha256",
    Buffer.concat([auth, createHash("sha256").update(clientBytes).digest()]),
    options.key || privateKey
  );
  return {
    clientDataJSON: clientBytes.toString("base64url"),
    authenticatorData: auth.toString("base64url"),
    signature: signature.toString("base64url"),
    challenge,
    origin,
    rpId,
    publicKey,
    previousCounter: 1,
  };
}
test("valid signed assertion with user verification", () => {
  assert.deepEqual(verifyWebAuthnAssertion(assertion()), {
    verified: true,
    counter: 2,
  });
});
for (const [label, override] of [
  ["wrong challenge", { client: { challenge: "other" } }],
  ["wrong origin", { client: { origin: "https://attacker.test" } }],
  ["cross origin", { client: { crossOrigin: true } }],
  ["wrong relying party", { rpId: "attacker.test" }],
  ["only user presence", { flags: 0x01 }],
  ["counter rollback", { counter: 1 }],
]) {
  test(label + " rejects", () => {
    assert.equal(verifyWebAuthnAssertion(assertion(override)).verified, false);
  });
}
test("forged credential signature rejects", () => {
  const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  assert.equal(
    verifyWebAuthnAssertion(assertion({ key: other.privateKey })).verified,
    false
  );
});
test("malformed auth bytes reject", () => {
  const a = assertion();
  a.authenticatorData = Buffer.alloc(10).toString("base64url");
  assert.equal(verifyWebAuthnAssertion(a).verified, false);
});
