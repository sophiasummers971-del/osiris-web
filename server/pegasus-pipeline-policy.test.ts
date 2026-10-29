import { describe, expect, it } from "vitest";
import {
  QUARANTINE_TTL_MS,
  expireQuarantines,
  initialTopology,
  isolatePipeline,
  redirectTraffic,
  rejectMismatchedIdentity,
} from "./pegasus-pipeline-policy.js";

describe("PEGASUS four-pipeline safety core", () => {
  it("starts with two Sector 7 connectors sealed and one standby route", () => {
    const t = initialTopology();
    expect(t.pipelines["sector7-a"].state).toBe("sealed");
    expect(t.pipelines["sector7-b"].state).toBe("sealed");
    expect(t.pipelines.failover.state).toBe("standby");
  });
  it("denies unapproved redirection without changing the topology", () => {
    const t = initialTopology();
    expect(redirectTraffic(t, "failover")).toEqual({
      ok: false,
      reason: "APPROVAL_AND_INDEPENDENT_VERIFICATION_REQUIRED",
    });
    expect(t.active).toBe("primary");
  });
  it("rejects opening reserved Sector 7 routes even with approval", () => {
    const t = initialTopology();
    const result = redirectTraffic(t, "sector7-a", {
      pipeline: "sector7-a",
      operation: "failover",
      authorized: true,
      independentVerified: true,
    });
    expect(result).toEqual({ ok: false, reason: "SECTOR7_CONNECTOR_SEALED" });
  });
  it("fails over only to a healthy standby with independent approval", () => {
    const t = initialTopology();
    const result = redirectTraffic(t, "failover", {
      pipeline: "failover",
      operation: "failover",
      authorized: true,
      independentVerified: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.topology.active).toBe("failover");
      expect(result.topology.pipelines.primary.state).toBe("standby");
    }
  });
  it("does not quarantine the currently active route", () => {
    expect(isolatePipeline(initialTopology(), "primary", "q1", 0)).toEqual({
      ok: false, reason: "ROUTE_AWAY_BEFORE_ISOLATION",
    });
  });
  it("isolates a drained pipe and destroys only its quarantined payload after 7 days", () => {
    const t = initialTopology();
    const isolated = isolatePipeline(t, "failover", "q1", 1000);
    expect(isolated.ok).toBe(true);
    if (!isolated.ok) return;
    const before = expireQuarantines(
      isolated.topology,
      1000 + QUARANTINE_TTL_MS - 1
    );
    expect(before.quarantines[0].state).toBe("sealed");
    const after = expireQuarantines(
      isolated.topology,
      1000 + QUARANTINE_TTL_MS
    );
    expect(after.quarantines[0].state).toBe("destroyed");
    expect(after.pipelines.failover.state).toBe("isolated");
    expect(after.pipelines.primary.state).toBe("active");
  });
  it("does not mutate the topology on identity mismatch", () => {
    const t = initialTopology();
    const snapshot = JSON.stringify(t);
    expect(rejectMismatchedIdentity().reason).toContain("NO_STATE_CHANGE");
    expect(JSON.stringify(t)).toBe(snapshot);
  });
});
