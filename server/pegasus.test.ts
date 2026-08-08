import { describe, expect, it } from "vitest";
import {
  evaluatePegasusEvent,
  sealPegasusEvent,
  verifyPegasusEventChain,
  verifyPegasusEventSeal,
  type PegasusEvent,
} from "./pegasus.js";

const event: PegasusEvent = {
  source: "osiris-auth",
  category: "authentication",
  signal: "AUTHENTICATION_FAILURE_BURST",
  severity: "high",
  confidence: 85,
  observedAt: new Date("2026-08-08T12:00:00Z"),
  details: { failures: 6, windowSeconds: 60 },
};

describe("evaluatePegasusEvent", () => {
  it("creates an approval-gated alert for a high-confidence known signal", () => {
    expect(evaluatePegasusEvent(event)).toEqual([
      {
        ruleId: "PEG-AUTH-001",
        title: "Repeated authentication failures",
        severity: "high",
        requiresApproval: true,
      },
    ]);
  });

  it("does not turn weak evidence into an alert", () => {
    expect(evaluatePegasusEvent({ ...event, confidence: 45 })).toEqual([]);
  });

  it("rejects confidence outside the declared range", () => {
    expect(() => evaluatePegasusEvent({ ...event, confidence: 101 })).toThrow(
      "PEGASUS confidence must be between 0 and 100"
    );
  });
});

describe("sealPegasusEvent", () => {
  it("produces the same seal for the same canonical event", async () => {
    const first = await sealPegasusEvent(event, null);
    const reordered = await sealPegasusEvent(
      { ...event, details: { windowSeconds: 60, failures: 6 } },
      null
    );
    expect(first.eventHash).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered).toEqual(first);
  });

  it("binds every event to the previous seal", async () => {
    const first = await sealPegasusEvent(event, null);
    const chained = await sealPegasusEvent(event, first.eventHash);
    expect(chained.previousEventHash).toBe(first.eventHash);
    expect(chained.eventHash).not.toBe(first.eventHash);
  });

  it("detects a changed event after it was sealed", async () => {
    const seal = await sealPegasusEvent(event, null);
    await expect(verifyPegasusEventSeal(event, seal)).resolves.toBe(true);
    await expect(
      verifyPegasusEventSeal(
        { ...event, details: { failures: 1, windowSeconds: 60 } },
        seal
      )
    ).resolves.toBe(false);
  });

  it("verifies an ordered chain and rejects a missing link", async () => {
    const firstSeal = await sealPegasusEvent(event, null);
    const secondEvent = {
      ...event,
      observedAt: new Date("2026-08-08T12:01:00Z"),
    };
    const secondSeal = await sealPegasusEvent(secondEvent, firstSeal.eventHash);

    await expect(
      verifyPegasusEventChain([
        { ...event, ...firstSeal },
        { ...secondEvent, ...secondSeal },
      ])
    ).resolves.toBe(true);
    await expect(
      verifyPegasusEventChain([
        { ...event, ...firstSeal },
        { ...secondEvent, ...secondSeal, previousEventHash: null },
      ])
    ).resolves.toBe(false);
  });
});
