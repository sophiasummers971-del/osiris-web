import { getGitHubAccount, type GitHubAccount } from "./github-oauth.js";
import type { PegasusEvent } from "../pegasus.js";

export type GitHubAccountCheckpoint = {
  login: string;
  name: string | null;
  avatarUrl: string;
  twoFactorAuthentication: boolean | null;
};

function checkpointFromAccount(account: GitHubAccount): GitHubAccountCheckpoint {
  return {
    login: account.login,
    name: account.name,
    avatarUrl: account.avatarUrl,
    twoFactorAuthentication: account.twoFactorAuthentication,
  };
}

function checkpointsMatch(
  previous: Record<string, unknown>,
  current: GitHubAccountCheckpoint
) {
  return (
    previous.login === current.login &&
    previous.name === current.name &&
    previous.avatarUrl === current.avatarUrl &&
    previous.twoFactorAuthentication === current.twoFactorAuthentication
  );
}

async function fingerprintCheckpoint(checkpoint: GitHubAccountCheckpoint) {
  const canonical = JSON.stringify([
    checkpoint.login,
    checkpoint.name,
    checkpoint.avatarUrl,
    checkpoint.twoFactorAuthentication,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical)
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function monitorGitHubAccount(options: {
  accessToken: string;
  previousCheckpoint: Record<string, unknown>;
  observedAt?: Date;
  fetch?: typeof globalThis.fetch;
}) {
  const account = await getGitHubAccount({
    accessToken: options.accessToken,
    fetch: options.fetch,
  });
  const checkpoint = checkpointFromAccount(account);
  if (checkpointsMatch(options.previousCheckpoint, checkpoint)) {
    return { checkpoint, observation: null };
  }

  const twoFactorWasDisabled =
    options.previousCheckpoint.twoFactorAuthentication === true &&
    checkpoint.twoFactorAuthentication === false;
  const event: PegasusEvent = {
    source: "github",
    category: twoFactorWasDisabled ? "configuration" : "integration",
    signal: twoFactorWasDisabled
      ? "PROTECTION_DISABLED"
      : "GITHUB_ACCOUNT_PROFILE_CHANGED",
    severity: twoFactorWasDisabled ? "critical" : "low",
    confidence: 100,
    observedAt: options.observedAt ?? new Date(),
    details: {
      providerAccountId: String(account.id),
      previous: {
        login: options.previousCheckpoint.login ?? null,
        name: options.previousCheckpoint.name ?? null,
        avatarUrl: options.previousCheckpoint.avatarUrl ?? null,
        twoFactorAuthentication:
          options.previousCheckpoint.twoFactorAuthentication ?? null,
      },
      current: checkpoint,
    },
  };
  return {
    checkpoint,
    observation: {
      externalId: `github:account:${account.id}:${await fingerprintCheckpoint(checkpoint)}`,
      kind: "github.account_profile",
      event,
    },
  };
}
