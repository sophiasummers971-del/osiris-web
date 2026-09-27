import { afterEach, expect, it, vi } from "vitest";

const createClient = vi.hoisted(() => vi.fn(() => ({})));
vi.mock("@supabase/supabase-js", () => ({ createClient }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  createClient.mockClear();
});

it("prefers deployed runtime configuration over stale build variables", async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://old.example");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "old-public-key");
  const auth = await import("./supabase");
  auth.configureSupabase("https://current.example", "current-public-key");
  auth.getSupabaseClient();
  expect(createClient).toHaveBeenCalledWith(
    "https://current.example",
    "current-public-key",
    expect.any(Object)
  );
});

it("does not switch an already-created authentication client", async () => {
  const auth = await import("./supabase");
  auth.configureSupabase("https://current.example", "current-public-key");
  const first = auth.getSupabaseClient();
  auth.configureSupabase("https://other.example", "other-public-key");
  expect(auth.getSupabaseClient()).toBe(first);
  expect(createClient).toHaveBeenCalledTimes(1);
});
