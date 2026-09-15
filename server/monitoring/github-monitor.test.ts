import { describe, expect, it, vi } from "vitest";
import { monitorGitHubAccount } from "./github-monitor.js";

const unchanged = {
  login: "octocat",
  name: "The Octocat",
  avatarUrl: "https://avatars.example/octocat",
  twoFactorAuthentication: true,
};

function accountResponse(overrides: Record<string, unknown> = {}) {
  return Response.json({
    id: 123,
    login: "octocat",
    name: "The Octocat",
    avatar_url: "https://avatars.example/octocat",
    two_factor_authentication: true,
    ...overrides,
  });
}

describe("GitHub account monitor", () => {
  it("does not emit repeated observations for unchanged state", async () => {
    const result = await monitorGitHubAccount({
      accessToken: "secret",
      previousCheckpoint: unchanged,
      fetch: vi.fn(async () => accountResponse()),
    });
    expect(result.observation).toBeNull();
    expect(result.checkpoint).toEqual(unchanged);
  });

  it("normalizes a profile change without storing a token", async () => {
    const result = await monitorGitHubAccount({
      accessToken: "secret",
      previousCheckpoint: unchanged,
      observedAt: new Date("2026-09-15T12:00:00.000Z"),
      fetch: vi.fn(async () => accountResponse({ login: "new-login" })),
    });
    expect(result.observation?.kind).toBe("github.account_profile");
    expect(result.observation?.event).toMatchObject({
      source: "github",
      signal: "GITHUB_ACCOUNT_PROFILE_CHANGED",
      severity: "low",
      confidence: 100,
    });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("raises the existing critical protection rule when 2FA is disabled", async () => {
    const result = await monitorGitHubAccount({
      accessToken: "secret",
      previousCheckpoint: unchanged,
      fetch: vi.fn(async () =>
        accountResponse({ two_factor_authentication: false })
      ),
    });
    expect(result.observation?.event).toMatchObject({
      category: "configuration",
      signal: "PROTECTION_DISABLED",
      severity: "critical",
      confidence: 100,
    });
  });

  it("uses stable external IDs so repeated provider states deduplicate", async () => {
    const first = await monitorGitHubAccount({
      accessToken: "secret",
      previousCheckpoint: {},
      fetch: vi.fn(async () => accountResponse()),
    });
    const second = await monitorGitHubAccount({
      accessToken: "secret",
      previousCheckpoint: {},
      fetch: vi.fn(async () => accountResponse()),
    });
    expect(first.observation?.externalId).toBe(second.observation?.externalId);
  });
});
