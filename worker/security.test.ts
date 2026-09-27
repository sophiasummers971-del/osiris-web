import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "./index";
import { SECURITY_HEADERS } from "../shared/security-headers";
import { readFileSync } from "node:fs";
const environment = () => ({
  ASSETS: { fetch: vi.fn(async () => new Response("app")) },
});
afterEach(() => vi.unstubAllGlobals());
describe("Worker response and identity contract", () => {
  it.each([
    "/",
    "/api/health",
    "/api/runtime-config",
    "/api/missing",
    "/api/supabase-auth/token",
    "/api/trpc/cases.list",
  ])("protects %s including errors", async path => {
    const response = await handleRequest(
      new Request(`https://osiris.test${path}`),
      environment()
    );
    for (const [key, value] of Object.entries(SECURITY_HEADERS))
      expect(response.headers.get(key)).toBe(value);
    if (path.startsWith("/api/"))
      expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("uses matching protection for assets served without the Worker", () => {
    const content = readFileSync("client/public/_headers", "utf8");
    for (const [key, value] of Object.entries(SECURITY_HEADERS))
      expect(content).toContain(`${key}: ${value}`);
  });
  it("does not leak unexpected upstream failures", async () => {
    const env = environment();
    env.ASSETS.fetch.mockRejectedValue(new Error("private-secret-marker"));
    const response = await handleRequest(
      new Request("https://osiris.test/"),
      env
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private-secret-marker");
  });
  it.each([
    "notifications.getUnreadCount",
    "supporters.getStats",
    "system.notifyOwner",
  ])("retires legacy endpoint %s", async procedure => {
    const response = await handleRequest(
      new Request(`https://osiris.test/api/trpc/${procedure}`),
      environment()
    );
    expect(response.status).toBe(404);
  });
  it("keeps service credentials out of runtime configuration", async () => {
    const response = await handleRequest(
      new Request("https://osiris.test/api/runtime-config"),
      {
        ...environment(),
        SUPABASE_SECRET_KEY: "private-test-marker",
        MONITORING_TOKEN_KEY: "encryption-test-marker",
      }
    );
    const body = await response.text();
    expect(body).not.toContain("private-test-marker");
    expect(body).not.toContain("encryption-test-marker");
  });
  it("sanitizes inference failures at the HTTP boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ id: "a" }))
    );
    const response = await handleRequest(
      new Request("https://osiris.test/api/trpc/intelligence.generate", {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ json: { prompt: "test" } }),
      }),
      {
        ...environment(),
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "public-key",
        AI: {
          run: vi.fn().mockRejectedValue(new Error("private-provider-marker")),
        },
      }
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private-provider-marker");
  });
});
