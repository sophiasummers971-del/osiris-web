import { randomBytes, sign } from "node:crypto";
import { verifyProbeAttestation } from "./attestation.mjs";

/**
 * Staging-only composition. Dependencies must be supplied by the trusted host,
 * NOT by a job payload. No default private keys or in-memory replay fallback.
 */
export function createRuleZeroLauncher({
  signingKey,
  pinnedPublicKey,
  probe,
  consumeNonce,
  verifyOwnerApproval,
  launch,
  clock = Date.now,
}) {
  if (
    !signingKey ||
    !pinnedPublicKey ||
    typeof probe !== "function" ||
    typeof consumeNonce !== "function" ||
    typeof verifyOwnerApproval !== "function" ||
    typeof launch !== "function"
  ) {
    throw new Error("RULE_ZERO_TRUSTED_HOST_NOT_CONFIGURED");
  }

  return async function requestLaunch(job) {
    const deny = (reason) => ({
      decision: "PREFLIGHT_BLOCKED",
      light: "RED",
      reasons: [reason],
    });
    if (
      !job ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(job.id ?? "") ||
      !/^[a-zA-Z0-9_./-]{3,160}$/.test(job.target ?? "") ||
      !/^[0-9a-f]{40}$/.test(job.commit ?? "")
    ) {
      return deny("INVALID_JOB");
    }

    let evidence;
    try {
      evidence = await probe({
        id: job.id,
        target: job.target,
        commit: job.commit,
      });
    } catch {
      return deny("PROBE_UNAVAILABLE");
    }
    // The host-owned probe must provide verified checks, not ticket fields.
    if (!evidence || evidence.jobId !== job.id || evidence.target !== job.target) {
      return deny("PROBE_CONTEXT_MISMATCH");
    }
    const payload = JSON.stringify({
      ...evidence,
      source: "trusted-runner",
      ownerApproval: false,
      jobId: job.id,
      target: job.target,
      commit: job.commit,
      checkedAt: new Date(clock()).toISOString(),
      nonce: randomBytes(24).toString("hex"),
    });
    let signature;
    try {
      signature = sign(null, Buffer.from(payload), signingKey).toString("base64");
    } catch {
      return deny("SIGNER_UNAVAILABLE");
    }

    const result = await verifyProbeAttestation({
      envelope: { payload, signature },
      trustedPublicKey: pinnedPublicKey,
      expectedJobId: job.id,
      expectedTarget: job.target,
      expectedCommit: job.commit,
      consumeNonce,
      now: clock(),
    });
    // Exactly one missing gate is acceptable here: owner approval.
    // Every other evidence failure is always RED.
    if (
      result.light !== "RED" ||
      result.reasons.length !== 1 ||
      result.reasons[0] !== "OWNER_APPROVAL_MISSING"
    ) {
      return result;
    }
    let approved = false;
    try {
      approved = (await verifyOwnerApproval({
        id: job.id,
        target: job.target,
        commit: job.commit,
      })) === true;
    } catch {
      return deny("APPROVAL_SERVICE_UNAVAILABLE");
    }
    if (!approved) return deny("OWNER_APPROVAL_MISSING");
    try {
      const receipt = await launch({
        id: job.id,
        target: job.target,
        commit: job.commit,
      });
      if (!receipt || typeof receipt.runId !== "string" || !receipt.runId) {
        return deny("RUN_RECEIPT_MISSING");
      }
      return { light: "GREEN", decision: "LAUNCHED", runId: receipt.runId };
    } catch {
      return deny("LAUNCH_FAILED");
    }
  };
}
