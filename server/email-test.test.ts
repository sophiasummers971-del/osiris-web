import { describe, expect, it, vi } from "vitest";
import { sendOwnerEmailTest, EMAIL_TEST_RECIPIENT } from "./email-test";

describe("restricted email test", () => {
  it.each([null, "other@example.com"])(
    "rejects unauthorized identity %s",
    async email => {
      const send = vi.fn();
      await expect(sendOwnerEmailTest(email, send)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(send).not.toHaveBeenCalled();
    }
  );
  it("fails closed without binding", async () => {
    await expect(
      sendOwnerEmailTest(EMAIL_TEST_RECIPIENT, undefined)
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
  it("does not leak provider errors", async () => {
    await expect(
      sendOwnerEmailTest(EMAIL_TEST_RECIPIENT, async () => {
        throw new Error("private provider detail");
      })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Email test failed",
    });
  });
  it("awaits provider acceptance but never claims delivery or automatic alarms", async () => {
    const send = vi.fn(async () => {});
    await expect(
      sendOwnerEmailTest(EMAIL_TEST_RECIPIENT.toUpperCase(), send)
    ).resolves.toEqual({ accepted: true, automaticAlarmsEnabled: false });
    expect(send).toHaveBeenCalledOnce();
  });
});
