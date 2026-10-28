import { createHash, randomBytes, sign } from "node:crypto";
import { verifyProbeAttestation } from "./attestation.mjs";
import { evaluatePreflight } from "./preflight.mjs";

/**
 * Staging-only composition. Dependencies belong to the trusted host, never a job.
 * verifyOwnerApproval must authenticate the owner independently and return a
 * job-bound receipt: { approved, approvalId, jobId, target, commit, expiresAt }.
 * consumeNonce must atomically persist claims shared by ALL launcher instances.
 * A claimed job/approval is burned even if the runner subsequently fails.
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
    typeof launch !== "function" ||
    typeof clock !== "function"
  )
    throw new Error("RULE_ZERO_TRUSTED_HOST_NOT_CONFIGURED");

  return async function requestLaunch(input) {
    const deny = reason => ({
      decision: "PREFLIGHT_BLOCKED",
      light: "RED",
      reasons: [reason],
    });
    try {
      // Snapshot BEFORE any await. Neither caller mutations nor dependency
      // mutations may change what was probed, approved, or sent to the runner.
      const job = Object.freeze({
        id: input?.id,
        target: input?.target,
        commit: input?.commit,
      });
      if (
        typeof job.id !== "string" ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(job.id) ||
        typeof job.target !== "string" ||
        !/^[a-zA-Z0-9_./-]{3,160}$/.test(job.target) ||
        job.target
          .split("/")
          .some(part => !part || part === "." || part === "..") ||
        typeof job.commit !== "string" ||
        !/^[0-9a-f]{40}$/.test(job.commit)
      )
        return deny("INVALID_JOB");
      if (!Number.isFinite(clock())) return deny("INVALID_CLOCK");

      let evidence;
      try {
        evidence = await probe(job);
      } catch {
        return deny("PROBE_UNAVAILABLE");
      }
      if (
        !evidence ||
        evidence.jobId !== job.id ||
        evidence.target !== job.target ||
        evidence.commit !== job.commit
      )
        return deny("PROBE_CONTEXT_MISMATCH");
      // Preserve the observation time and commit. Signing must never turn a
      // cached observation or a different source baseline into fresh evidence.
      const payload = JSON.stringify({
        ...evidence,
        source: "trusted-runner",
        ownerApproval: false,
        jobId: job.id,
        target: job.target,
        commit: job.commit,
        nonce: randomBytes(24).toString("hex"),
      });
      let signature;
      try {
        signature = sign(null, Buffer.from(payload), signingKey).toString(
          "base64"
        );
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
      if (
        result.light !== "RED" ||
        result.reasons.length !== 1 ||
        result.reasons[0] !== "OWNER_APPROVAL_MISSING"
      )
        return result;

      let approval;
      try {
        approval = await verifyOwnerApproval(job);
      } catch {
        return deny("APPROVAL_SERVICE_UNAVAILABLE");
      }
      if (!approval || approval.approved !== true)
        return deny("OWNER_APPROVAL_MISSING");
      const approved = Object.freeze({
        approvalId: approval.approvalId,
        jobId: approval.jobId,
        target: approval.target,
        commit: approval.commit,
        expiresAt: approval.expiresAt,
      });
      if (
        approved.jobId !== job.id ||
        approved.target !== job.target ||
        approved.commit !== job.commit ||
        typeof approved.approvalId !== "string" ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(approved.approvalId) ||
        typeof approved.expiresAt !== "string" ||
        !Number.isFinite(Date.parse(approved.expiresAt))
      )
        return deny("APPROVAL_CONTEXT_MISMATCH");

      const recheck = () => {
        const now = clock();
        const current = evaluatePreflight(
          { ...JSON.parse(payload), ownerApproval: true },
          now
        );
        if (current.light !== "GREEN") return current;
        if (Date.parse(approved.expiresAt) <= now)
          return deny("OWNER_APPROVAL_EXPIRED");
        return null;
      };
      let blocked = recheck();
      if (blocked) return blocked;
      try {
        // Global namespaces prevent cross-job approval reuse and same-job
        // relaunch, including across processes sharing the durable store.
        for (const claim of [
          `approval:${approved.approvalId}`,
          `job:${job.id}`,
        ]) {
          const nonce = createHash("sha256").update(claim).digest("hex");
          if ((await consumeNonce(nonce, "rule_zero_launch")) !== true)
            return deny("REPLAY_OR_NONCE_STORE_UNAVAILABLE");
        }
      } catch {
        return deny("REPLAY_OR_NONCE_STORE_UNAVAILABLE");
      }
      // Approval service and replay persistence may both have taken time.
      blocked = recheck();
      if (blocked) return blocked;
      try {
        const receipt = await launch(job);
        if (
          !receipt ||
          typeof receipt.runId !== "string" ||
          !receipt.runId ||
          receipt.jobId !== job.id ||
          receipt.target !== job.target ||
          receipt.commit !== job.commit
        )
          return deny("RUN_RECEIPT_MISSING_OR_MISMATCHED");
        return { light: "GREEN", decision: "LAUNCHED", runId: receipt.runId };
      } catch {
        return deny("LAUNCH_FAILED");
      }
    } catch {
      return deny("TRUSTED_HOST_FAILURE");
    }
  };
}
