import type { Express } from "express";
import express from "express";

const allowedMethods = new Set(["GET", "POST", "PUT", "DELETE"]);

export function registerSupabaseAuthProxy(app: Express) {
  app.use(
    "/api/supabase-auth",
    express.raw({ type: "*/*", limit: "1mb" }),
    async (req, res) => {
      const supabaseUrl = process.env.VITE_SUPABASE_URL;
      const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      res.setHeader("Cache-Control", "no-store");
      if (!supabaseUrl || !publishableKey) {
        return res
          .status(503)
          .json({ error: "Authentication is not configured" });
      }
      if (!allowedMethods.has(req.method)) {
        return res.status(405).json({ error: "Method not allowed" });
      }
      if (!req.path || req.path === "/") {
        return res.status(404).json({ error: "Not found" });
      }

      const requestUrl = new URL(req.originalUrl, "http://osiris.internal");
      const upstreamUrl = new URL(
        `/auth/v1${req.path}${requestUrl.search}`,
        supabaseUrl
      );
      const headers = new Headers({ apikey: publishableKey });
      for (const name of [
        "authorization",
        "content-type",
        "x-client-info",
        "x-supabase-api-version",
      ]) {
        const value = req.header(name);
        if (value) headers.set(name, value);
      }

      try {
        const upstream = await fetch(upstreamUrl, {
          method: req.method,
          headers,
          body: req.method === "GET" ? undefined : req.body,
          redirect: "manual",
        });
        const contentType = upstream.headers.get("content-type");
        if (contentType) res.setHeader("Content-Type", contentType);
        return res
          .status(upstream.status)
          .send(Buffer.from(await upstream.arrayBuffer()));
      } catch (error) {
        console.error("[Auth] Supabase proxy failed", {
          type: error instanceof Error ? error.name : "Unknown",
        });
        return res
          .status(502)
          .json({ error: "Authentication service unavailable" });
      }
    }
  );
}
