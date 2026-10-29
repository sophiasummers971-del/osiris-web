import { describe, expect, it } from "vitest";
import { validateRouteObservation } from "./route-observation.js";

const seen = {
  active: "failover" as const,
  observedAtMs: 10_000,
  epoch: 4,
  source: "independent-staging-observer",
};

describe("Pegasus staging route observation contract", () => {
  it("accepts a fresh independent route observation", () => {
    expect(validateRouteObservation(seen, "failover", 4, 10_100)).toEqual({
      ok: true,
      active: "failover",
      epoch: 4,
    });
  });
  it("rejects unavailable observations", () => {
    expect(validateRouteObservation(null, "failover", 4, 10_100)).toEqual({
      ok: false,
      reason: "OBSERVATION_UNAVAILABLE",
    });
  });
  it("rejects mismatched provider state", () => {
    expect(validateRouteObservation(seen, "primary", 4, 10_100).ok).toBe(false);
  });
  it("rejects stale, future, or invalid clocks", () => {
    expect(validateRouteObservation(seen, "failover", 4, 50_001).ok).toBe(
      false
    );
    expect(validateRouteObservation(seen, "failover", 4, 9_999).ok).toBe(false);
    expect(validateRouteObservation(seen, "failover", 4, NaN).ok).toBe(false);
  });
  it("rejects previous controller epochs", () => {
    expect(validateRouteObservation(seen, "failover", 5, 10_100).ok).toBe(
      false
    );
  });
  it("rejects sealed Sector 7 and unknown sources", () => {
    expect(
      validateRouteObservation(
        { ...seen, active: "sector7-a" as "failover" },
        "failover",
        4,
        10_100
      ).ok
    ).toBe(false);
    expect(
      validateRouteObservation({ ...seen, source: " " }, "failover", 4, 10_100)
        .ok
    ).toBe(false);
  });
});
