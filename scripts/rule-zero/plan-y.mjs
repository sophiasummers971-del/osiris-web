import { createHash, createPublicKey, verify } from "node:crypto";

const fail = reason => {
  throw new Error(reason);
};
const requireValue = (ok, reason) => {
  if (!ok) fail(reason);
};
export const hashData = value =>
  createHash("sha256").update(canonicalJSON(value)).digest("hex");
export function canonicalJSON(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  if (value && Object.getPrototypeOf(value) === Object.prototype)
    return `{${Object.keys(value)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`)
      .join(",")}}`;
  fail("INVALID_JSON_DATA");
}
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function fields(value, names) {
  requireValue(
    value &&
      Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).sort().join(",") === [...names].sort().join(","),
    "INVALID_SCHEMA"
  );
}
const id = value =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(value);
const text = value =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 2000;
const hex = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const path = value =>
  typeof value === "string" &&
  /^[A-Za-z0-9_./-]{3,160}$/.test(value) &&
  value.split("/").every(s => s && s !== "." && s !== "..");
function list(value, check, empty = true) {
  return (
    Array.isArray(value) &&
    value.length <= 64 &&
    (empty || value.length > 0) &&
    value.every(check) &&
    new Set(value).size === value.length
  );
}
function budgets(value) {
  fields(value, ["maxCalls", "maxTokens", "maxCostMicros"]);
  requireValue(
    Object.values(value).every(v => Number.isSafeInteger(v) && v >= 0) &&
      value.maxCalls > 0,
    "INVALID_BUDGET"
  );
}
function parse(json) {
  requireValue(
    typeof json === "string" && json.length <= 65536,
    "INVALID_JSON_DATA"
  );
  return JSON.parse(json);
}
export function createPlanY(json) {
  const plan = parse(json);
  fields(plan, [
    "schema",
    "taskId",
    "task",
    "version",
    "ownerId",
    "tenantId",
    "steps",
  ]);
  requireValue(
    plan.schema === "osiris.plan-y/v1" &&
      id(plan.taskId) &&
      text(plan.task) &&
      id(plan.ownerId) &&
      id(plan.tenantId) &&
      Number.isSafeInteger(plan.version) &&
      plan.version > 0,
    "INVALID_PLAN"
  );
  requireValue(
    Array.isArray(plan.steps) &&
      plan.steps.length > 0 &&
      plan.steps.length <= 32,
    "INVALID_STEPS"
  );
  const stepIds = new Set();
  for (const step of plan.steps) {
    fields(step, [
      "id",
      "description",
      "purpose",
      "justification",
      "dependencies",
      "scope",
      "risks",
      "expectedEvidence",
    ]);
    requireValue(
      id(step.id) &&
        !stepIds.has(step.id) &&
        [step.description, step.purpose, step.justification].every(text) &&
        list(step.dependencies, id) &&
        list(step.risks, text, false) &&
        list(step.expectedEvidence, text, false),
      "INVALID_STEP"
    );
    stepIds.add(step.id);
    fields(step.scope, [
      "target",
      "commit",
      "tools",
      "zones",
      "rulesetHash",
      "budgets",
    ]);
    requireValue(
      path(step.scope.target) &&
        typeof step.scope.commit === "string" &&
        /^[a-f0-9]{40}$/.test(step.scope.commit) &&
        list(step.scope.tools, id, false) &&
        list(step.scope.zones, path, false) &&
        hex(step.scope.rulesetHash),
      "INVALID_SCOPE"
    );
    budgets(step.scope.budgets);
  }
  const visiting = new Set(),
    visited = new Set();
  const visit = step => {
    requireValue(!visiting.has(step.id), "CYCLIC_DEPENDENCY");
    if (visited.has(step.id)) return;
    visiting.add(step.id);
    for (const dependency of step.dependencies) {
      requireValue(stepIds.has(dependency), "UNKNOWN_DEPENDENCY");
      visit(plan.steps.find(s => s.id === dependency));
    }
    visiting.delete(step.id);
    visited.add(step.id);
  };
  plan.steps.forEach(visit);
  return freeze({ plan, hash: hashData(plan) });
}
export function pinnedEd25519Key(input) {
  const key = input?.type === "public" ? input : createPublicKey(input);
  requireValue(key.asymmetricKeyType === "ed25519", "UNSUPPORTED_KEY");
  // Re-import immutable public bytes; never retain caller-owned mutable buffers.
  return createPublicKey(key.export({ type: "spki", format: "pem" }));
}
export function publicKeyFingerprint(key) {
  return createHash("sha256")
    .update(pinnedEd25519Key(key).export({ type: "spki", format: "der" }))
    .digest("hex");
}
export function readSigned(envelope, publicKey) {
  fields(envelope, ["payload", "signature"]);
  requireValue(
    typeof envelope.payload === "string" &&
      typeof envelope.signature === "string" &&
      envelope.signature.length === 88,
    "INVALID_SIGNATURE"
  );
  const value = parse(envelope.payload);
  requireValue(
    canonicalJSON(value) === envelope.payload,
    "NONCANONICAL_SIGNED_DATA"
  );
  const signature = Buffer.from(envelope.signature, "base64");
  requireValue(
    signature.length === 64 &&
      signature.toString("base64") === envelope.signature &&
      verify(
        null,
        Buffer.from(envelope.payload),
        pinnedEd25519Key(publicKey),
        signature
      ),
    "INVALID_SIGNATURE"
  );
  return freeze(value);
}
function validTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
export function checkLifetime(value, now, parentExpiry = Infinity) {
  requireValue(
    Number.isFinite(now) &&
      validTime(value.issuedAt) &&
      validTime(value.expiresAt) &&
      Date.parse(value.issuedAt) <= now &&
      Date.parse(value.expiresAt) > now &&
      Date.parse(value.expiresAt) > Date.parse(value.issuedAt) &&
      Date.parse(value.expiresAt) <= parentExpiry,
    "EXPIRED_OR_INVALID_LIFETIME"
  );
}
function checkBinding(value, plan, hash, context) {
  requireValue(
    id(context.taskId) &&
      id(context.ownerId) &&
      id(context.tenantId) &&
      value.planHash === hash &&
      value.planVersion === plan.version &&
      ["taskId", "ownerId", "tenantId"].every(
        k => plan[k] === context[k] && value[k] === context[k]
      ),
    "PLAN_OR_AUTHORITY_MISMATCH"
  );
}
export function verifyPlanApproval({
  planJson,
  approvalEnvelope,
  authorityKey,
  context,
  now = Date.now(),
}) {
  const { plan, hash } = createPlanY(planJson);
  const approval = readSigned(approvalEnvelope, authorityKey);
  fields(approval, [
    "schema",
    "approvalId",
    "planHash",
    "planVersion",
    "taskId",
    "ownerId",
    "tenantId",
    "issuedAt",
    "expiresAt",
  ]);
  requireValue(
    approval.schema === "osiris.plan-approval/v1" && id(approval.approvalId),
    "INVALID_APPROVAL"
  );
  checkBinding(approval, plan, hash, context);
  checkLifetime(approval, now);
  return freeze({ plan, hash, approval });
}
export function verifyAgentContract({
  planJson,
  approvalEnvelope,
  contractEnvelope,
  authorityKey,
  contractKey,
  agentKeys,
  context,
  now = Date.now(),
}) {
  const verified = verifyPlanApproval({
    planJson,
    approvalEnvelope,
    authorityKey,
    context,
    now,
  });
  const { plan, hash, approval } = verified;
  const contract = readSigned(contractEnvelope, contractKey);
  fields(contract, [
    "schema",
    "contractId",
    "approvalId",
    "agentId",
    "agentKeyHash",
    "planHash",
    "planVersion",
    "taskId",
    "ownerId",
    "tenantId",
    "stepId",
    "jobId",
    "target",
    "commit",
    "tools",
    "zones",
    "rulesetHash",
    "budgets",
    "issuedAt",
    "expiresAt",
  ]);
  requireValue(
    contract.schema === "osiris.agent-contract/v1" &&
      id(contract.contractId) &&
      /^NR-[0-9]{5}$/.test(contract.agentId) &&
      id(contract.jobId) &&
      contract.jobId.length >= 8 &&
      contract.approvalId === approval.approvalId,
    "INVALID_CONTRACT"
  );
  checkBinding(contract, plan, hash, context);
  checkLifetime(contract, now, Date.parse(approval.expiresAt));
  const agentKey = agentKeys.get(contract.agentId);
  requireValue(
    agentKey && contract.agentKeyHash === publicKeyFingerprint(agentKey),
    "AGENT_KEY_MISMATCH"
  );
  const step = plan.steps.find(s => s.id === contract.stepId);
  requireValue(step, "WRONG_STEP");
  budgets(contract.budgets);
  requireValue(
    contract.target === step.scope.target &&
      contract.commit === step.scope.commit &&
      contract.rulesetHash === step.scope.rulesetHash &&
      list(contract.tools, id, false) &&
      contract.tools.every(t => step.scope.tools.includes(t)) &&
      list(contract.zones, path, false) &&
      contract.zones.every(z => step.scope.zones.includes(z)) &&
      Object.keys(contract.budgets).every(
        k => contract.budgets[k] <= step.scope.budgets[k]
      ),
    "EXPANDED_CONTRACT_SCOPE"
  );
  return freeze({
    ...verified,
    contract,
    contractHash: hashData(contract),
    step,
  });
}
