/**
 * Validate an independently supplied route observation before accepting it.
 * Offline contract only: no routing-provider connection or production authority.
 */
export type RouteName = "primary" | "failover";
export type RouteObservation = {
  active: RouteName;
  observedAtMs: number;
  epoch: number;
  source: string;
};
export type ObservationResult =
  | { ok: true; active: RouteName; epoch: number }
  | { ok: false; reason: string };

export function validateRouteObservation(
  observation: RouteObservation | null,
  expected: RouteName,
  minEpoch: number,
  nowMs: number,
  maxAgeMs = 30_000
): ObservationResult {
  if (!observation) return { ok: false, reason: "OBSERVATION_UNAVAILABLE" };
  if (
    !Number.isSafeInteger(nowMs) ||
    !Number.isSafeInteger(minEpoch) ||
    !Number.isSafeInteger(observation.epoch) ||
    !Number.isSafeInteger(observation.observedAtMs) ||
    !Number.isSafeInteger(maxAgeMs) ||
    maxAgeMs <= 0
  )
    return { ok: false, reason: "INVALID_OBSERVATION_METADATA" };
  if (observation.active !== "primary" && observation.active !== "failover") {
    return { ok: false, reason: "UNKNOWN_OR_SEALED_ROUTE" };
  }
  if (!observation.source.trim())
    return { ok: false, reason: "SOURCE_NOT_IDENTIFIED" };
  const age = nowMs - observation.observedAtMs;
  if (age < 0 || age > maxAgeMs)
    return { ok: false, reason: "STALE_OR_FUTURE_OBSERVATION" };
  if (observation.epoch < minEpoch)
    return { ok: false, reason: "STALE_CONTROLLER_EPOCH" };
  if (observation.active !== expected)
    return { ok: false, reason: "ROUTE_MISMATCH" };
  return { ok: true, active: observation.active, epoch: observation.epoch };
}
