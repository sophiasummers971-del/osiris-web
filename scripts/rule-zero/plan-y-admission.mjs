import { createHash } from "node:crypto";
import { createSwarmAdmission } from "./swarm-admission.mjs";
import {
  verifyAgentContract,
  pinnedEd25519Key,
  publicKeyFingerprint,
  readSigned,
  checkLifetime,
} from "./plan-y.mjs";

const deny = (reason, revoke = false) =>
  Object.freeze({
    light: "RED",
    decision: "PREFLIGHT_BLOCKED",
    reasons: Object.freeze([reason]),
    signals: Object.freeze(revoke ? ["DENY", "REVOKE"] : ["DENY"]),
  });
const digest = text => createHash("sha256").update(text).digest("hex");
const envelope = input =>
  Object.freeze({ payload: input?.payload, signature: input?.signature });
const exact = (value, keys) =>
  value && Object.keys(value).sort().join(",") === [...keys].sort().join(",");

/** Synthetic staging gate only. Host owns pins, admission, storage and callbacks.
 * Contract/agent/step claims are single use and burned on failure. Approval may
 * authorize multiple distinct plan steps. No agent replacement or process kill.
 */
export function createPlanYAdmission({
  authorityKey,
  contractKey,
  agentKeys,
  context,
  allowedTargets,
  requestLaunch,
  audit,
  consumeNonce,
  executeSyntheticAction,
  clock = Date.now,
}) {
  if (
    typeof requestLaunch !== "function" ||
    typeof audit !== "function" ||
    typeof consumeNonce !== "function" ||
    typeof executeSyntheticAction !== "function" ||
    typeof clock !== "function" ||
    !(agentKeys instanceof Map) ||
    !agentKeys.size
  )
    throw new Error("PLAN_Y_HOST_NOT_CONFIGURED");
  const pins = {
    authorityKey: pinnedEd25519Key(authorityKey),
    contractKey: pinnedEd25519Key(contractKey),
  };
  const identity = Object.freeze({
    taskId: context?.taskId,
    ownerId: context?.ownerId,
    tenantId: context?.tenantId,
  });
  if (
    Object.values(identity).some(
      v => typeof v !== "string" || !/^[A-Za-z0-9_-]{1,96}$/.test(v)
    )
  )
    throw new Error("PLAN_Y_HOST_NOT_CONFIGURED");
  const agents = new Map(),
    fingerprints = new Set();
  for (const [name, key] of agentKeys) {
    if (!/^NR-[0-9]{5}$/.test(name)) throw new Error("INVALID_AGENT_ID");
    const pin = pinnedEd25519Key(key),
      fingerprint = publicKeyFingerprint(pin);
    if (fingerprints.has(fingerprint)) throw new Error("AGENT_KEY_REUSED");
    fingerprints.add(fingerprint);
    agents.set(name, pin);
  }
  const states = new Map(),
    jobs = new Map();
  const verifyBundle = bundle =>
    verifyAgentContract({
      ...bundle,
      ...pins,
      agentKeys: agents,
      context: identity,
      now: clock(),
    });
  const claim = async (namespace, value) =>
    (await consumeNonce(digest(value), namespace)) === true;
  const revoked = (state, reason) => {
    state.status = "REVOKED";
    return deny(reason, true);
  };
  const stillValid = state => {
    if (state.status === "REVOKED") throw new Error("CONTRACT_REVOKED");
    verifyBundle(state.bundle);
    if (state.status === "PENDING")
      checkLifetime(
        state.admissionRequest,
        clock(),
        Date.parse(state.verified.contract.expiresAt)
      );
  };
  const facade = createSwarmAdmission({
    allowedTargets,
    maxConcurrent: 2,
    audit: async record => {
      const state = jobs.get(record.id);
      if (!state) return false;
      const c = state.verified.contract;
      return audit(
        Object.freeze({
          ...record,
          planHash: state.verified.hash,
          contractId: c.contractId,
          agentId: c.agentId,
          stepId: c.stepId,
        })
      );
    },
    requestLaunch: async job => {
      const state = jobs.get(job.id);
      if (!state || state.status !== "PENDING")
        return deny("CONTRACT_NOT_PENDING");
      try {
        stillValid(state);
      } catch {
        return revoked(state, "APPROVAL_OR_CONTRACT_INVALID");
      }
      return requestLaunch(job);
    },
  });
  function checkRequest(value, verified, schema, keys) {
    const c = verified.contract;
    if (
      !exact(value, keys) ||
      value.schema !== schema ||
      value.agentId !== c.agentId ||
      value.contractId !== c.contractId ||
      value.contractHash !== verified.contractHash ||
      value.planHash !== verified.hash ||
      value.planVersion !== c.planVersion ||
      value.stepId !== c.stepId ||
      ["taskId", "ownerId", "tenantId"].some(k => value[k] !== identity[k]) ||
      typeof value.nonce !== "string" ||
      !/^[a-f0-9]{32,64}$/.test(value.nonce)
    )
      throw new Error("AGENT_REQUEST_MISMATCH");
    checkLifetime(value, clock(), Date.parse(c.expiresAt));
    if (Date.parse(value.expiresAt) - Date.parse(value.issuedAt) > 300000)
      throw new Error("REQUEST_LIFETIME_TOO_LONG");
  }
  const requestFields = [
    "schema",
    "agentId",
    "contractId",
    "contractHash",
    "planHash",
    "planVersion",
    "stepId",
    "taskId",
    "ownerId",
    "tenantId",
    "nonce",
    "issuedAt",
    "expiresAt",
  ];
  return Object.freeze({
    getContractState: contractId => states.get(contractId)?.status ?? "UNKNOWN",
    async submit(input) {
      let state;
      try {
        const bundle = Object.freeze({
          planJson: input?.planJson,
          approvalEnvelope: envelope(input?.approvalEnvelope),
          contractEnvelope: envelope(input?.contractEnvelope),
        });
        const requestEnvelope = envelope(input?.requestEnvelope);
        const verified = verifyBundle(bundle),
          c = verified.contract;
        // Recording a DAG is not evidence its prerequisites completed.
        if (verified.step.dependencies.length)
          return deny("DEPENDENCY_EVIDENCE_UNSUPPORTED");
        const request = readSigned(requestEnvelope, agents.get(c.agentId));
        checkRequest(
          request,
          verified,
          "osiris.agent-admission/v1",
          requestFields
        );
        if (states.has(c.contractId) || jobs.has(c.jobId))
          return deny("DUPLICATE_CONTRACT_OR_JOB");
        state = {
          status: "PENDING",
          bundle,
          verified,
          admissionRequest: request,
          used: { calls: 0, tokens: 0, costMicros: 0 },
        };
        states.set(c.contractId, state);
        jobs.set(c.jobId, state); // Reserve before awaits.
        for (const [namespace, value] of [
          ["plan_y_contract", `${identity.tenantId}:${c.contractId}`],
          ["plan_y_agent", `${verified.hash}:${c.agentId}`],
          ["plan_y_step", `${verified.hash}:${c.stepId}`],
        ])
          if (!(await claim(namespace, value)))
            return revoked(state, "DUPLICATE_OR_CLAIM_STORE_UNAVAILABLE");
        stillValid(state);
        const result = await facade.submit(
          Object.freeze({ id: c.jobId, target: c.target, commit: c.commit })
        );
        if (
          result.light === "GREEN" &&
          result.decision === "LAUNCHED" &&
          state.status === "PENDING"
        ) {
          state.status = "ACTIVE";
          return result;
        }
        if (result.decision === "EFFECT_UNKNOWN_RECONCILE") {
          state.status = "REVOKED"; // Burn authority; never re-admit uncertain work.
          return Object.freeze({
            light: "RED",
            decision: "EFFECT_UNKNOWN_RECONCILE",
            reasons: Object.freeze(["RULE_ZERO_DISPATCH_UNCERTAIN"]),
            signals: Object.freeze(["DENY", "REVOKE", "RECONCILE"]),
          });
        }
        return revoked(state, "RULE_ZERO_ADMISSION_DENIED");
      } catch {
        return state
          ? revoked(state, "APPROVAL_CONTRACT_OR_STORE_INVALID")
          : deny("APPROVAL_CONTRACT_OR_REQUEST_INVALID");
      }
    },
    async requestAction(input) {
      let state;
      let authenticated = false;
      try {
        // The authenticated contract identity comes from the signed payload,
        // never a caller-supplied agent ID or a claimed log record.
        const signed = envelope(input?.requestEnvelope);
        const contractId = input?.contractId;
        state = states.get(contractId);
        if (!state || state.status !== "ACTIVE")
          return deny("CONTRACT_NOT_ACTIVE");
        stillValid(state);
        const verified = state.verified,
          c = verified.contract;
        const request = readSigned(signed, agents.get(c.agentId));
        checkRequest(request, verified, "osiris.agent-action/v1", [
          ...requestFields,
          "tool",
          "zone",
          "rulesetHash",
          "tokens",
          "costMicros",
        ]);
        authenticated = true;
        // Authenticated violations synchronously revoke before any audit await.
        if (
          !c.zones.includes(request.zone) ||
          !c.tools.includes(request.tool) ||
          request.rulesetHash !== c.rulesetHash
        )
          return revoked(state, "ZONE_TOOL_OR_RULESET_VIOLATION");
        if (
          ![request.tokens, request.costMicros].every(
            v => Number.isSafeInteger(v) && v >= 0
          )
        )
          return revoked(state, "INVALID_BUDGET_CHARGE");
        const next = {
          calls: state.used.calls + 1,
          tokens: state.used.tokens + request.tokens,
          costMicros: state.used.costMicros + request.costMicros,
        };
        if (
          !Object.values(next).every(Number.isSafeInteger) ||
          next.calls > c.budgets.maxCalls ||
          next.tokens > c.budgets.maxTokens ||
          next.costMicros > c.budgets.maxCostMicros
        )
          return revoked(state, "BUDGET_EXCEEDED");
        state.used = next; // Reserve before awaits; no refunds or fallback.
        if (!(await claim("plan_y_action", `${c.contractId}:${request.nonce}`)))
          return revoked(state, "ACTION_REPLAY_OR_STORE_UNAVAILABLE");
        const record = Object.freeze({
          contractId: c.contractId,
          agentId: c.agentId,
          planHash: verified.hash,
          stepId: c.stepId,
          tool: request.tool,
          zone: request.zone,
          tokens: request.tokens,
          costMicros: request.costMicros,
        });
        if (
          (await audit(
            Object.freeze({ event: "SYNTHETIC_ACTION_ATTEMPT", ...record })
          )) !== true
        )
          return revoked(state, "AUDIT_UNAVAILABLE");
        stillValid(state);
        checkLifetime(request, clock(), Date.parse(c.expiresAt));
        const receipt = await executeSyntheticAction(record);
        const receiptId = receipt?.receiptId;
        if (typeof receiptId !== "string" || !receiptId)
          return revoked(state, "SYNTHETIC_RECEIPT_MISSING");
        if (
          (await audit(
            Object.freeze({
              event: "SYNTHETIC_ACTION_COMPLETED",
              ...record,
              receiptId,
            })
          )) !== true
        )
          return revoked(state, "AUDIT_UNAVAILABLE");
        if (state.status !== "ACTIVE") return deny("CONTRACT_REVOKED", true);
        return Object.freeze({
          light: "GREEN",
          decision: "SYNTHETIC_ACTION_COMPLETED",
          receiptId,
        });
      } catch {
        // Authenticated uncertain execution/persistence outcomes burn the grant;
        // forged requests cannot revoke someone else's valid contract.
        if (authenticated && state)
          return revoked(state, "ACTION_EXECUTION_OR_STORE_UNAVAILABLE");
        return deny("ACTION_AUTHORITY_OR_REQUEST_INVALID");
      }
    },
  });
}
