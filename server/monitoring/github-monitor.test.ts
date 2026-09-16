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

  it("uses stable external IDs for retries even at different check times", async () => {
    const first = await monitorGitHubAccount({
      accessToken: "secret",
      previousCheckpoint: {},
      observedAt: new Date("2026-09-15T12:00:00.000Z"),
      fetch: vi.fn(async () => accountResponse()),
    });
    const second = await monitorGitHubAccount({
      accessToken: "secret",
      previousCheckpoint: {},
      observedAt: new Date("2026-09-15T12:15:00.000Z"),
      fetch: vi.fn(async () => accountResponse()),
    });
    expect(first.observation?.externalId).toBe(second.observation?.externalId);
  });

  it("records distinct critical incidents after disabling, restoring, and disabling 2FA", async () => {
    const check = (
      previousCheckpoint: Record<string, unknown>,
      enabled: boolean
    ) =>
      monitorGitHubAccount({
        accessToken: "secret",
        previousCheckpoint: JSON.parse(JSON.stringify(previousCheckpoint)),
        // Incident identity must not depend on the clock.
        observedAt: new Date("2026-09-15T12:00:00.000Z"),
        fetch: vi.fn(async () =>
          accountResponse({ two_factor_authentication: enabled })
        ),
      });
    const first = await check(unchanged, false);
    const repeated = await check(first.checkpoint, false);
    const restored = await check(repeated.checkpoint, true);
    const second = await check(restored.checkpoint, false);
    const retry = await check(restored.checkpoint, false);

    expect(first.observation?.event).toMatchObject({
      signal: "PROTECTION_DISABLED",
      severity: "critical",
    });
    expect(repeated.observation).toBeNull();
    expect(repeated.checkpoint).toEqual(first.checkpoint);
    expect(second.observation?.event).toMatchObject({
      signal: "PROTECTION_DISABLED",
      severity: "critical",
    });
    expect(second.observation?.externalId).not.toBe(
      first.observation?.externalId
    );
    expect(retry.observation?.externalId).toBe(second.observation?.externalId);
  });

  it("keeps returning profile changes distinct across repeated cycles", async () => {
    const check = (
      previousCheckpoint: Record<string, unknown>,
      login: string
    ) =>
      monitorGitHubAccount({
        accessToken: "secret",
        previousCheckpoint,
        fetch: vi.fn(async () => accountResponse({ login })),
      });
    const first = await check(unchanged, "new-login");
    const returned = await check(first.checkpoint, "octocat");
    const second = await check(returned.checkpoint, "new-login");
    const secondReturn = await check(second.checkpoint, "octocat");

    for (const result of [first, returned, second, secondReturn]) {
      expect(result.observation?.event).toMatchObject({
        signal: "GITHUB_ACCOUNT_PROFILE_CHANGED",
        severity: "low",
      });
    }
    expect(
      new Set(
        [first, returned, second, secondReturn].map(
          result => result.observation?.externalId
        )
      ).size
    ).toBe(4);
  });
});
