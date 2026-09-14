import { describe, expect, it } from "vitest";
import {
  classifyVaultDatabaseError,
  getVaultConnectionString,
  normalizeSupabaseDatabaseUrl,
  probeVaultDatabase,
} from "./vault-db.js";

const url =
  "postgresql://postgres.project:password123@pooler.example.com:6543/postgres";

describe("normalizeSupabaseDatabaseUrl", () => {
  it("preserves a plain connection URL", () => {
    expect(normalizeSupabaseDatabaseUrl(url)).toBe(url);
  });

  it("removes dotenv assignment syntax and quotes", () => {
    expect(normalizeSupabaseDatabaseUrl(`DATABASE_URL="${url}"`)).toBe(url);
  });

  it("removes brackets wrapped around a copied password", () => {
    expect(
      normalizeSupabaseDatabaseUrl(
        url.replace(":password123@", ":[password123]@")
      )
    ).toBe(url);
  });

  it("rejects non-Postgres values without echoing them", () => {
    expect(() =>
      normalizeSupabaseDatabaseUrl("not a connection string")
    ).toThrow(
      "SUPABASE_DATABASE_URL must contain only a valid PostgreSQL connection URL"
    );
  });
});

describe("getVaultConnectionString", () => {
  it("prefers the explicit Supabase connection over a stale managed URL", () => {
    expect(
      getVaultConnectionString({
        POSTGRES_URL: "postgresql://managed",
        SUPABASE_DATABASE_URL: "postgresql://manual",
      })
    ).toBe("postgresql://manual");
  });

  it("uses the explicit Supabase URL when configured", () => {
    expect(
      getVaultConnectionString({
        SUPABASE_DATABASE_URL: "postgresql://manual",
      })
    ).toBe("postgresql://manual");
  });

  it("falls back to the managed Postgres URL", () => {
    expect(
      getVaultConnectionString({
        POSTGRES_URL: "postgresql://managed",
      })
    ).toBe("postgresql://managed");
  });

  it("returns null when no database connection is configured", () => {
    expect(getVaultConnectionString({})).toBeNull();
  });
});

describe("probeVaultDatabase", () => {
  it("reports a successful read-only database probe", async () => {
    await expect(
      probeVaultDatabase(async () => [{ ok: 1 }])
    ).resolves.toEqual({ ready: true });
  });

  it("sanitizes a failed database probe", async () => {
    await expect(
      probeVaultDatabase(async () => {
        throw new Error("postgresql://user:password@secret-host");
      })
    ).resolves.toEqual({
      ready: false,
      reason: "Operational database is unreachable",
    });
  });
});

describe("classifyVaultDatabaseError", () => {
  it("reports rejected credentials without exposing connection details", () => {
    const cause = Object.assign(new Error("password authentication failed"), {
      code: "28P01",
    });
    const error = new Error(
      "postgresql://operator:secret@database.example/query",
      { cause }
    );

    const result = classifyVaultDatabaseError(error);
    expect(result).toBe("Supabase rejected the database credentials");
    expect(result).not.toContain("secret");
  });

  it("reports a missing schema from a nested driver error", () => {
    const cause = Object.assign(new Error("relation does not exist"), {
      code: "42P01",
    });
    expect(classifyVaultDatabaseError(new Error("Failed query", { cause })))
      .toBe("The Vault schema is missing from the connected database");
  });

  it("keeps unknown failures generic", () => {
    expect(classifyVaultDatabaseError(new Error("private failure detail")))
      .toBe("Operational database is unreachable");
  });
});
