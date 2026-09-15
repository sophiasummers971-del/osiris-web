import {
  decryptMonitoringToken,
  encryptMonitoringToken,
} from "./token-crypto.js";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_URL = "https://api.github.com";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const GITHUB_OAUTH_SCOPES = ["read:user"] as const;

export type GitHubOAuthConfiguration = {
  clientId: string;
  clientSecret: string;
  tokenEncryptionKey: string;
};

type OAuthState = {
  ownerId: number;
  nonce: string;
  expiresAt: number;
};

type GitHubTokenResponse = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
};

export type GitHubAccount = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
  twoFactorAuthentication: boolean | null;
};

export function assertGitHubOAuthConfiguration(
  configuration: Partial<GitHubOAuthConfiguration>
): GitHubOAuthConfiguration {
  if (
    !configuration.clientId ||
    !configuration.clientSecret ||
    !configuration.tokenEncryptionKey
  ) {
    throw new Error("GitHub monitoring is not configured");
  }
  return configuration as GitHubOAuthConfiguration;
}

export async function createGitHubOAuthRequest(options: {
  ownerId: number;
  callbackUrl: string;
  configuration: GitHubOAuthConfiguration;
  now?: number;
}) {
  const nonce = crypto.randomUUID();
  const state: OAuthState = {
    ownerId: options.ownerId,
    nonce,
    expiresAt: (options.now ?? Date.now()) + OAUTH_STATE_TTL_MS,
  };
  const encryptedState = await encryptMonitoringToken(
    JSON.stringify(state),
    options.configuration.tokenEncryptionKey
  );
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", options.configuration.clientId);
  url.searchParams.set("redirect_uri", options.callbackUrl);
  url.searchParams.set("scope", GITHUB_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", encryptedState);
  return { authorizationUrl: url.toString(), state: encryptedState, nonce };
}

export async function readGitHubOAuthState(options: {
  state: string;
  expectedNonce?: string;
  tokenEncryptionKey: string;
  now?: number;
}) {
  let parsed: OAuthState;
  try {
    parsed = JSON.parse(
      await decryptMonitoringToken(options.state, options.tokenEncryptionKey)
    ) as OAuthState;
  } catch {
    throw new Error("Invalid GitHub authorization state");
  }
  if (
    !Number.isSafeInteger(parsed.ownerId) ||
    parsed.ownerId <= 0 ||
    !parsed.nonce ||
    (options.expectedNonce !== undefined &&
      parsed.nonce !== options.expectedNonce) ||
    !Number.isSafeInteger(parsed.expiresAt) ||
    parsed.expiresAt < (options.now ?? Date.now())
  ) {
    throw new Error("Invalid or expired GitHub authorization state");
  }
  return parsed;
}

export async function exchangeGitHubOAuthCode(options: {
  code: string;
  configuration: GitHubOAuthConfiguration;
  fetch?: typeof globalThis.fetch;
}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      client_id: options.configuration.clientId,
      client_secret: options.configuration.clientSecret,
      code: options.code,
    }),
  });
  const body = (await response.json()) as GitHubTokenResponse;
  if (!response.ok || !body.access_token || body.error) {
    throw new Error("GitHub rejected the authorization code");
  }
  return {
    accessToken: body.access_token,
    scopes: (body.scope ?? "")
      .split(",")
      .map(scope => scope.trim())
      .filter(Boolean),
  };
}

export async function getGitHubAccount(options: {
  accessToken: string;
  fetch?: typeof globalThis.fetch;
}): Promise<GitHubAccount> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(`${API_URL}/user`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${options.accessToken}`,
      "user-agent": "osiris-monitoring",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) throw new Error("GitHub account verification failed");
  const body = (await response.json()) as Record<string, unknown>;
  if (
    typeof body.id !== "number" ||
    typeof body.login !== "string" ||
    typeof body.avatar_url !== "string"
  ) {
    throw new Error("GitHub returned an invalid account response");
  }
  return {
    id: body.id,
    login: body.login,
    name: typeof body.name === "string" ? body.name : null,
    avatarUrl: body.avatar_url,
    twoFactorAuthentication:
      typeof body.two_factor_authentication === "boolean"
        ? body.two_factor_authentication
        : null,
  };
}

export async function revokeGitHubOAuthToken(options: {
  accessToken: string;
  configuration: GitHubOAuthConfiguration;
  fetch?: typeof globalThis.fetch;
}) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const basicCredentials = btoa(
    `${options.configuration.clientId}:${options.configuration.clientSecret}`
  );
  const response = await fetcher(
    `${API_URL}/applications/${encodeURIComponent(options.configuration.clientId)}/token`,
    {
      method: "DELETE",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Basic ${basicCredentials}`,
        "content-type": "application/json",
        "user-agent": "osiris-monitoring",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ access_token: options.accessToken }),
    }
  );
  if (!response.ok) throw new Error("GitHub token revocation failed");
}
