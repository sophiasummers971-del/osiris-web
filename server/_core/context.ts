import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

type SupabaseAuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  app_metadata?: { role?: string };
  user_metadata?: { name?: string; full_name?: string };
};

async function authenticateSupabaseRequest(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  const authorization = req.headers.authorization;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !publishableKey) return null;

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: authorization,
    },
  });

  if (!response.ok) return null;

  const identity = await response.json() as SupabaseAuthUser;
  if (!identity.id) return null;

  const createdAt = identity.created_at ? new Date(identity.created_at) : new Date();
  const configuredOwner = process.env.OWNER_EMAIL?.toLowerCase();
  const isAdmin = identity.app_metadata?.role === "admin" || Boolean(configuredOwner && identity.email?.toLowerCase() === configuredOwner);

  return {
    id: 0,
    openId: `supabase:${identity.id}`,
    name: identity.user_metadata?.full_name ?? identity.user_metadata?.name ?? null,
    email: identity.email ?? null,
    loginMethod: "supabase",
    role: isAdmin ? "admin" : "user",
    createdAt,
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateSupabaseRequest(opts.req);
    if (!user) user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
