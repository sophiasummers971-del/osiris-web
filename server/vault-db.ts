import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { osirisOperators } from "../drizzle/vault-schema.js";

let client: ReturnType<typeof postgres> | null = null;
let vaultDb: ReturnType<typeof drizzle> | null = null;

export function getVaultDb() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  if (!connectionString) return null;

  if (!client || !vaultDb) {
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

export async function ensureVaultOperator(db: NonNullable<ReturnType<typeof getVaultDb>>, user: SessionOperator) {
  const role = user.role === "admin" ? "admin" : "operator";
  const authUserId = user.openId.startsWith("supabase:") ? user.openId.slice("supabase:".length) : null;

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
