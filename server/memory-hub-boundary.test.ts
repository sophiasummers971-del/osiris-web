import { describe, expect, it } from "vitest";
import { journalMetadata, newQuarantineRecord, reviewTransition, validateSecuritySignal } from "./memory-hub-boundary";

const signal = {
  schema: "pegasus.memory-hub.security/v1" as const,
  id: "hub:security:0001", source: "cross-ai-memory-hub" as const,
  observedAt: "2026-10-27T23:00:00.000Z",
  category: "configuration" as const, signal: "PROTECTION_DISABLED",
  severity: "critical" as const, confidence: 95,
  evidenceDigest: "a".repeat(64),
  summary: "Required security configuration changed",
};
describe("Pegasus Memory Hub quarantine boundary", () => {
  it("accepts a strictly sanitised event and initially quarantines it", () => {
    const r = newQuarantineRecord(validateSecuritySignal(signal));
    expect(r.state).toBe("quarantined");
    expect(journalMetadata(r)).not.toHaveProperty("summary");
    expect(journalMetadata(r)).not.toHaveProperty("details");
  });
  it("rejects payload smuggling and malformed events", () => {
    expect(() => validateSecuritySignal({ ...signal, memoryText: "private" })).toThrow("UNEXPECTED_SIGNAL_FIELDS");
    expect(() => validateSecuritySignal({ ...signal, summary: "<instruction>" })).toThrow("UNSAFE_SUMMARY");
    expect(() => validateSecuritySignal({ ...signal, evidenceDigest: "bad" })).toThrow("INVALID_DIGEST");
    expect(() => validateSecuritySignal({ ...signal, source: "unknown" })).toThrow("UNTRUSTED_SIGNAL_SOURCE");
  });
  it("fails closed without verified reviewer authorization", () => {
    const r = newQuarantineRecord(signal);
    expect(() => reviewTransition(r, "approve", { id: "user", authorized: false, reason: "Allow update", now: signal.observedAt })).toThrow("REVIEW_NOT_AUTHORIZED");
    expect(r.state).toBe("quarantined");
  });
  it("requires explicit review and disallows further terminal transitions", () => {
    const r = newQuarantineRecord(signal);
    const approved = reviewTransition(r, "approve", { id: "user", authorized: true, reason: "Source independently verified", now: signal.observedAt });
    expect(approved.state).toBe("approved");
    expect(() => reviewTransition(approved, "reject", { id: "user", authorized: true, reason: "Changed opinion", now: signal.observedAt })).toThrow("ALREADY_DECIDED");
  });
});
