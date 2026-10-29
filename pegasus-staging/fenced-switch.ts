/**
 * Pegasus staging adapter contract.
 * The provider must atomically enforce the expected version and fencing epoch.
 * No production routing, Cloudflare credentials, or network calls live here.
 */
export type StagingRoute = "primary" | "failover";
export type ProviderState = {
  route: StagingRoute;
  epoch: number;
  revision: string;
};
export interface FencedProvider {
  read(): Promise<ProviderState>;
  compareAndSwitch(
    expectedRevision: string,
    minimumEpoch: number,
    next: StagingRoute
  ): Promise<boolean>;
}
export type SwitchResult =
  | { ok: true; state: ProviderState }
  | { ok: false; reason: string };

export async function switchStagingRoute(
  provider: FencedProvider,
  expected: ProviderState,
  next: StagingRoute,
  controllerEpoch: number
): Promise<SwitchResult> {
  if (
    !Number.isSafeInteger(controllerEpoch) ||
    controllerEpoch <= expected.epoch ||
    !expected.revision ||
    (next !== "primary" && next !== "failover")
  ) {
    return { ok: false, reason: "INVALID_OR_STALE_AUTHORITY" };
  }
  try {
    const before = await provider.read();
    if (
      before.revision !== expected.revision ||
      before.route !== expected.route ||
      before.epoch !== expected.epoch
    ) {
      return { ok: false, reason: "PROVIDER_STATE_CHANGED" };
    }
    if (
      !(await provider.compareAndSwitch(
        expected.revision,
        controllerEpoch,
        next
      ))
    ) {
      return { ok: false, reason: "PROVIDER_REJECTED_SWITCH" };
    }
    const after = await provider.read();
    if (after.route !== next || after.epoch !== controllerEpoch) {
      return { ok: false, reason: "PROVIDER_READBACK_MISMATCH" };
    }
    return { ok: true, state: after };
  } catch {
    return { ok: false, reason: "PROVIDER_UNAVAILABLE" };
  }
}
