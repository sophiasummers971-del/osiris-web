import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/routers";
import { createFetchContext } from "../server/_core/context";
import type { WorkersAiBinding } from "../server/_core/aiGateway";
import { runDueMonitoring } from "../server/monitoring/runner";
import { EMAIL_TEST_RECIPIENT, EMAIL_TEST_SENDER } from "../server/email-test";
import { runEmailAlarms } from "../server/email-outbox";

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type WorkerEnvironment = {
  SUPABASE_SECRET_KEY?: string;
  email_verify?: { send(message: unknown): Promise<unknown> };
  ASSETS: AssetsBinding;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  OWNER_EMAIL?: string;
  SUPABASE_DATABASE_URL?: string;
  POSTGRES_URL?: string;
  HYPERDRIVE?: { connectionString: string };
  AI?: WorkersAiBinding;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  MONITORING_TOKEN_KEY?: string;
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
    if (
      request.method === "POST" &&
      url.pathname.includes("cases.uploadEvidence")
    ) {
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2 * 1024 * 1024) {
            await reader.cancel();
            return Response.json(
              { error: "Evidence request too large" },
              { status: 413 }
            );
          }
          chunks.push(value);
        }
      }
      const body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
      request = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body,
      });
    }
    return fetchRequestHandler({
      endpoint: "/api/trpc",
      req: request,
      router: appRouter,
      createContext: ({ req, resHeaders }) =>
        createFetchContext(req, resHeaders, {
          ...environment,
          sendEmailTest: environment.email_verify
            ? async () => {
                const { EmailMessage } = await import("cloudflare:email");
                const raw = [
                  `From: OSIRIS <${EMAIL_TEST_SENDER}>`,
                  `To: ${EMAIL_TEST_RECIPIENT}`,
                  "Subject: OSIRIS email delivery test - not a security alarm",
                  `Date: ${new Date().toUTCString()}`,
                  `Message-ID: <${crypto.randomUUID()}@iron-fire.uk>`,
                  "MIME-Version: 1.0",
                  "Content-Type: text/plain; charset=utf-8",
                  "Content-Transfer-Encoding: 7bit",
                  "",
                  "This is an approved OSIRIS email delivery test, not a security alarm.",
                  "No evidence, credentials, or account details are included.",
                  "Open OSIRIS and sign in to review alerts:",
                  "https://osiris-web.sophia-stars.workers.dev/notifications",
                  "This test does not change automatic-alarm settings.",
                  "",
                ].join("\r\n");
                await environment.email_verify!.send(
                  new EmailMessage(EMAIL_TEST_SENDER, EMAIL_TEST_RECIPIENT, raw)
                );
              }
            : undefined,
        }),
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
  scheduled(
    _controller: { scheduledTime: number; cron: string },
    environment: WorkerEnvironment,
    context: { waitUntil(promise: Promise<unknown>): void }
  ) {
    const databaseUrl =
      environment.HYPERDRIVE?.connectionString ??
      environment.SUPABASE_DATABASE_URL ??
      environment.POSTGRES_URL ??
      null;
    // Retry delivery even when the independent monitoring collector fails.
    context.waitUntil(
      runEmailAlarms(
        databaseUrl,
        environment.email_verify
          ? async alertId => {
              const { EmailMessage } = await import("cloudflare:email");
              const raw = [
                `From: OSIRIS <${EMAIL_TEST_SENDER}>`,
                `To: ${EMAIL_TEST_RECIPIENT}`,
                "Subject: OSIRIS security alert - review required",
                `Date: ${new Date().toUTCString()}`,
                `Message-ID: <osiris-alert-${alertId}@iron-fire.uk>`,
                "MIME-Version: 1.0",
                "Content-Type: text/plain; charset=utf-8",
                "Content-Transfer-Encoding: 7bit",
                "",
                "A high or critical rule-triggered security alert was recorded in OSIRIS.",
                "This is a signal for review, not proof of an account compromise.",
                "No evidence, credentials, or account details are included.",
                "Open OSIRIS and sign in to review your alerts:",
                "https://osiris-web.sophia-stars.workers.dev/notifications",
                "",
              ].join("\r\n");
              await environment.email_verify!.send(
                new EmailMessage(EMAIL_TEST_SENDER, EMAIL_TEST_RECIPIENT, raw)
              );
            }
          : undefined
      )
        .then(result => {
          console.log("[EmailAlarms] Scheduled run completed", result);
        })
        .catch(() => {
          console.error("[EmailAlarms] Scheduled run failed", {
            code: "EMAIL_ALARM_RUN_FAILED",
          });
          throw new Error("EMAIL_ALARM_RUN_FAILED");
        })
    );
    context.waitUntil(
      runDueMonitoring({
        databaseUrl:
          environment.HYPERDRIVE?.connectionString ??
          environment.SUPABASE_DATABASE_URL ??
          environment.POSTGRES_URL ??
          null,
        tokenEncryptionKey: environment.MONITORING_TOKEN_KEY,
      }).then(result => {
        console.log("[Monitoring] Scheduled run completed", result);
        if (!result.configured) {
          throw new Error(result.configurationError);
        }
      })
    );
  },
};
