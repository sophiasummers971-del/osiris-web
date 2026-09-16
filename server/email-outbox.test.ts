import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  claimEmailsSql,
  dispatchEmailBatch,
  emailFailure,
  enqueueEmailsSql,
  finishEmailSql,
  getEmailAlarmStatus,
} from "./email-outbox";

const dialect = new PgDialect();
const item = {
  alert_id: 17,
  attempts: 1,
  lease_token: "00000000-0000-4000-8000-000000000001",
};

describe("durable alarm outbox", () => {
  it("selects only configured-owner high/critical new alerts and deduplicates", () => {
    const q = dialect.sqlToQuery(enqueueEmailsSql()).sql;
    expect(q).toContain("c.owner_id=a.owner_id");
    expect(q).toContain("a.id>c.start_after_alert_id");
    expect(q).toContain("('high','critical')");
    expect(q).toContain("on conflict (alert_id) do nothing");
  });
  it("claims bounded batches with durable leases and concurrency exclusion", () => {
    const q = dialect.sqlToQuery(claimEmailsSql(item.lease_token));
    expect(q.sql).toContain("for update of q skip locked limit 10");
    expect(q.sql).toContain("q.attempts<5");
    expect(q.sql).toContain("interval '30 minutes'");
    expect(q.params).toEqual([item.lease_token]);
  });
  it("guards completion against stale lease holders", () => {
    const q = dialect.sqlToQuery(finishEmailSql(item, "accepted", new Date()));
    expect(q.sql).toContain("and lease_token=");
    expect(q.params).toContain(item.lease_token);
  });
  it.each([1, 2, 3, 4])("backs off attempt %s", attempt => {
    const now = new Date("2026-09-16T00:00:00Z");
    expect(emailFailure(attempt, now)).toEqual({
      status: "retry",
      nextAttemptAt: new Date(
        now.getTime() + [15, 30, 60, 120][attempt - 1] * 60000
      ),
    });
  });
  it("stops retrying after five attempts", () => {
    expect(emailFailure(5, new Date()).status).toBe("failed");
  });
  it("records acceptance without claiming mailbox delivery", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([{ alert_id: 17 }]);
    const send = vi.fn(async () => {});
    expect(await dispatchEmailBatch({ execute }, send)).toEqual({
      claimed: 1,
      accepted: 1,
      failed: 0,
    });
    expect(send).toHaveBeenCalledWith(17);
    expect(dialect.sqlToQuery(execute.mock.calls[3][0]).params[0]).toBe(
      "accepted"
    );
  });
  it("records retry with generic errors only", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([item])
      .mockResolvedValueOnce([]);
    await dispatchEmailBatch({ execute }, async () => {
      throw new Error("secret provider payload");
    });
    const q = dialect.sqlToQuery(execute.mock.calls[3][0]);
    expect(q.params[0]).toBe("retry");
    expect(JSON.stringify(q)).not.toContain("secret provider");
  });
  it("does not downgrade provider acceptance when persistence fails", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([item])
      .mockRejectedValueOnce(new Error("DB unavailable"));
    await expect(
      dispatchEmailBatch({ execute }, async () => {})
    ).rejects.toThrow("DB unavailable");
    expect(execute).toHaveBeenCalledTimes(4);
  });
  it("returns status using owner-scoped queries and bounded safe projection", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    expect(await getEmailAlarmStatus({ execute }, 42)).toEqual({
      enabled: false,
      enabledAt: null,
      deliveries: [],
    });
    for (const [q] of execute.mock.calls)
      expect(dialect.sqlToQuery(q).params).toEqual([42]);
    expect(dialect.sqlToQuery(execute.mock.calls[1][0]).sql).toContain(
      "limit 50"
    );
  });
});
