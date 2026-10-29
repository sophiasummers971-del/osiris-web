import { describe, expect, it } from "vitest";
import {
  describeMonitoringError,
  formatMonitoringTimestamp,
} from "./monitoring-status";

describe("monitoring status presentation", () => {
  it("explains quota delays without asking for new consent", () => {
    const message = describeMonitoringError("GOOGLE_RATE_LIMITED");
    expect(message).toContain("Coverage is delayed");
    expect(message).toContain("next scheduled check");
    expect(message).toContain("without reconnecting");
  });

  it("distinguishes a connection that has not been checked", () => {
    expect(formatMonitoringTimestamp(null)).toBe("Not yet");
  });

  it("does not render invalid dates", () => {
    expect(formatMonitoringTimestamp("not-a-date")).toBe("Unavailable");
  });

  it("turns stored failure codes into useful recovery guidance", () => {
    expect(describeMonitoringError("MISSING_ENCRYPTED_TOKEN")).toContain(
      "Reconnect"
    );
    expect(describeMonitoringError("UNRECOGNISED_FAILURE")).toContain(
      "latest account check failed"
    );
    expect(describeMonitoringError(null)).toBeNull();
  });
});
