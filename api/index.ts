import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "../server/_core/oauth.js";
import { registerStorageProxy } from "../server/_core/storageProxy.js";
import { createContext } from "../server/_core/context.js";
import { appRouter } from "../server/routers.js";
import { registerSupabaseAuthProxy } from "../server/_core/supabaseAuthProxy.js";

const app = express();

// Vercel invokes this function at /api/index. Restore the original nested API
// path passed by vercel.json before Express and tRPC perform route matching.
app.use((req, _res, next) => {
  const requestUrl = new URL(req.url, "http://vercel.internal");
  const forwardedPath = requestUrl.searchParams.get("__path");

  if (forwardedPath) {
    requestUrl.searchParams.delete("__path");
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${forwardedPath}${query ? `?${query}` : ""}`;
  }

  next();
});

registerSupabaseAuthProxy(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
    onError({ path, error }) {
      const cause = error.cause;
      console.error("[tRPC Error]", {
        path: path ?? "unknown",
        code: error.code,
        message: error.message,
        cause:
          cause instanceof Error ? cause.message : cause ? String(cause) : "",
      });
    },
  })
);

export default app;
