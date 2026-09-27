import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetchContext, createContext } from "./context";
const environment = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  OWNER_EMAIL: "owner@example.com",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const context = (token = "test") =>
  createFetchContext(
    new Request("https://osiris.test/api/trpc/auth.me", {
      headers: { authorization: `Bearer ${token}` },
    }),
    new Headers(),
    environment
  );
describe("Supabase identity boundary", () => {
  it("preserves distinct authenticated identities instead of numeric zero", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: "a", email: "a@example.com" }))
      .mockResolvedValueOnce(
        Response.json({ id: "b", email: "b@example.com" })
      );
    vi.stubGlobal("fetch", fetcher);
    const a = await context("a");
    const b = await context("b");
    expect(a.user?.id).toBe("a");
    expect(b.user?.id).toBe("b");
    expect(a.user?.openId).toBe("supabase:a");
    expect(b.user?.openId).toBe("supabase:b");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe("Bearer a");
  });
  it("does not trust user-editable metadata for administrator privileges", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "a",
          email: "a@example.com",
          user_metadata: { role: "admin" },
        })
      )
    );
    expect((await context()).user?.role).toBe("user");
  });
  it("accepts only server-controlled role metadata or configured owner email", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ id: "a", email: "OWNER@example.com" })
        )
    );
    expect((await context()).user?.role).toBe("admin");
  });
  it("fails closed on rejected credentials and provider errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 401 }))
        .mockRejectedValueOnce(new Error("private provider data"))
    );
    expect((await context()).user).toBeNull();
    expect((await context()).user).toBeNull();
  });
  it("does not resurrect a legacy cookie identity in Express", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", environment.VITE_SUPABASE_URL);
    vi.stubEnv(
      "VITE_SUPABASE_PUBLISHABLE_KEY",
      environment.VITE_SUPABASE_PUBLISHABLE_KEY
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await createContext({
      req: { headers: { cookie: "app_session_id=legacy-token" } },
      res: {},
    } as never);
    expect(result.user).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses request bindings for database and posture without exposing service secrets", async () => {
    const result = await createFetchContext(
      new Request("https://osiris.test"),
      new Headers(),
      {
        ...environment,
        HYPERDRIVE: { connectionString: "postgresql://bound" },
        POSTGRES_URL: "postgresql://fallback",
        SUPABASE_SECRET_KEY: "private-test-marker",
      }
    );
    expect(result.databaseUrl).toBe("postgresql://bound");
    expect(result.postureEnvironment?.VITE_SUPABASE_URL).toBe(
      environment.VITE_SUPABASE_URL
    );
    expect(JSON.stringify(result.postureEnvironment)).not.toContain(
      "private-test-marker"
    );
  });
});
