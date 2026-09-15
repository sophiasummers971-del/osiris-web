import { describe, expect, it, vi } from "vitest";
import {
  createGitHubOAuthRequest,
  exchangeGitHubOAuthCode,
  getGitHubAccount,
  readGitHubOAuthState,
  revokeGitHubOAuthToken,
  type GitHubOAuthConfiguration,
} from "./github-oauth.js";

const configuration: GitHubOAuthConfiguration = {
  clientId: "github-client",
  clientSecret: "github-secret",
  tokenEncryptionKey: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
};

describe("GitHub OAuth", () => {
  it("creates a short-lived state bound to the operator and browser nonce", async () => {
    const request = await createGitHubOAuthRequest({
      ownerId: 42,
      callbackUrl: "https://osiris.example/api/integrations/github/callback",
      configuration,
      now: 1_000,
    });
    const url = new URL(request.authorizationUrl);
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe("github-client");
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://osiris.example/api/integrations/github/callback"
    );
    await expect(
      readGitHubOAuthState({
        state: request.state,
        expectedNonce: request.nonce,
        tokenEncryptionKey: configuration.tokenEncryptionKey,
        now: 2_000,
      })
    ).resolves.toMatchObject({ ownerId: 42, nonce: request.nonce });
  });

  it("rejects a mismatched browser nonce or expired state", async () => {
    const request = await createGitHubOAuthRequest({
      ownerId: 42,
      callbackUrl: "https://osiris.example/api/integrations/github/callback",
      configuration,
      now: 1_000,
    });
    await expect(
      readGitHubOAuthState({
        state: request.state,
        expectedNonce: "another-browser",
        tokenEncryptionKey: configuration.tokenEncryptionKey,
        now: 2_000,
      })
    ).rejects.toThrow("Invalid or expired");
    await expect(
      readGitHubOAuthState({
        state: request.state,
        expectedNonce: request.nonce,
        tokenEncryptionKey: configuration.tokenEncryptionKey,
        now: 700_000,
      })
    ).rejects.toThrow("Invalid or expired");
  });

  it("exchanges a code without exposing the client secret in the result", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ access_token: "access-token", scope: "read:user" })
    );
    await expect(
      exchangeGitHubOAuthCode({ code: "temporary-code", configuration, fetch })
    ).resolves.toEqual({ accessToken: "access-token", scopes: ["read:user"] });
    expect(fetch).toHaveBeenCalledWith(
      "https://github.com/login/oauth/access_token",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("normalizes the authenticated GitHub account", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        id: 123,
        login: "octocat",
        name: "The Octocat",
        avatar_url: "https://avatars.example/octocat",
        two_factor_authentication: true,
      })
    );
    await expect(
      getGitHubAccount({ accessToken: "access-token", fetch })
    ).resolves.toEqual({
      id: 123,
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://avatars.example/octocat",
      twoFactorAuthentication: true,
    });
    const [, init] = fetch.mock.calls[0];
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer access-token"
    );
  });

  it("revokes a token using OAuth app credentials", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    await expect(
      revokeGitHubOAuthToken({
        accessToken: "access-token",
        configuration,
        fetch,
      })
    ).resolves.toBeUndefined();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/applications/github-client/token"
    );
    expect(init?.method).toBe("DELETE");
    expect(new Headers(init?.headers).get("authorization")).toMatch(/^Basic /);
    expect(init?.body).toBe(JSON.stringify({ access_token: "access-token" }));
  });
});
