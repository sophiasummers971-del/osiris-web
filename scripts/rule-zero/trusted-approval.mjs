import { readSigned } from "./plan-y.mjs";

// Staging-only receipt gate. Human verification and receipt issuance are external.
// A signed claim is not proof that any WebAuthn ceremony actually took place.
export function createTrustedApprovalGate({ authorityKey, consumeOnce, clock = Date.now }) {
  if (!authorityKey || typeof consumeOnce !== "function" || typeof clock !== "function")
    throw new Error("APPROVAL_HOST_NOT_CONFIGURED");
  return async function verifyApproval({ envelope, expected }) {
    const deny = reason => Object.freeze({ approved: false, reason });
    try {
      const receipt = readSigned(envelope, authorityKey);
      const fields = ["schema", "approvalId", "jobId", "planHash", "ownerId", "tenantId", "challengeId", "issuedAt", "expiresAt", "ceremonyVerified"];
      if (Object.keys(receipt).sort().join("|") !== fields.sort().join("|") ||
          receipt.schema !== "osiris.human-job-approval/v1" || receipt.ceremonyVerified !== true)
        return deny("INVALID_APPROVAL_RECEIPT");
      for (const key of ["approvalId", "jobId", "ownerId", "tenantId", "challengeId"])
        if (typeof receipt[key] !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(receipt[key]))
          return deny("INVALID_APPROVAL_RECEIPT");
      if (typeof receipt.planHash !== "string" || !/^[a-f0-9]{64}$/.test(receipt.planHash))
        return deny("INVALID_APPROVAL_RECEIPT");
      if (!expected || ["jobId", "planHash", "ownerId", "tenantId", "challengeId"].some(key => receipt[key] !== expected[key]))
        return deny("APPROVAL_CONTEXT_MISMATCH");
      const now = clock(), issued = Date.parse(receipt.issuedAt), expires = Date.parse(receipt.expiresAt);
      if (![now, issued, expires].every(Number.isFinite) || issued > now || expires <= now ||
          expires <= issued || expires - issued > 120000)
        return deny("APPROVAL_EXPIRED_OR_INVALID");
      // Host must supply durable atomic consume; process-local Set is test-only.
      const claim = `${receipt.tenantId}:${receipt.jobId}:${receipt.approvalId}:${receipt.challengeId}`;
      if (await consumeOnce(claim) !== true) return deny("APPROVAL_REPLAY_OR_STORE_UNAVAILABLE");
      return Object.freeze({ approved: true, approvalId: receipt.approvalId, jobId: receipt.jobId, planHash: receipt.planHash });
    } catch {
      return deny("APPROVAL_INVALID_OR_UNAVAILABLE");
    }
  };
}
