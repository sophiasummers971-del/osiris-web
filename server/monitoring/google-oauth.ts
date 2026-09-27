import {
  decryptMonitoringToken,
  encryptMonitoringToken,
} from "./token-crypto.js";

export const GOOGLE_MAIL_SCOPE =
  "https://www.googleapis.com/auth/gmail.metadata";
async function diagnosticStep<T>(label: string, operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    // Preserve only errors deliberately defined by this module. Provider
    // responses, credentials, codes and network exception text stay private.
    if (error instanceof Error && /^GOOGLE_[A-Z_]+$/.test(error.message))
      throw error;
    throw new Error(`GOOGLE_${label}_FAILED`);
  }
}
export type GoogleConfiguration = {
  enabled?: boolean;
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  tokenEncryptionKey?: string;
};
export function requireGoogleConfiguration(config?: GoogleConfiguration) {
  if (
    !config?.enabled ||
    !config.clientId ||
    !config.clientSecret ||
    !config.redirectUri ||
    !config.tokenEncryptionKey
  )
    throw new Error("GOOGLE_NOT_CONFIGURED");
  const redirect = new URL(config.redirectUri);
  if (
    redirect.protocol !== "https:" ||
    redirect.search ||
    redirect.hash ||
    redirect.pathname !== "/integrations/google/callback"
  )
    throw new Error("GOOGLE_NOT_CONFIGURED");
  return config as Required<GoogleConfiguration>;
}
const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...Array.from(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export async function beginGoogleAuthorization(
  ownerId: number,
  config: GoogleConfiguration,
  now = Date.now()
) {
  const c = requireGoogleConfiguration(config);
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    )
  );
  const state = await encryptMonitoringToken(
    JSON.stringify({
      provider: "google",
      ownerId,
      verifier,
      redirectUri: c.redirectUri,
      expiresAt: now + 600_000,
    }),
    c.tokenEncryptionKey
  );
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    response_type: "code",
    scope: `openid email ${GOOGLE_MAIL_SCOPE}`,
    access_type: "offline",
    prompt: "consent select_account",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return { authorizationUrl: url.toString(), state };
}
export async function readGoogleState(
  state: string,
  ownerId: number,
  config: GoogleConfiguration,
  now = Date.now()
) {
  const c = requireGoogleConfiguration(config);
  const parsed = JSON.parse(
    await decryptMonitoringToken(state, c.tokenEncryptionKey)
  );
  if (
    parsed.provider !== "google" ||
    parsed.ownerId !== ownerId ||
    parsed.redirectUri !== c.redirectUri ||
    !Number.isSafeInteger(parsed.expiresAt) ||
    parsed.expiresAt <= now ||
    parsed.expiresAt > now + 600_000 ||
    typeof parsed.verifier !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(parsed.verifier)
  )
    throw new Error("GOOGLE_STATE_INVALID");
  return parsed as { verifier: string };
}
export async function googleToken(
  parameters: Record<string, string>,
  config: GoogleConfiguration,
  fetcher = globalThis.fetch
) {
  const c = requireGoogleConfiguration(config);
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...parameters,
      client_id: c.clientId,
      client_secret: c.clientSecret,
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || typeof body.access_token !== "string")
    throw new Error(
      body.error === "invalid_client"
        ? "GOOGLE_CLIENT_REJECTED"
        : body.error === "invalid_grant"
          ? "GOOGLE_REAUTHORIZATION_REQUIRED"
          : "GOOGLE_TOKEN_FAILED"
    );
  if (
    typeof body.scope === "string" &&
    !body.scope.split(" ").includes(GOOGLE_MAIL_SCOPE)
  )
    throw new Error("GOOGLE_SCOPE_MISSING");
  return {
    accessToken: body.access_token,
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : undefined,
  };
}
export async function googleGet(
  path: string,
  token: string,
  fetcher = globalThis.fetch
) {
  const response = await fetcher(
    `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
    {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "GOOGLE_HISTORY_EXPIRED"
        : response.status === 401 || response.status === 403
          ? "GOOGLE_REAUTHORIZATION_REQUIRED"
          : "GOOGLE_API_FAILED"
    );
  return response.json();
}
export async function completeGoogleAuthorization(
  code: string,
  state: string,
  ownerId: number,
  config: GoogleConfiguration,
  fetcher = globalThis.fetch
) {
  const c = requireGoogleConfiguration(config);
  const { verifier } = await diagnosticStep("STATE_DECODE", () =>
    readGoogleState(state, ownerId, c)
  );
  const token = await diagnosticStep("TOKEN_EXCHANGE", () =>
    googleToken(
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: c.redirectUri,
        code_verifier: verifier,
      },
      c,
      fetcher
    )
  );
  if (!token.refreshToken) throw new Error("GOOGLE_OFFLINE_CONSENT_REQUIRED");
  const identityResponse = await diagnosticStep("IDENTITY_FETCH", () =>
    fetcher("https://openidconnect.googleapis.com/v1/userinfo", {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${token.accessToken}` },
    })
  );
  if (!identityResponse.ok) throw new Error("GOOGLE_IDENTITY_FAILED");
  const identity = (await diagnosticStep("IDENTITY_RESPONSE", () =>
    identityResponse.json()
  )) as Record<string, unknown>;
  if (
    typeof identity.sub !== "string" ||
    typeof identity.email !== "string" ||
    identity.email_verified !== true
  )
    throw new Error("GOOGLE_IDENTITY_FAILED");
  const profile = await diagnosticStep("PROFILE_FETCH", () =>
    googleGet("profile", token.accessToken, fetcher)
  );
  if (
    typeof profile.historyId !== "string" ||
    !/^\d+$/.test(profile.historyId) ||
    profile.emailAddress?.toLowerCase() !== identity.email.toLowerCase()
  )
    throw new Error("GOOGLE_IDENTITY_FAILED");
  return {
    ...token,
    accountId: identity.sub,
    email: identity.email,
    historyId: profile.historyId,
  };
}
export async function revokeGoogleToken(
  token: string,
  fetcher = globalThis.fetch
) {
  const response = await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  if (!response.ok) throw new Error("GOOGLE_REVOCATION_FAILED");
}
