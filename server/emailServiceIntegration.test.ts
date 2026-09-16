import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./emailServiceIntegration";

const options = {
  to: "private-recipient@example.test",
  subject: "private-subject-marker",
  html: "private-evidence-marker",
};
describe("legacy email privacy and truthful delivery", () => {
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("SENDGRID_API_KEY", "synthetic-secret-marker");
    vi.stubEnv("MAILGUN_API_KEY", "synthetic-secret-marker");
    vi.stubEnv("MAILGUN_DOMAIN", "example.test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  it.each(["", "console", "unknown"])(
    "fails closed for unconfigured provider %s without logging email details",
    async provider => {
      vi.stubEnv("EMAIL_SERVICE", provider);
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      await expect(sendEmail(options)).resolves.toEqual({
        success: false,
        error: "EMAIL_PROVIDER_NOT_CONFIGURED",
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    }
  );
  it.each(["sendgrid", "mailgun"])(
    "does not echo %s rejection bodies",
    async provider => {
      vi.stubEnv("EMAIL_SERVICE", provider);
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response("synthetic-secret-marker private-evidence-marker", {
              status: 403,
            })
        )
      );
      const result = await sendEmail(options);
      expect(result).toEqual({ success: false, error: "EMAIL_SEND_FAILED" });
      const logs = JSON.stringify(error.mock.calls);
      expect(logs).not.toContain("synthetic-secret-marker");
      expect(logs).not.toContain("private-");
      expect(log).not.toHaveBeenCalled();
    }
  );
  it("sanitizes thrown network errors including nested credentials", async () => {
    vi.stubEnv("EMAIL_SERVICE", "sendgrid");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Bearer synthetic-secret-marker", { cause: options });
      })
    );
    expect(await sendEmail(options)).toEqual({
      success: false,
      error: "EMAIL_SEND_FAILED",
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain(
      "synthetic-secret-marker"
    );
    expect(JSON.stringify(error.mock.calls)).not.toContain("private-");
  });
  it("reports successful SendGrid acceptance without logging email details", async () => {
    vi.stubEnv("EMAIL_SERVICE", "sendgrid");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 202,
            headers: { "x-message-id": "provider-id" },
          })
      )
    );
    expect(await sendEmail(options)).toEqual({
      success: true,
      messageId: "provider-id",
    });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
