import { describe, expect, it } from "vitest";
import {
  claimStagingFence,
  settleStagingFence,
  type FenceStore,
} from "./durable-fence.js";

function fixture(): FenceStore {
  const memory = new Map<string, unknown>();
  return {
    async transaction(body) {
      return body({
        async get<T>(key: string) {
          return memory.get(key) as T | undefined;
        },
        async put<T>(key: string, value: T) {
          memory.set(key, value);
        },
      });
    },
  };
}
describe("Staging durable fencing ledger contract", () => {
  it("claims and settles only after verified provider readback", async () => {
    const db = fixture();
    expect((await claimStagingFence(db, "initial", 1, "op-1")).ok).toBe(true);
    expect((await settleStagingFence(db, "op-1", "v1", false)).ok).toBe(false);
    expect((await settleStagingFence(db, "op-1", "v1", true)).ok).toBe(true);
    expect((await claimStagingFence(db, "v1", 2, "op-2")).ok).toBe(true);
  });
  it("refuses a second claim while first is pending", async () => {
    const db = fixture();
    await claimStagingFence(db, "initial", 1, "first");
    expect(await claimStagingFence(db, "initial", 2, "second")).toEqual({
      ok: false,
      reason: "SWITCH_IN_PROGRESS",
    });
  });
  it("refuses stale controller epoch after recovery", async () => {
    const db = fixture();
    await claimStagingFence(db, "initial", 7, "original");
    await settleStagingFence(db, "original", "v7", true);
    expect((await claimStagingFence(db, "v7", 7, "replay")).ok).toBe(false);
  });
  it("refuses old revisions and wrong operation IDs", async () => {
    const db = fixture();
    await claimStagingFence(db, "initial", 4, "original");
    expect((await settleStagingFence(db, "wrong", "v4", true)).ok).toBe(false);
    await settleStagingFence(db, "original", "v4", true);
    expect((await claimStagingFence(db, "initial", 5, "next")).ok).toBe(false);
  });
  it("fails closed on unavailable transactional store", async () => {
    const bad: FenceStore = {
      async transaction() {
        throw new Error("down");
      },
    };
    expect((await claimStagingFence(bad, "initial", 1, "one")).ok).toBe(false);
    expect((await settleStagingFence(bad, "one", "v1", true)).ok).toBe(false);
  });
  it("refuses invalid claims", async () => {
    const db = fixture();
    expect((await claimStagingFence(db, "initial", NaN, "x")).ok).toBe(false);
    expect((await claimStagingFence(db, "", 1, "x")).ok).toBe(false);
    expect((await claimStagingFence(db, "initial", 1, "")).ok).toBe(false);
  });
});
