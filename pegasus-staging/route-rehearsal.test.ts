import { describe, expect, it } from "vitest";
import { rehearseRouteTransition, type RoutingProvider } from "./route-rehearsal.js";
import type { RouteName } from "./route-observation.js";

const now = 1_782_000_000_000;

function provider(active: RouteName = "primary", epoch = 1): RoutingProvider {
  let current = active;
  let currentEpoch = epoch;

  return {
    async apply(target, nextEpoch) {
      if (nextEpoch <= currentEpoch) return { accepted: false };
      current = target;
      currentEpoch = nextEpoch;
      return { accepted: true };
    },
    async observe() {
      return {
        active: current,
        epoch: currentEpoch,
        observedAtMs: now,
        source: "independent-test-provider",
      };
    },
  };
}

describe("Pegasus provider readback rehearsal (synthetic provider only)", () => {
  it("verifies failover and rollback with increasing epochs", async () => {
    const route = provider();
    expect(await rehearseRouteTransition(route, "failover", 2, now)).toEqual({
      ok: true,
      active: "failover",
      epoch: 2,
    });
    expect(await rehearseRouteTransition(route, "primary", 3, now)).toEqual({
      ok: true,
      active: "primary",
      epoch: 3,
    });
  });

  it("rejects stale controller takeover", async () => {
    const route = provider("failover", 5);
    expect(await rehearseRouteTransition(route, "primary", 4, now)).toEqual({
      ok: false,
      reason: "PROVIDER_REJECTED",
    });
  });

  it("refuses success if provider reports a different route", async () => {
    const route: RoutingProvider = {
      apply: async () => ({ accepted: true }),
      observe: async () => ({
        active: "primary",
        epoch: 3,
        observedAtMs: now,
        source: "independent-test-provider",
      }),
    };
    expect(await rehearseRouteTransition(route, "failover", 3, now)).toEqual({
      ok: false,
      reason: "ROUTE_MISMATCH",
    });
  });

  it("refuses success without provider observation", async () => {
    const route: RoutingProvider = {
      apply: async () => ({ accepted: true }),
      observe: async () => null,
    };
    expect(await rehearseRouteTransition(route, "failover", 2, now)).toEqual({
      ok: false,
      reason: "OBSERVATION_UNAVAILABLE",
    });
  });

  it("refuses provider crashes", async () => {
    const route: RoutingProvider = {
      apply: async () => {
        throw Error("connection refused");
      },
      observe: async () => null,
    };
    expect(await rehearseRouteTransition(route, "failover", 2, now)).toEqual({
      ok: false,
      reason: "PROVIDER_UNAVAILABLE",
    });
  });

  it("rejects invalid epochs before invoking the provider", async () => {
    const route: RoutingProvider = {
      apply: async () => {
        throw Error("should never run");
      },
      observe: async () => null,
    };
    expect(await rehearseRouteTransition(route, "failover", 0, now)).toEqual({
      ok: false,
      reason: "INVALID_EPOCH",
    });
  });
});
