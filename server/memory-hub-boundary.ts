/**
 * Pegasus <-> Memory Hub boundary contract.
 * This module is deliberately pure: it neither reads memories nor performs
 * remediation. Application adapters must authenticate the source and reviewer.
 */
export type BridgeSeverity = "info" | "low" | "medium" | "high" | "critical";
export type ReviewState = "pending" | "quarantined" | "investigating" | "approved" | "rejected";
export type ReviewDecision = "investigate" | "keep_quarantined" | "approve" | "reject";

export type SecuritySignal = {
  schema: "pegasus.memory-hub.security/v1";
  id: string;
  source: "cross-ai-memory-hub";
  observedAt: string;
  category: "authentication" | "configuration" | "integration" | "system";
  signal: string;
  severity: BridgeSeverity;
  confidence: number;
  evidenceDigest: string;
  summary: string;
};

export type QuarantineRecord = {
  id: string;
  state: ReviewState;
  signal: SecuritySignal;
  createdAt: string;
  updatedAt: string;
  reviewerId?: string;
  decisionReason?: string;
};

const allowedCategories = new Set(["authentication", "configuration", "integration", "system"]);
const allowedSeverity = new Set(["info", "low", "medium", "high", "critical"]);
const safeSignal = /^[A-Z][A-Z0-9_]{2,79}$/;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;

export function validateSecuritySignal(input: unknown): SecuritySignal {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("INVALID_SIGNAL");
  const o = input as Record<string, unknown>;
  const keys = Object.keys(o);
  const required = ["schema","id","source","observedAt","category","signal","severity","confidence","evidenceDigest","summary"];
  if (keys.length !== required.length || keys.some(k => !required.includes(k))) throw new Error("UNEXPECTED_SIGNAL_FIELDS");
  if (o.schema !== "pegasus.memory-hub.security/v1" || o.source !== "cross-ai-memory-hub") throw new Error("UNTRUSTED_SIGNAL_SOURCE");
  if (typeof o.id !== "string" || !idPattern.test(o.id)) throw new Error("INVALID_SIGNAL_ID");
  if (typeof o.observedAt !== "string" || !/^\\d{4}-\\d\\d-\\d\\dT/.test(o.observedAt) || !Number.isFinite(Date.parse(o.observedAt))) throw new Error("INVALID_TIMESTAMP");
  if (!allowedCategories.has(String(o.category)) || !allowedSeverity.has(String(o.severity))) throw new Error("INVALID_CLASSIFICATION");
  if (typeof o.signal !== "string" || !safeSignal.test(o.signal)) throw new Error("INVALID_SIGNAL_CODE");
  if (typeof o.confidence !== "number" || !Number.isInteger(o.confidence) || o.confidence < 0 || o.confidence > 100) throw new Error("INVALID_CONFIDENCE");
  if (typeof o.evidenceDigest !== "string" || !digestPattern.test(o.evidenceDigest)) throw new Error("INVALID_DIGEST");
  if (typeof o.summary !== "string" || o.summary.length < 1 || o.summary.length > 240 || /[\\r\\n<>]/.test(o.summary)) throw new Error("UNSAFE_SUMMARY");
  // Deliberately prohibit arbitrary 'details', memory payloads and instructions.
  return input as SecuritySignal;
}

export function reviewTransition(record: QuarantineRecord, decision: ReviewDecision, actor: {
  id: string; authorized: boolean; reason: string; now: string;
}): QuarantineRecord {
  if (!actor.authorized || !actor.id || actor.reason.trim().length < 8) throw new Error("REVIEW_NOT_AUTHORIZED");
  if (!Number.isFinite(Date.parse(actor.now))) throw new Error("INVALID_REVIEW_TIME");
  if (!["pending","quarantined","investigating"].includes(record.state)) throw new Error("ALREADY_DECIDED");
  const to: Record<ReviewDecision, ReviewState> = {
    investigate: "investigating", keep_quarantined: "quarantined",
    approve: "approved", reject: "rejected",
  };
  if (!Object.hasOwn(to, decision)) throw new Error("INVALID_DECISION");
  return { ...record, state: to[decision], updatedAt: actor.now,
    reviewerId: actor.id, decisionReason: actor.reason.trim() };
}

export function newQuarantineRecord(signal: SecuritySignal): QuarantineRecord {
  validateSecuritySignal(signal);
  return { id: signal.id, state: "quarantined", signal, createdAt: signal.observedAt, updatedAt: signal.observedAt };
}

export function journalMetadata(record: QuarantineRecord) {
  // Trusted journal stores a pointer, NEVER evidence contents or update text.
  return { eventId: record.id, observedAt: record.signal.observedAt,
    source: record.signal.source, signal: record.signal.signal,
    severity: record.signal.severity, state: record.state,
    evidenceDigest: record.signal.evidenceDigest };
}
