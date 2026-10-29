import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { registerSupabaseAuthProxy } from "./supabaseAuthProxy";

let server: Server | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) {
    const current = server;
    server = undefined;
    await new Promise<void>((resolve, reject) =>
      current.close(error => (error ? reject(error) : resolve()))
    );
  }
});

async function requestConfig() {
  const app = express();
  registerSupabaseAuthProxy(app);
  // Match the real entry point's static SPA fallback. Missing API routes must
  // not accidentally look successful because index.html responds with 200.
  app.get("*", (_req, res) =>
    res.type("html").send("<!doctype html><div id=root></div>")
  );
  server = createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/runtime-config`
  );
}

describe("Node authentication runtime configuration", () => {
  it("serves runtime auth settings as uncached JSON before the SPA fallback", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://synthetic-auth.invalid");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "synthetic-public-key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-secret-must-not-be-returned");
    vi.stubEnv(
      "SUPABASE_DATABASE_URL",
      "synthetic-database-must-not-be-returned"
    );

    const response = await requestConfig();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      supabaseUrl: "https://synthetic-auth.invalid",
      supabasePublishableKey: "synthetic-public-key",
    });
  });

  it("reports missing runtime auth settings as empty public fields", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await requestConfig();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      supabaseUrl: "",
      supabasePublishableKey: "",
    });
  });
});
