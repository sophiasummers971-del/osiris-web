/**
 * PEGASUS traffic-plane safety model.
 * Pure and intentionally disconnected from production routes and credentials.
 * The recovery control plane is not represented as a quarantinable pipeline.
 */
export type PipelineId = "primary" | "failover" | "sector7-a" | "sector7-b";
export type PipelineState =
  | "active"
  | "standby"
  | "sealed"
  | "isolated"
  | "repairing";
export type QuarantineState = "sealed" | "destroyed";
export type Approval = {
  operation: "activate" | "failover" | "restore";
  pipeline: PipelineId;
  authorized: boolean;
  independentVerified: boolean;
};

export type Pipeline = { id: PipelineId; state: PipelineState; healthy: boolean };
export type Quarantine = {
  id: string;
  pipeline: PipelineId;
  state: QuarantineState;
  containedAtMs: number;
  expiresAtMs: number;
};
export type PegasusTopology = {
  pipelines: Record<PipelineId, Pipeline>;
  active: PipelineId;
  quarantines: Quarantine[];
};
export type Decision =
  | { ok: true; topology: PegasusTopology }
  | { ok: false; reason: string };

export const QUARANTINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function initialTopology(): PegasusTopology {
  return {
    active: "primary",
    pipelines: {
      primary: { id: "primary", state: "active", healthy: true },
      failover: { id: "failover", state: "standby", healthy: true },
      "sector7-a": { id: "sector7-a", state: "sealed", healthy: false },
      "sector7-b": { id: "sector7-b", state: "sealed", healthy: false },
    },
    quarantines: [],
  };
}

function deny(reason: string): Decision {
  return { ok: false, reason };
}
function approved(
  approval: Approval | undefined,
  action: Approval["operation"],
  pipeline: PipelineId
) {
  return (
    approval?.operation === action &&
    approval.pipeline === pipeline &&
    approval.authorized === true &&
    approval.independentVerified === true
  );
}

/** Failover is a controlled operation, never a side effect of an identity mismatch. */
export function redirectTraffic(
  topology: PegasusTopology,
  target: PipelineId,
  approval?: Approval
): Decision {
  if (!approved(approval, "failover", target))
    return deny("APPROVAL_AND_INDEPENDENT_VERIFICATION_REQUIRED");
  if (target.startsWith("sector7-")) return deny("SECTOR7_CONNECTOR_SEALED");
  if (target === topology.active) return deny("ALREADY_ACTIVE");
  const destination = topology.pipelines[target];
  if (!destination.healthy || destination.state !== "standby")
    return deny("TARGET_NOT_HEALTHY_STANDBY");
  const current = topology.pipelines[topology.active];
  if (current.state !== "active") return deny("ACTIVE_PIPELINE_STATE_MISMATCH");
  return {
    ok: true,
    topology: {
      ...topology,
      active: target,
      pipelines: {
        ...topology.pipelines,
        [current.id]: { ...current, state: "standby" },
        [target]: { ...destination, state: "active" },
      },
    },
  };
}

/** Isolating an already drained pipe cannot delete its configuration or control plane. */
export function isolatePipeline(
  topology: PegasusTopology,
  id: PipelineId,
  quarantineId: string,
  nowMs: number
): Decision {
  if (!Number.isFinite(nowMs) || !quarantineId.trim())
    return deny("INVALID_QUARANTINE_REQUEST");
  if (id === topology.active) return deny("ROUTE_AWAY_BEFORE_ISOLATION");
  const pipe = topology.pipelines[id];
  if (pipe.state === "sealed" || pipe.state === "isolated")
    return deny("NOT_ELIGIBLE_FOR_ISOLATION");
  if (topology.quarantines.some(q => q.id === quarantineId))
    return deny("DUPLICATE_QUARANTINE_ID");
  return {
    ok: true,
    topology: {
      ...topology,
      pipelines: {
        ...topology.pipelines,
        [id]: { ...pipe, state: "isolated", healthy: false },
      },
      quarantines: [
        ...topology.quarantines,
        {
          id: quarantineId,
          pipeline: id,
          state: "sealed",
          containedAtMs: nowMs,
          expiresAtMs: nowMs + QUARANTINE_TTL_MS,
        },
      ],
    },
  };
}

/** Expiry authorizes only payload destruction, never reopening or destroying a pipe. */
export function expireQuarantines(
  topology: PegasusTopology,
  nowMs: number
): PegasusTopology {
  if (!Number.isFinite(nowMs)) return topology;
  return {
    ...topology,
    quarantines: topology.quarantines.map(q =>
      q.state === "sealed" && nowMs >= q.expiresAtMs
        ? { ...q, state: "destroyed" }
        : q
    ),
  };
}

/** A mismatched identity is a denied request, not evidence of infection. */
export function rejectMismatchedIdentity(): { ok: false; reason: string } {
  return { ok: false, reason: "IDENTITY_VERIFICATION_FAILED_NO_STATE_CHANGE" };
}
