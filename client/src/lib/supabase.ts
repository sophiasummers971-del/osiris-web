import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
let publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";

let client: SupabaseClient | null = null;

export let isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);

export function configureSupabase(url?: string, key?: string) {
  if (!url || !key || isSupabaseConfigured) return;

  supabaseUrl = url;
  publishableKey = key;
  isSupabaseConfigured = true;
}

export function getSupabaseClient() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase Auth is not configured");
  }

  client ??= createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      fetch: async (input, init) => {
        const requestUrl = new URL(
          input instanceof Request ? input.url : input.toString(),
          window.location.origin
        );
        const configuredOrigin = new URL(supabaseUrl).origin;

        if (
          requestUrl.origin === configuredOrigin &&
          requestUrl.pathname.startsWith("/auth/v1/")
        ) {
          const proxyUrl = new URL(
            `/api/supabase-auth${requestUrl.pathname.slice("/auth/v1".length)}`,
            window.location.origin
          );
          proxyUrl.search = requestUrl.search;

          return input instanceof Request
            ? globalThis.fetch(new Request(proxyUrl, input), init)
            : globalThis.fetch(proxyUrl, init);
        }

        return globalThis.fetch(input, init);
      },
    },
  });

  return client;
}
