/**
 * Durable, staging-only fencing ledger.
 *
 * An injected transactional store is required. This serializes authorization
 * decisions within one logical routing cell, but DOES NOT make Cloudflare's
 * deployment API compare-and-swap. No routing is performed by this module.
 */
export interface FenceStore {
  transaction<T>(body: (tx: FenceTransaction) => Promise<T>): Promise<T>;
}
export interface FenceTransaction {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
}
export type FenceRecord = {
  epoch: number;
  revision: string;
  status: "idle" | "pending";
  operationId: string | null;
};
export type FenceDecision =
  | { ok: true; lease: FenceRecord }
  | { ok: false; reason: string };

const KEY = "pegasus-staging/fence-v1";
export async function claimStagingFence(
  store: FenceStore,
  expectedRevision: string,
  controllerEpoch: number,
  operationId: string
): Promise<FenceDecision> {
  if (
    !Number.isSafeInteger(controllerEpoch) ||
    controllerEpoch <= 0 ||
    !expectedRevision ||
    !operationId ||
    operationId.length > 128
  )
    return { ok: false, reason: "INVALID_CLAIM" };
  try {
    return await store.transaction(async (tx) => {
      const current = (await tx.get<FenceRecord>(KEY)) ?? {
        epoch: 0,
        revision: "initial",
        status: "idle" as const,
        operationId: null,
      };
      if (current.status !== "idle")
        return { ok: false, reason: "SWITCH_IN_PROGRESS" };
      if (controllerEpoch <= current.epoch)
        return { ok: false, reason: "STALE_CONTROLLER_EPOCH" };
      if (expectedRevision !== current.revision)
        return { ok: false, reason: "STALE_REVISION" };
      const lease: FenceRecord = {
        epoch: controllerEpoch,
        revision: current.revision,
        status: "pending",
        operationId,
      };
      await tx.put(KEY, lease);
      return { ok: true, lease };
    });
  } catch {
    return { ok: false, reason: "FENCE_STORE_UNAVAILABLE" };
  }
}
/**
 * Completion requires separately verified provider readback and an exact
 * matching operation ID. A failed switch remains pending for manual recovery;
 * no automatic stale-lease clearing that could grant concurrent authority.
 */
export async function settleStagingFence(
  store: FenceStore,
  operationId: string,
  observedRevision: string,
  providerVerified: boolean
): Promise<FenceDecision> {
  if (!operationId || !observedRevision || !providerVerified)
    return { ok: false, reason: "UNVERIFIED_PROVIDER_STATE" };
  try {
    return await store.transaction(async (tx) => {
      const current = await tx.get<FenceRecord>(KEY);
      if (!current || current.status !== "pending" || current.operationId !== operationId)
        return { ok: false, reason: "OPERATION_NOT_CURRENT" };
      const lease: FenceRecord = {
        epoch: current.epoch,
        revision: observedRevision,
        status: "idle",
        operationId: null,
      };
      await tx.put(KEY, lease);
      return { ok: true, lease };
    });
  } catch {
    return { ok: false, reason: "FENCE_STORE_UNAVAILABLE" };
  }
}
