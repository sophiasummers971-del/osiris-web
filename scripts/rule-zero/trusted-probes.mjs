import { evaluatePreflight } from "./preflight.mjs";

const ENDPOINTS = Object.freeze({
  github: "https://api.github.com/user",
  cloudflare: "https://api.cloudflare.com/client/v4/user",
});

function statusClass(response) {
  if (response.status === 401) return "AUTH_EXPIRED";
  if (
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0")
  )
    return "RATE_LIMITED";
  if (response.status === 403) return "API_ACCESS_BLOCKED";
  if (response.status >= 500) return "PROVIDER_ERROR";
  if (!response.ok) return "API_ACCESS_BLOCKED";
  return "API_HEALTHY";
}

/**
 * Read-only diagnostic probe. A caller cannot supply a URL.
 * This does NOT grant execution: approval and expiry remain unverified.
 */
export async function collectProviderProbe({
  provider,
  credential,
  expectedIdentity,
  jobId,
  target,
  fetchImpl = fetch,
  now = Date.now(),
}) {
  if (
    !Object.hasOwn(ENDPOINTS, provider) ||
    typeof credential !== "string" ||
    !credential ||
    !expectedIdentity
  )
    return {
      light: "RED",
      decision: "PREFLIGHT_BLOCKED",
      reason: "INVALID_CONFIGURATION",
    };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  let classification = "PROVIDER_ERROR";
  let identityMatch = false;
  let quota = "UNKNOWN";
  try {
    const response = await fetchImpl(ENDPOINTS[provider], {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `${provider === "github" ? "Bearer" : "Bearer"} ${credential}`,
        Accept: "application/json",
      },
    });
    classification = statusClass(response);
    quota =
      response.status === 429 ||
      response.headers.get("x-ratelimit-remaining") === "0"
        ? "FAIL"
        : "UNKNOWN";
    if (response.ok) {
      const body = await response.json();
      const actual = provider === "github" ? body.login : body.result?.email;
      identityMatch = typeof actual === "string" && actual === expectedIdentity;
    }
  } catch {
    classification = "PROVIDER_ERROR";
  } finally {
    clearTimeout(timeout);
  }
  const apiHealthy = classification === "API_HEALTHY";
  const evidence = {
    source: "trusted-runner",
    jobId,
    target,
    checkedAt: new Date(now).toISOString(),
    credentialExpiry: "unknown",
    ownerApproval: false,
    checks: {
      connectivity: apiHealthy ? "PASS" : "FAIL",
      authentication: apiHealthy ? "PASS" : "FAIL",
      authorization: identityMatch ? "PASS" : "FAIL",
      providerStatus: apiHealthy ? "PASS" : "UNKNOWN",
      quota,
      sourceBaseline: "UNKNOWN",
    },
  };
  return {
    ...evaluatePreflight(evidence, now),
    classification,
    identityMatch,
    provider,
  };
}
