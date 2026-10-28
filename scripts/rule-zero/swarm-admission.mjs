/**
 * Non-production swarm admission facade.
 * This is an admission layer, NOT a sandbox or a replacement for the
 * host-owned Rule Zero launch gate. No direct worker/agent handles are exposed.
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
  let active = 0;
  const admitted = new Set();
  const deny = reason => ({
    light: "RED",
    decision: "PREFLIGHT_BLOCKED",
    reasons: [reason],
  });
  return Object.freeze({
    getActiveCount: () => active,
    async submit(input) {
      // Snapshot before any await: mutable caller input is never trusted.
      const job = Object.freeze({
        id: input?.id,
        target: input?.target,
        commit: input?.commit,
      });
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
      try {
        await audit({ event: "ADMISSION_ATTEMPT", ...job });
        const result = await requestLaunch(job);
        if (
          !result ||
          (result.decision !== "LAUNCHED" &&
            result.decision !== "PREFLIGHT_BLOCKED") ||
          (result.decision === "LAUNCHED" &&
            (result.light !== "GREEN" ||
              typeof result.runId !== "string" ||
              !result.runId)) ||
          (result.decision === "PREFLIGHT_BLOCKED" &&
            result.light !== "RED")
        )
          return deny("INVALID_LAUNCHER_RESULT");
        await audit({
          event: result.decision,
          ...job,
          runId: result.decision === "LAUNCHED" ? result.runId : null,
        });
        return result;
      } catch {
        return deny("SWARM_GATE_OR_AUDIT_UNAVAILABLE");
      } finally {
        active--;
      }
    },
  });
}
