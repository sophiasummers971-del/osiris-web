import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/routers";
import { createFetchContext } from "../server/_core/context";
import type { WorkersAiBinding } from "../server/_core/aiGateway";

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type WorkerEnvironment = {
  ASSETS: AssetsBinding;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  OWNER_EMAIL?: string;
  SUPABASE_DATABASE_URL?: string;
  POSTGRES_URL?: string;
  HYPERDRIVE?: { connectionString: string };
  AI?: WorkersAiBinding;
};

const AUTH_PROXY_PREFIX = "/api/supabase-auth/";
const AUTH_PROXY_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);

async function proxySupabaseAuth(
  request: Request,
  environment: WorkerEnvironment
) {
  const supabaseUrl = environment.VITE_SUPABASE_URL;
  const publishableKey = environment.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    return Response.json(
      { error: "Authentication is not configured" },
      { status: 503 }
    );
  }
  if (!AUTH_PROXY_METHODS.has(request.method)) {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const requestUrl = new URL(request.url);
  const authPath = requestUrl.pathname.slice(AUTH_PROXY_PREFIX.length);
  if (!authPath) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const upstreamUrl = new URL(
    `/auth/v1/${authPath}${requestUrl.search}`,
    supabaseUrl
  );
  const upstreamHeaders = new Headers();
  for (const name of [
    "authorization",
    "content-type",
    "x-client-info",
    "x-supabase-api-version",
  ]) {
    const value = request.headers.get(name);
    if (value) upstreamHeaders.set(name, value);
  }
  upstreamHeaders.set("apikey", publishableKey);

  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: upstreamHeaders,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : request.body,
    redirect: "manual",
  });
  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function handleRequest(
  request: Request,
  environment: WorkerEnvironment
) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return Response.json({
      service: "osiris-api",
      status: "ok",
      hyperdriveBound: Boolean(environment.HYPERDRIVE?.connectionString),
      workersAiBound: Boolean(environment.AI),
    });
  }

  if (url.pathname === "/api/runtime-config") {
    return Response.json(
      {
        supabaseUrl: environment.VITE_SUPABASE_URL ?? "",
        supabasePublishableKey: environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (url.pathname.startsWith(AUTH_PROXY_PREFIX)) {
    return proxySupabaseAuth(request, environment);
  }

  if (url.pathname.startsWith("/api/trpc")) {
    return fetchRequestHandler({
      endpoint: "/api/trpc",
      req: request,
      router: appRouter,
      createContext: ({ req, resHeaders }) =>
        createFetchContext(req, resHeaders, environment),
      onError({ error, path }) {
        console.error("[tRPC] Request failed", {
          code: error.code,
          path,
        });
      },
    });
  }

  if (url.pathname.startsWith("/api/")) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return environment.ASSETS.fetch(request);
}

export default {
  fetch: handleRequest,
};
