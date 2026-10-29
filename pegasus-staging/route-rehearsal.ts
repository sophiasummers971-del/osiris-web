import {
  validateRouteObservation,
  type RouteName,
  type RouteObservation,
} from "./route-observation.js";

export type RoutingProvider = {
  apply: (
    target: RouteName,
    nextEpoch: number
  ) => Promise<{ accepted: boolean }>;
  observe: () => Promise<RouteObservation | null>;
};

export type RehearsalOutcome =
  | { ok: true; active: RouteName; epoch: number }
  | { ok: false; reason: string };

export async function rehearseRouteTransition(
  provider: RoutingProvider,
  expected: RouteName,
  nextEpoch: number,
  nowMs: number
): Promise<RehearsalOutcome> {
  if (!Number.isSafeInteger(nextEpoch) || nextEpoch < 1) {
    return { ok: false, reason: "INVALID_EPOCH" };
  }

  try {
    const applied = await provider.apply(expected, nextEpoch);
    if (!applied.accepted) {
      return { ok: false, reason: "PROVIDER_REJECTED" };
    }

    const observed = await provider.observe();
    const validated = validateRouteObservation(
      observed,
      expected,
      nextEpoch,
      nowMs
    );
    return validated.ok
      ? { ok: true, active: validated.active, epoch: validated.epoch }
      : validated;
  } catch {
    return { ok: false, reason: "PROVIDER_UNAVAILABLE" };
  }
}
