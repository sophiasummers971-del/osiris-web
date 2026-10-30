/**
 * Non-production swarm admission facade.
 * This is an admission layer, NOT a sandbox or a replacement for the
 * host-owned Rule Zero launch gate. No direct worker/agent handles are exposed.
 * Audit must return exactly true only after persisting the record. Concurrency
 * counts in-flight submissions; deduplication lasts this facade instance.
 * Neither is distributed or a count of live agents.
 */
export function createSwarmAdmission({
  requestLaunch,
  allowedTargets,
  maxConcurrent = 2,
  audit,
}) {
  if (
    typeof requestLaunch !== "function" ||
    typeof audit !== "function" ||
    !(allowedTargets instanceof Set) ||
    !allowedTargets.size ||
    !Number.isSafeInteger(maxConcurrent) ||
    maxConcurrent < 1 ||
    maxConcurrent > 16
  ) {
    throw new Error("SWARM_HOST_NOT_CONFIGURED");
  }
  const targets = new Set(allowedTargets);
  if (
    [...targets].some(
      target =>
        typeof target !== "string" ||
        !/^[a-zA-Z0-9_./-]{3,160}$/.test(target) ||
        target.split("/").some(part => !part || part === "." || part === "..")
    )
  )
    throw new Error("SWARM_HOST_NOT_CONFIGURED");
  let active = 0;
  const admitted = new Set();
  const uncertain = reason => ({
    light: "RED",
    decision: "EFFECT_UNKNOWN_RECONCILE",
    reasons: [reason],
  });
  const deny = reason => ({
    light: "RED",
    decision: "PREFLIGHT_BLOCKED",
    reasons: [reason],
  });
  return Object.freeze({
    getActiveCount: () => active,
    async submit(input) {
      // Snapshot before any await: mutable caller input is never trusted.
      let job;
      try {
        job = Object.freeze({
          id: input?.id,
          target: input?.target,
          commit: input?.commit,
        });
      } catch {
        return deny("SWARM_SCOPE_DENIED");
      }
      if (
        typeof job.id !== "string" ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(job.id) ||
        !targets.has(job.target) ||
        typeof job.commit !== "string" ||
        !/^[0-9a-f]{40}$/.test(job.commit)
      )
        return deny("SWARM_SCOPE_DENIED");
      if (admitted.has(job.id)) return deny("SWARM_JOB_ALREADY_ADMITTED");
      if (active >= maxConcurrent) return deny("SWARM_CONCURRENCY_LIMIT");

      // Reserve before awaits; do not turn audit outages into permitted work.
      admitted.add(job.id);
      active++;
      let dispatchAttempted = false;
      try {
        if (
          (await audit(
            Object.freeze({ event: "ADMISSION_ATTEMPT", ...job })
          )) !== true
        )
          return deny("SWARM_GATE_OR_AUDIT_UNAVAILABLE");
        // Snapshot and whitelist result fields before awaiting any audit sink.
        // Returning the host's original object could expose capabilities or
        // let another reference rewrite a verified RED decision into GREEN.
        dispatchAttempted = true;
        const raw = await requestLaunch(job);
        if (!raw) return uncertain("RUNNER_RESULT_UNAVAILABLE");
        const { decision, light, runId, reasons } = raw;
        if (
          reasons !== undefined &&
          (!Array.isArray(reasons) ||
            reasons.some(reason => typeof reason !== "string"))
        )
          return uncertain("INVALID_LAUNCHER_RESULT");
        const result = Object.freeze(
          decision === "LAUNCHED"
            ? { decision, light, runId }
            : { decision, light, reasons: Object.freeze([...(reasons ?? [])]) }
        );
        if (
          !result ||
          (result.decision !== "LAUNCHED" &&
            result.decision !== "PREFLIGHT_BLOCKED") ||
          (result.decision === "LAUNCHED" &&
            (result.light !== "GREEN" ||
              typeof result.runId !== "string" ||
              !result.runId)) ||
          (result.decision === "PREFLIGHT_BLOCKED" && result.light !== "RED")
        )
          return uncertain("INVALID_LAUNCHER_RESULT");
        if (
          (await audit(
            Object.freeze({
              event: result.decision,
              ...job,
              runId: result.decision === "LAUNCHED" ? result.runId : null,
            })
          )) !== true
        )
          return uncertain("POST_DISPATCH_AUDIT_UNAVAILABLE");
        return result;
      } catch {
        return dispatchAttempted
          ? uncertain("RUNNER_OR_AUDIT_OUTCOME_UNKNOWN")
          : deny("SWARM_GATE_OR_AUDIT_UNAVAILABLE");
      } finally {
        active--;
      }
    },
  });
}
