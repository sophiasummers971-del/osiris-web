import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "./index";

function createEnvironment() {
  return {
    VITE_SUPABASE_URL: "https://osiris.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    ASSETS: {
      fetch: vi.fn(async () => new Response("spa", { status: 200 })),
    },
  };
}

describe("Cloudflare Worker", () => {
  it("reports API health without invoking static assets", async () => {
    const environment = createEnvironment();

    const response = await handleRequest(
      new Request("https://osiris.example/api/health"),
      environment
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "osiris-api",
      status: "ok",
    });
    expect(environment.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("rejects protected tRPC calls without a verified session", async () => {
    const environment = createEnvironment();
    const input = encodeURIComponent(JSON.stringify({ json: null }));

    const response = await handleRequest(
      new Request(
        `https://osiris.example/api/trpc/coinbase.treasury?input=${input}`
      ),
      environment
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain("UNAUTHORIZED");
    expect(environment.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("passes Cloudflare runtime variables to Supabase token verification", async () => {
    const environment = createEnvironment();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        id: "operator-1",
        email: "operator@example.com",
        created_at: "2026-08-08T00:00:00.000Z",
      })
    );
    const input = encodeURIComponent(JSON.stringify({ json: null }));

    const response = await handleRequest(
      new Request(`https://osiris.example/api/trpc/auth.me?input=${input}`, {
        headers: { Authorization: "Bearer valid-session-token" },
      }),
      environment
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("supabase:operator-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://osiris.supabase.co/auth/v1/user",
      expect.objectContaining({
        headers: {
          apikey: "sb_publishable_test",
          Authorization: "Bearer valid-session-token",
        },
      })
    );
    fetchMock.mockRestore();
  });

  it("delegates non-API requests to the static asset binding", async () => {
    const environment = createEnvironment();
    const request = new Request("https://osiris.example/vault");

    const response = await handleRequest(request, environment);

    expect(await response.text()).toBe("spa");
    expect(environment.ASSETS.fetch).toHaveBeenCalledWith(request);
  });
});
