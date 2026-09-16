import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ alarms: vi.fn(), monitoring: vi.fn() }));
vi.mock("../server/email-outbox", () => ({ runEmailAlarms: mocks.alarms }));
vi.mock("../server/monitoring/runner", () => ({
  runDueMonitoring: mocks.monitoring,
}));
vi.mock("cloudflare:email", () => ({
  EmailMessage: class {
    constructor(
      public from: string,
      public to: string,
      public raw: string
    ) {}
  },
}));
import worker from "./index";

describe("Worker alarm scheduling", () => {
  it("sends fixed, generic MIME and persists independently of collector failure", async () => {
    mocks.alarms.mockResolvedValue({ claimed: 0, accepted: 0, failed: 0 });
    mocks.monitoring.mockRejectedValue(new Error("Collector unavailable"));
    const send = vi.fn(async () => {});
    const waitUntil = vi.fn();
    worker.scheduled(
      { scheduledTime: Date.now(), cron: "*/15 * * * *" },
      {
        ASSETS: { fetch: vi.fn() },
        HYPERDRIVE: { connectionString: "postgresql://test" },
        email_verify: { send },
      },
      { waitUntil }
    );
    const outcomes = await Promise.allSettled(
      waitUntil.mock.calls.map(([p]) => p)
    );
    expect(outcomes[0].status).toBe("fulfilled");
    expect(outcomes[1].status).toBe("rejected");
    expect(mocks.alarms.mock.calls[0][0]).toBe("postgresql://test");
    await mocks.alarms.mock.calls[0][1](17);
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0][0] as unknown as {
      from: string;
      to: string;
      raw: string;
    };
    expect(message.from).toBe("osiris-alerts@iron-fire.uk");
    expect(message.to).toBe("sophiasummers971@gmail.com");
    expect(message.raw).toContain(
      "Subject: OSIRIS security alert - review required\r\n"
    );
    expect(message.raw).toContain("<osiris-alert-17@iron-fire.uk>");
    expect(message.raw).toContain("not proof of an account compromise");
    expect(message.raw).not.toContain("Bearer");
    expect(message.raw).not.toContain("TEST-ROLLBACK");
  });
});
