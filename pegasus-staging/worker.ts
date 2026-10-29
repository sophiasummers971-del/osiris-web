/**
 * Pegasus isolated staging observer. No production service bindings, secrets,
 * D1 databases, routes, domains, cron triggers or privileged network calls.
 * This Worker does NOT change traffic: it reports a fixed synthetic state.
 */
export interface Env {
  PEGASUS_STAGING_ONLY: string;
}
const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (env.PEGASUS_STAGING_ONLY !== "true") {
      return new Response("Staging seal required", { status: 503 });
    }
    const url = new URL(request.url);
    if (request.method !== "GET") {
      return new Response("Read-only staging observer", { status: 405 });
    }
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ service: "pegasus-routing-staging", mode: "synthetic", ready: true }),
        { status: 200, headers: jsonHeaders }
      );
    }
    if (url.pathname === "/routes") {
      return new Response(
        JSON.stringify({
          mode: "synthetic",
          active: "primary",
          pipelines: {
            primary: "active",
            failover: "standby",
            "sector7-a": "sealed",
            "sector7-b": "sealed",
          },
          authority: "not-configured",
          appliesRoutingChanges: false,
        }),
        { status: 200, headers: jsonHeaders }
      );
    }
    return new Response("Not found", { status: 404 });
  },
};
