export type PegasusSeverity = "info" | "low" | "medium" | "high" | "critical";
export type PegasusCategory =
  | "authentication"
  | "configuration"
  | "integration"
  | "system";

export type PegasusEvent = {
  source: string;
  category: PegasusCategory;
  signal: string;
  severity: PegasusSeverity;
  confidence: number;
  observedAt: Date;
  details: Record<string, unknown>;
};

export type PegasusAlert = {
  ruleId: string;
  title: string;
  severity: Exclude<PegasusSeverity, "info">;
  requiresApproval: true;
};

const severityRank: Record<PegasusSeverity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function evaluatePegasusEvent(event: PegasusEvent): PegasusAlert[] {
  if (event.confidence < 0 || event.confidence > 100)
    throw new RangeError("PEGASUS confidence must be between 0 and 100");

  const alerts: PegasusAlert[] = [];
  if (
    event.signal === "AUTHENTICATION_FAILURE_BURST" &&
    event.confidence >= 70
  ) {
    alerts.push({
      ruleId: "PEG-AUTH-001",
      title: "Repeated authentication failures",
      severity:
        severityRank[event.severity] >= severityRank.high ? "high" : "medium",
      requiresApproval: true,
    });
  }

  if (event.signal === "PROTECTION_DISABLED" && event.confidence >= 90) {
    alerts.push({
      ruleId: "PEG-CONFIG-001",
      title: "A required protection was disabled",
      severity: "critical",
      requiresApproval: true,
    });
  }

  if (
    event.signal === "INTEGRATION_CREDENTIAL_REJECTED" &&
    event.confidence >= 80
  ) {
    alerts.push({
      ruleId: "PEG-INTEGRATION-001",
      title: "Integration credentials were rejected",
      severity: "high",
      requiresApproval: true,
    });
  }

  return alerts;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map(key => `${JSON.stringify(key)}:${canonicalize(object[key])}`)
    .join(",")}}`;
}

export async function sealPegasusEvent(
  event: PegasusEvent,
  previousEventHash: string | null
) {
  const payload = canonicalize({
    ...event,
    observedAt: event.observedAt.toISOString(),
    previousEventHash,
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload)
  );
  const eventHash = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return { previousEventHash, eventHash };
}

export async function verifyPegasusEventSeal(
  event: PegasusEvent,
  seal: { previousEventHash: string | null; eventHash: string }
) {
  const expected = await sealPegasusEvent(event, seal.previousEventHash);
  return expected.eventHash === seal.eventHash;
}

export type StoredPegasusEvent = PegasusEvent & {
  previousEventHash: string | null;
  eventHash: string;
};

export type PegasusChainHead = {
  eventCount: number;
  lastEventHash: string;
};

export async function verifyPegasusEventChain(
  events: readonly StoredPegasusEvent[]
) {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const expectedPreviousHash =
      index === 0 ? null : events[index - 1].eventHash;
    if (event.previousEventHash !== expectedPreviousHash) return false;
    const sealedEvent: PegasusEvent = {
      source: event.source,
      category: event.category,
      signal: event.signal,
      severity: event.severity,
      confidence: event.confidence,
      observedAt: event.observedAt,
      details: event.details,
    };
    if (!(await verifyPegasusEventSeal(sealedEvent, event))) return false;
  }
  return true;
}

export async function verifyPegasusEventLedger(
  events: readonly StoredPegasusEvent[],
  chainHead: PegasusChainHead | null
) {
  if (events.length === 0) return chainHead === null;
  if (!chainHead || chainHead.eventCount !== events.length) return false;
  if (chainHead.lastEventHash !== events[events.length - 1].eventHash)
    return false;
  return verifyPegasusEventChain(events);
}
