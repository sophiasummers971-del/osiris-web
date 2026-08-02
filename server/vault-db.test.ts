import { describe, expect, it } from "vitest";
import { normalizeSupabaseDatabaseUrl } from "./vault-db.js";

const url = "postgresql://postgres.project:password123@pooler.example.com:6543/postgres";

describe("normalizeSupabaseDatabaseUrl", () => {
  it("preserves a plain connection URL", () => {
    expect(normalizeSupabaseDatabaseUrl(url)).toBe(url);
  });

  it("removes dotenv assignment syntax and quotes", () => {
    expect(normalizeSupabaseDatabaseUrl(`DATABASE_URL=\"${url}\"`)).toBe(url);
  });

  it("removes brackets wrapped around a copied password", () => {
    expect(normalizeSupabaseDatabaseUrl(url.replace(":password123@", ":[password123]@"))).toBe(url);
  });

  it("rejects non-Postgres values without echoing them", () => {
    expect(() => normalizeSupabaseDatabaseUrl("not a connection string")).toThrow(
      "SUPABASE_DATABASE_URL must contain only a valid PostgreSQL connection URL",
    );
  });
});
