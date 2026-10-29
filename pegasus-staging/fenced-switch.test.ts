import { describe, expect, it } from "vitest";
import {
  switchStagingRoute,
  type FencedProvider,
  type ProviderState,
} from "./fenced-switch.js";

function fixture() {
  let state: ProviderState = { route: "primary", epoch: 1, revision: "v1" };
  const provider: FencedProvider = {
    async read() {
      return { ...state };
    },
    async compareAndSwitch(revision, epoch, next) {
      if (state.revision !== revision || epoch <= state.epoch) return false;
      state = { route: next, epoch, revision: "v" + epoch };
      return true;
    },
  };
  return { provider, expected: { ...state } };
}

describe("Pegasus fenced staging switch contract", () => {
  it("switches and verifies the provider state", async () => {
    const { provider, expected } = fixture();
    expect(await switchStagingRoute(provider, expected, "failover", 2)).toEqual(
      {
        ok: true,
        state: { route: "failover", epoch: 2, revision: "v2" },
      }
    );
  });
  it("rejects replayed or stale epochs", async () => {
    const { provider, expected } = fixture();
    expect(
      (await switchStagingRoute(provider, expected, "failover", 1)).ok
    ).toBe(false);
  });
  it("rejects a changed provider revision", async () => {
    const { provider, expected } = fixture();
    expect(
      (
        await switchStagingRoute(
          provider,
          { ...expected, revision: "old" },
          "failover",
          2
        )
      ).ok
    ).toBe(false);
  });
  it("rejects unauthorized provider-side switch", async () => {
    const { expected } = fixture();
    const provider: FencedProvider = {
      async read() {
        return expected;
      },
      async compareAndSwitch() {
        return false;
      },
    };
    expect(
      (await switchStagingRoute(provider, expected, "failover", 2)).ok
    ).toBe(false);
  });
  it("rejects unverified readback", async () => {
    const { expected } = fixture();
    const provider: FencedProvider = {
      async read() {
        return expected;
      },
      async compareAndSwitch() {
        return true;
      },
    };
    expect(
      (await switchStagingRoute(provider, expected, "failover", 2)).ok
    ).toBe(false);
  });
  it("fails closed when the provider is unavailable", async () => {
    const { expected } = fixture();
    const provider: FencedProvider = {
      async read(): Promise<ProviderState> {
        throw Error("offline");
      },
      async compareAndSwitch() {
        return true;
      },
    };
    expect(
      (await switchStagingRoute(provider, expected, "failover", 2)).ok
    ).toBe(false);
  });
  it("never permits Sector 7 routes", async () => {
    const { provider, expected } = fixture();
    expect(
      (
        await switchStagingRoute(
          provider,
          expected,
          "sector7-a" as "failover",
          2
        )
      ).ok
    ).toBe(false);
  });
});
