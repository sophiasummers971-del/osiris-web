import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { osirisOperators } from "../drizzle/vault-schema.js";

export function normalizeSupabaseDatabaseUrl(rawValue: string) {
  let value = rawValue.trim();
  const assignment = value.match(
    /^(?:SUPABASE_)?DATABASE_URL\s*=\s*([\s\S]+)$/i
  );
  if (assignment) value = assignment[1].trim();

  const wrapped = value.match(/^(["'])([\s\S]*)\1$/);
  if (wrapped) value = wrapped[2].trim();

  // Supabase examples render the password placeholder in square brackets.
  // Accept a copied-and-replaced bracketed password without retaining brackets.
  value = value.replace(
    /^(postgres(?:ql)?:\/\/[^:]+):\[([^\]]*)\]@/i,
    "$1:$2@"
  );

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "SUPABASE_DATABASE_URL must contain only a valid PostgreSQL connection URL"
    );
  }

  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname
  ) {
    throw new Error(
      "SUPABASE_DATABASE_URL must use the postgresql:// connection format"
    );
  }

  return value;
}

type VaultEnvironment = {
  [key: string]: string | undefined;
  POSTGRES_URL?: string;
  SUPABASE_DATABASE_URL?: string;
};

export function getVaultConnectionString(
  environment: VaultEnvironment = process.env
) {
  return (
    environment.SUPABASE_DATABASE_URL ??
    environment.POSTGRES_URL ??
    null
  );
}

export function getVaultDb(
  rawConnectionString: string | null = getVaultConnectionString()
) {
  if (!rawConnectionString) return null;

  // A Worker isolate can serve unrelated requests over its lifetime, but I/O
  // objects must not be reused across those requests. Construct the client in
  // request scope; Cloudflare/Hyperdrive owns the underlying connection pool.
  const connectionString = normalizeSupabaseDatabaseUrl(rawConnectionString);
  const requestClient = postgres(connectionString, {
    max: 1,
    prepare: false,
    fetch_types: false,
  });
  return drizzle(requestClient);
}

type DatabaseProbe = () => Promise<unknown>;

async function runVaultDatabaseProbe(rawConnectionString?: string | null) {
  rawConnectionString ??= getVaultConnectionString();
  if (!rawConnectionString) throw new Error("Database client unavailable");
  const connectionString = normalizeSupabaseDatabaseUrl(rawConnectionString);
  const requestClient = postgres(connectionString, {
    max: 1,
    prepare: false,
    fetch_types: false,
  });
  return requestClient`select 1 as ok`;
}

function collectDatabaseErrorDetails(error: unknown) {
  const details: string[] = [];
  const pending: unknown[] = [error];
  const visited = new Set<unknown>();

  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (current instanceof Error) {
      details.push(current.name, current.message);
      pending.push(current.cause);
    }
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (typeof record.code === "string") details.push(record.code);
      if (Array.isArray(record.errors)) pending.push(...record.errors);
    }
  }

  return details.join(" ").toLowerCase();
}

export function classifyVaultDatabaseError(error: unknown) {
  const details = collectDatabaseErrorDetails(error);

  if (details.includes("28p01") || details.includes("password authentication"))
    return "Supabase rejected the database credentials";
  if (details.includes("3d000")) return "The configured Supabase database does not exist";
  if (details.includes("42501") || details.includes("permission denied"))
    return "The database connection lacks permission for the Vault";
  if (details.includes("42p01") || details.includes("does not exist"))
    return "The Vault schema is missing from the connected database";
  if (details.includes("enotfound") || details.includes("getaddrinfo"))
    return "The Supabase database hostname could not be resolved";
  if (details.includes("econnrefused"))
    return "The Supabase database refused the connection";
  if (details.includes("etimedout") || details.includes("timeout"))
    return "The Supabase database connection timed out";
  if (details.includes("valid postgresql connection url"))
    return "SUPABASE_DATABASE_URL is not a valid PostgreSQL URL";
  if (details.includes("certificate") || details.includes("tls"))
    return "The secure Supabase database connection failed";

  return "Operational database is unreachable";
}

export async function probeVaultDatabase(
  probe?: DatabaseProbe,
  connectionString?: string | null
) {
  try {
    await (probe ? probe() : runVaultDatabaseProbe(connectionString));
    return { ready: true } as const;
  } catch (error) {
    console.error("[Posture] Database probe failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      ready: false,
      reason: classifyVaultDatabaseError(error),
    } as const;
  }
}

type SessionOperator = {
  openId: string;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
};

export async function ensureVaultOperator(
  db: NonNullable<ReturnType<typeof getVaultDb>>,
  user: SessionOperator
) {
  const role = user.role === "admin" ? "admin" : "operator";
  const authUserId = user.openId.startsWith("supabase:")
    ? user.openId.slice("supabase:".length)
    : null;

  let operator: typeof osirisOperators.$inferSelect | undefined;
  try {
    [operator] = await db
      .insert(osirisOperators)
      .values({
        externalId: user.openId,
        authUserId,
        displayName: user.name,
        email: user.email,
        role,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: osirisOperators.externalId,
        set: {
          displayName: user.name,
          email: user.email,
          role,
          authUserId,
          updatedAt: new Date(),
        },
      })
      .returning();
  } catch (error) {
    throw new Error(classifyVaultDatabaseError(error));
  }

  if (operator) return operator;

  const [existing] = await db
    .select()
    .from(osirisOperators)
    .where(eq(osirisOperators.externalId, user.openId))
    .limit(1);

  if (!existing) throw new Error("Unable to provision OSIRIS operator");
  return existing;
}
