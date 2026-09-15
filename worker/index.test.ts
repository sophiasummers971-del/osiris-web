import { describe, expect, it, vi } from "vitest";
import worker, { handleRequest } from "./index";

function createEnvironment() {
  return {
    VITE_SUPABASE_URL: "https://osiris.supabase.co",
    VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    HYPERDRIVE: {
      connectionString: "postgresql://hyperdrive.internal/postgres",
    },
    AI: {
      run: vi.fn(),
    },
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
      hyperdriveBound: true,
      workersAiBound: true,
    });
    expect(environment.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("serves public Supabase runtime configuration", async () => {
    const environment = createEnvironment();
    const response = await handleRequest(
      new Request("https://osiris.example/api/runtime-config"),
      environment
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      supabaseUrl: environment.VITE_SUPABASE_URL,
      supabasePublishableKey: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(environment.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("rejects protected tRPC calls without a verified session", async () => {
    const environment = createEnvironment();
    const input = encodeURIComponent(JSON.stringify({ json: null }));

    const response = await handleRequest(
      new Request(`https://osiris.example/api/trpc/cases.list?input=${input}`),
      environment
    );

    expect(response.status).toBe(401);
    expect(await response.text()).toContain("UNAUTHORIZED");
    expect(environment.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("proxies browser auth requests through the OSIRIS origin", async () => {
    const environment = createEnvironment();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ access_token: "test-session" }));

    const response = await handleRequest(
      new Request(
        "https://osiris.example/api/supabase-auth/token?grant_type=password",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-client-info": "supabase-js-test",
          },
          body: JSON.stringify({ email: "operator@example.com" }),
        }
      ),
      environment
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://osiris.supabase.co/auth/v1/token?grant_type=password"),
      expect.objectContaining({
        method: "POST",
        redirect: "manual",
      })
    );
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("apikey")).toBe("sb_publishable_test");
    expect(headers.get("x-client-info")).toBe("supabase-js-test");
    fetchMock.mockRestore();
  });

  it("does not expose removed finance API procedures", async () => {
    const environment = createEnvironment();
    const input = encodeURIComponent(JSON.stringify({ json: null }));
    const response = await handleRequest(
      new Request(
        `https://osiris.example/api/trpc/coinbase.treasury?input=${input}`
      ),
      environment
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("NOT_FOUND");
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

  it("hands scheduled monitoring to the execution context", async () => {
    const environment = createEnvironment();
    const waitUntil = vi.fn();

    worker.scheduled(
      { scheduledTime: Date.now(), cron: "*/15 * * * *" },
      environment,
      { waitUntil }
    );

    expect(waitUntil).toHaveBeenCalledTimes(1);
    await expect(waitUntil.mock.calls[0][0]).resolves.toEqual({
      processed: 0,
      failed: 0,
      configured: false,
    });
  });
});
