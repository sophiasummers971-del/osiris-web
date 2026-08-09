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
  });

  return client;
}
