import { createHash, verify } from "node:crypto";

function decode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error("INVALID_ENCODING");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.toString("base64url") !== value) throw new Error("INVALID_ENCODING");
  return bytes;
}

// Isolated assertion verifier: caller must retrieve expected challenge and
// credential from a trusted server-side store. It does NOT issue approvals,
// enforce atomic challenge consumption, or replace a WebAuthn RP service.
export function verifyWebAuthnAssertion({
  clientDataJSON,
  authenticatorData,
  signature,
  challenge,
  origin,
  rpId,
  publicKey,
  previousCounter,
}) {
  try {
    if (
      !publicKey ||
      !Number.isSafeInteger(previousCounter) ||
      previousCounter < 0
    )
      return { verified: false, reason: "UNTRUSTED_CREDENTIAL" };
    const clientBytes = decode(clientDataJSON);
    const client = JSON.parse(clientBytes.toString("utf8"));
    if (
      client.type !== "webauthn.get" ||
      client.challenge !== challenge ||
      client.origin !== origin ||
      client.crossOrigin !== false
    )
      return { verified: false, reason: "CHALLENGE_OR_ORIGIN_MISMATCH" };
    const auth = decode(authenticatorData);
    if (auth.length < 37) return { verified: false, reason: "INVALID_AUTH_DATA" };
    const expectedHash = createHash("sha256").update(rpId).digest();
    if (!auth.subarray(0, 32).equals(expectedHash))
      return { verified: false, reason: "RP_MISMATCH" };
    // UP and UV must both be asserted. Backup flags and extension data are
    // not used as independent approval evidence.
    if ((auth[32] & 0x05) !== 0x05)
      return { verified: false, reason: "USER_VERIFICATION_MISSING" };
    const counter = auth.readUInt32BE(33);
    if (counter !== 0 && counter <= previousCounter)
      return { verified: false, reason: "COUNTER_ROLLBACK" };
    const digest = createHash("sha256").update(clientBytes).digest();
    if (
      !verify(
        "sha256",
        Buffer.concat([auth, digest]),
        publicKey,
        decode(signature)
      )
    )
      return { verified: false, reason: "INVALID_SIGNATURE" };
    return { verified: true, counter };
  } catch {
    return { verified: false, reason: "INVALID_ASSERTION" };
  }
}
