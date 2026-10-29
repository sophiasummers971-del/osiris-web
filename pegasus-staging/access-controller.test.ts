import { describe, expect, it } from "vitest";
import { verifyControllerAccess } from "./access-controller.js";
import worker from "./worker.js";

const email = "owner@example.test";
const audience = "test-access-audience";
const ctx = (identity: string, aud = audience) => ({
  access: {
    aud,
    async getIdentity() {
      return { email: identity };
    },
  },
});

describe("Cloudflare Access Pegasus controller gate", () => {
  it("accepts exact identity and audience", async () => {
    expect(await verifyControllerAccess(ctx(email), email, audience)).toBe(true);
  });
  it("rejects a missing access context", async () => {
    expect(await verifyControllerAccess(undefined, email, audience)).toBe(false);
  });
  it("rejects wrong email or audience", async () => {
    expect(await verifyControllerAccess(ctx("intruder@example.test"), email, audience)).toBe(false);
    expect(await verifyControllerAccess(ctx(email, "wrong"), email, audience)).toBe(false);
  });
  it("rejects missing configuration and failed identity lookups", async () => {
    expect(await verifyControllerAccess(ctx(email), "", audience)).toBe(false);
    expect(await verifyControllerAccess(ctx(email), email, "")).toBe(false);
    expect(await verifyControllerAccess({ access: { aud: audience, async getIdentity() { throw Error("unavailable"); } } }, email, audience)).toBe(false);
  });
  it("never trusts supplied email headers", async () => {
    const env = { PEGASUS_STAGING_ONLY: "true", PEGASUS_CONTROLLER_EMAIL: email, PEGASUS_ACCESS_AUD: audience };
    const request = new Request("https://staging.example.test/controller", { headers: { "Cf-Access-Authenticated-User-Email": email } });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(403);
  });
  it("provides read-only controller proof when Access is present", async () => {
    const env = { PEGASUS_STAGING_ONLY: "true", PEGASUS_CONTROLLER_EMAIL: email, PEGASUS_ACCESS_AUD: audience };
    const res = await worker.fetch(new Request("https://staging.example.test/controller"), env, ctx(email));
    expect(res.status).toBe(200);
    expect((await res.json()).routingEnabled).toBe(false);
    const denied = await worker.fetch(new Request("https://staging.example.test/controller", { method: "POST" }), env, ctx(email));
    expect(denied.status).toBe(405);
  });
});
