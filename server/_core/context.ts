import type { GoogleConfiguration } from "../monitoring/google-oauth.js";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import type { WorkersAiBinding } from "./aiGateway.js";
import { evidenceStorage, type EvidenceStorage } from "../evidence-storage.js";

export type AuthenticatedUser = Omit<User, "id"> & { id: string | number };

type SupabaseAuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  app_metadata?: { role?: string };
  user_metadata?: { name?: string; full_name?: string };
};

export type SupabaseAuthEnvironment = {
  SUPABASE_SECRET_KEY?: string;
  sendEmailTest?: () => Promise<void>;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  OWNER_EMAIL?: string;
  SUPABASE_DATABASE_URL?: string;
  POSTGRES_URL?: string;
  HYPERDRIVE?: { connectionString: string };
  AI?: WorkersAiBinding;
  GOOGLE_MONITORING_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  MONITORING_TOKEN_KEY?: string;
};

const processAuthEnvironment = (): SupabaseAuthEnvironment => ({
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  OWNER_EMAIL: process.env.OWNER_EMAIL,
  SUPABASE_DATABASE_URL: process.env.SUPABASE_DATABASE_URL,
  POSTGRES_URL: process.env.POSTGRES_URL,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  MONITORING_TOKEN_KEY: process.env.MONITORING_TOKEN_KEY,
});

const resolveRequestDatabaseUrl = (environment: SupabaseAuthEnvironment) =>
  environment.HYPERDRIVE?.connectionString ??
  environment.SUPABASE_DATABASE_URL ??
  environment.POSTGRES_URL ??
  null;

async function authenticateSupabaseAuthorization(
  authorization: string | null | undefined,
  environment: SupabaseAuthEnvironment = processAuthEnvironment()
): Promise<AuthenticatedUser | null> {
  const supabaseUrl = environment.VITE_SUPABASE_URL;
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  const configuredOwner = environment.OWNER_EMAIL?.toLowerCase();
  const isAdmin =
    identity.app_metadata?.role === "admin" ||
    Boolean(
      configuredOwner && identity.email?.toLowerCase() === configuredOwner
    );

  return {
    id: identity.id,
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
  googleOAuth?: GoogleConfiguration;
  postureEnvironment?: Record<string, string | undefined>;
  isProduction?: boolean;
  evidenceStorage?: EvidenceStorage;
  sendEmailTest?: () => Promise<void>;
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AuthenticatedUser | null;
  databaseUrl: string | null;
  ai: WorkersAiBinding | null;
  githubOAuth: {
    clientId?: string;
    clientSecret?: string;
    tokenEncryptionKey?: string;
  };
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: AuthenticatedUser | null = null;

  try {
    user = await authenticateSupabaseRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    postureEnvironment: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    isProduction: process.env.NODE_ENV === "production",
    req: opts.req,
    res: opts.res,
    user,
    databaseUrl: resolveRequestDatabaseUrl(processAuthEnvironment()),
    evidenceStorage: evidenceStorage(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SECRET_KEY
    ),
    ai: null,
    googleOAuth: {
      enabled: process.env.GOOGLE_MONITORING_ENABLED === "true",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      redirectUri: process.env.GOOGLE_REDIRECT_URI,
      tokenEncryptionKey: process.env.MONITORING_TOKEN_KEY,
    },
    githubOAuth: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      tokenEncryptionKey: process.env.MONITORING_TOKEN_KEY,
    },
  };
}

export async function createFetchContext(
  request: Request,
  responseHeaders: Headers,
  environment: SupabaseAuthEnvironment = processAuthEnvironment()
): Promise<TrpcContext> {
  let user: AuthenticatedUser | null = null;

  try {
    user = await authenticateSupabaseAuthorization(
      request.headers.get("authorization"),
      environment
    );
  } catch {
    user = null;
  }

  const requestUrl = new URL(request.url);
  const headers = Object.fromEntries(request.headers.entries());

  return {
    user,
    postureEnvironment: {
      VITE_SUPABASE_URL: environment.VITE_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: environment.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    isProduction: true,
    sendEmailTest: environment.sendEmailTest,
    databaseUrl: resolveRequestDatabaseUrl(environment),
    evidenceStorage: evidenceStorage(
      environment.VITE_SUPABASE_URL,
      environment.SUPABASE_SECRET_KEY
    ),
    ai: environment.AI ?? null,
    googleOAuth: {
      enabled: environment.GOOGLE_MONITORING_ENABLED === "true",
      clientId: environment.GOOGLE_CLIENT_ID,
      clientSecret: environment.GOOGLE_CLIENT_SECRET,
      redirectUri: environment.GOOGLE_REDIRECT_URI,
      tokenEncryptionKey: environment.MONITORING_TOKEN_KEY,
    },
    githubOAuth: {
      clientId: environment.GITHUB_CLIENT_ID,
      clientSecret: environment.GITHUB_CLIENT_SECRET,
      tokenEncryptionKey: environment.MONITORING_TOKEN_KEY,
    },
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
