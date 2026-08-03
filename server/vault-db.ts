import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { osirisOperators } from "../drizzle/vault-schema.js";

let client: ReturnType<typeof postgres> | null = null;
let vaultDb: ReturnType<typeof drizzle> | null = null;

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
  POSTGRES_URL?: string;
  SUPABASE_DATABASE_URL?: string;
};

export function getVaultConnectionString(
  environment: VaultEnvironment = process.env
) {
  return (
    environment.POSTGRES_URL ??
    environment.SUPABASE_DATABASE_URL ??
    null
  );
}

export function getVaultDb() {
  const rawConnectionString = getVaultConnectionString();
  if (!rawConnectionString) return null;

  if (!client || !vaultDb) {
    const connectionString = normalizeSupabaseDatabaseUrl(rawConnectionString);
    client = postgres(connectionString, {
      max: 5,
      prepare: false,
      ssl: "require",
    });
    vaultDb = drizzle(client);
  }

  return vaultDb;
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

  const [operator] = await db
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

  if (operator) return operator;

  const [existing] = await db
    .select()
    .from(osirisOperators)
    .where(eq(osirisOperators.externalId, user.openId))
    .limit(1);

  if (!existing) throw new Error("Unable to provision OSIRIS operator");
  return existing;
}
