import { createPublicKey, verify } from "node:crypto";
import { evaluatePreflight } from "./preflight.mjs";

/**
 * Verifies a signed probe attestation against a runner key pinned by the host.
 * The untrusted job must never control the pinned public key or verifier context.
 * This is NOT an execution authorization: explicit owner approval is a separate gate.
 */
export async function verifyProbeAttestation({
  envelope,
  trustedPublicKey,
  expectedJobId,
  expectedTarget,
  expectedCommit,
  consumeNonce,
  now = Date.now(),
}) {
  const blocked = (reason) => ({
    light: "RED",
    decision: "PREFLIGHT_BLOCKED",
    reasons: [reason],
  });
  if (
    !envelope ||
    typeof envelope !== "object" ||
    typeof envelope.payload !== "string" ||
    typeof envelope.signature !== "string" ||
    !trustedPublicKey ||
    typeof consumeNonce !== "function"
  )
    return blocked("INVALID_ATTESTATION_CONFIG");
  if (
    typeof expectedJobId !== "string" ||
    typeof expectedTarget !== "string" ||
    typeof expectedCommit !== "string" ||
    !/^[0-9a-f]{40}$/.test(expectedCommit)
  )
    return blocked("INVALID_EXPECTED_CONTEXT");

  let verified = false;
  try {
    const key = createPublicKey(trustedPublicKey);
    if (key.asymmetricKeyType !== "ed25519")
      return blocked("UNSUPPORTED_SIGNATURE_KEY");
    const signature = Buffer.from(envelope.signature, "base64");
    if (signature.length !== 64 || signature.toString("base64") !== envelope.signature)
      return blocked("INVALID_SIGNATURE_ENCODING");
    verified = verify(null, Buffer.from(envelope.payload, "utf8"), key, signature);
  } catch {
    return blocked("INVALID_SIGNATURE");
  }
  if (!verified) return blocked("INVALID_SIGNATURE");

  let evidence;
  try {
    evidence = JSON.parse(envelope.payload);
  } catch {
    return blocked("INVALID_PAYLOAD");
  }
  if (
    evidence?.jobId !== expectedJobId ||
    evidence?.target !== expectedTarget ||
    evidence?.commit !== expectedCommit ||
    typeof evidence.nonce !== "string" ||
    !/^[a-f0-9]{32,64}$/.test(evidence.nonce)
  )
    return blocked("CONTEXT_MISMATCH");
  if (!Number.isFinite(Date.parse(evidence.checkedAt)))
    return blocked("INVALID_TIMESTAMP");
  const delta = now - Date.parse(evidence.checkedAt);
  if (delta < -30_000 || delta > 5 * 60_000)
    return blocked("STALE_ATTESTATION");
  try {
    if ((await consumeNonce(evidence.nonce, expectedJobId)) !== true)
      return blocked("REPLAY_OR_NONCE_STORE_UNAVAILABLE");
  } catch {
    return blocked("REPLAY_OR_NONCE_STORE_UNAVAILABLE");
  }
  // Signed observations are necessary but insufficient. Owner approval must
  // be independently verified and cannot come from this probe attestation.
  return evaluatePreflight({ ...evidence, ownerApproval: false }, now);
}
