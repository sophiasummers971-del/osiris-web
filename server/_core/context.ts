import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import { sdk } from "./sdk.js";

type SupabaseAuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  app_metadata?: { role?: string };
  user_metadata?: { name?: string; full_name?: string };
};

async function authenticateSupabaseAuthorization(
  authorization: string | null | undefined
): Promise<User | null> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!authorization?.startsWith("Bearer ") || !supabaseUrl || !publishableKey)
    return null;

  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`,
    {
      headers: {
        apikey: publishableKey,
        Authorization: authorization,
      },
    }
  );

  if (!response.ok) return null;

  const identity = (await response.json()) as SupabaseAuthUser;
  if (!identity.id) return null;

  const createdAt = identity.created_at
    ? new Date(identity.created_at)
    : new Date();
  const configuredOwner = process.env.OWNER_EMAIL?.toLowerCase();
  const isAdmin =
    identity.app_metadata?.role === "admin" ||
    Boolean(
      configuredOwner && identity.email?.toLowerCase() === configuredOwner
    );

  return {
    id: 0,
    openId: `supabase:${identity.id}`,
    name:
      identity.user_metadata?.full_name ?? identity.user_metadata?.name ?? null,
    email: identity.email ?? null,
    loginMethod: "supabase",
    role: isAdmin ? "admin" : "user",
    createdAt,
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

async function authenticateSupabaseRequest(
  req: CreateExpressContextOptions["req"]
) {
  const authorization = req.headers.authorization;
  return authenticateSupabaseAuthorization(
    Array.isArray(authorization) ? authorization[0] : authorization
  );
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

export async function createFetchContext(
  request: Request,
  responseHeaders: Headers
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateSupabaseAuthorization(
      request.headers.get("authorization")
    );
  } catch {
    user = null;
  }

  const requestUrl = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());

  return {
    user,
    req: {
      protocol: requestUrl.protocol.replace(":", ""),
      hostname: requestUrl.hostname,
      headers,
    } as TrpcContext["req"],
    res: {
      clearCookie(name: string) {
        responseHeaders.append(
          "set-cookie",
          `${name}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=None`
        );
      },
    } as TrpcContext["res"],
  };
}
