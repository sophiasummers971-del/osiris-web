import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/routers";
import { createFetchContext } from "../server/_core/context";

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type WorkerEnvironment = {
  ASSETS: AssetsBinding;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  OWNER_EMAIL?: string;
};

export async function handleRequest(
  request: Request,
  environment: WorkerEnvironment
) {
  const url = new URL(request.url);

  if (url.pathname === "/api/health") {
    return Response.json({ service: "osiris-api", status: "ok" });
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
