/** Rule Zero decision engine. Input is a trusted runner's probe result, never a user ticket. */
const required = [
  "connectivity",
  "authentication",
  "authorization",
  "providerStatus",
  "quota",
  "sourceBaseline",
];
const allowed = new Set(["PASS", "FAIL", "UNKNOWN"]);

export function evaluatePreflight(evidence, now = Date.now()) {
  const reasons = [];
  if (!Number.isFinite(now))
    return {
      light: "RED",
      decision: "PREFLIGHT_BLOCKED",
      reasons: ["INVALID_CLOCK"],
    };
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence))
    return {
      light: "RED",
      decision: "PREFLIGHT_BLOCKED",
      reasons: ["MISSING_EVIDENCE"],
    };
  if (evidence.source !== "trusted-runner") reasons.push("UNTRUSTED_SOURCE");
  if (
    typeof evidence.jobId !== "string" ||
    !/^[a-zA-Z0-9_-]{8,128}$/.test(evidence.jobId)
  )
    reasons.push("INVALID_JOB_ID");
  if (
    typeof evidence.target !== "string" ||
    !/^[a-zA-Z0-9_./-]{3,160}$/.test(evidence.target)
  )
    reasons.push("INVALID_TARGET");
  if (
    typeof evidence.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(evidence.checkedAt))
  )
    reasons.push("INVALID_TIMESTAMP");
  else {
    const delta = now - Date.parse(evidence.checkedAt);
    if (delta < -30_000 || delta > 5 * 60_000) reasons.push("STALE_EVIDENCE");
  }
  for (const name of required)
    if (!allowed.has(evidence.checks?.[name]))
      reasons.push(`INVALID_${name.toUpperCase()}`);
  for (const name of required)
    if (evidence.checks?.[name] !== "PASS")
      reasons.push(`NOT_PASSED_${name.toUpperCase()}`);
  {
    const expires =
      typeof evidence.credentialExpiry === "string"
        ? Date.parse(evidence.credentialExpiry)
        : NaN;
    if (!Number.isFinite(expires) || expires <= now + 60_000)
      reasons.push("EXPIRED_OR_UNKNOWN_AUTH");
  }
  if (evidence.ownerApproval !== true) reasons.push("OWNER_APPROVAL_MISSING");
  return reasons.length
    ? {
        light: "RED",
        decision: "PREFLIGHT_BLOCKED",
        reasons: [...new Set(reasons)],
      }
    : { light: "GREEN", decision: "PREFLIGHT_PASS", reasons: [] };
}
