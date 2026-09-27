import { describe, it, expect, vi } from "vitest";
import {
  beginGoogleAuthorization,
  readGoogleState,
  completeGoogleAuthorization,
  googleToken,
  GOOGLE_MAIL_SCOPE,
} from "./google-oauth";
import { monitorGoogleMail, securityMailObservation } from "./google-monitor";
const config = {
  enabled: true,
  clientId: "client",
  clientSecret: "secret",
  redirectUri: "https://example.com/integrations/google/callback",
  tokenEncryptionKey: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8",
};
const now = new Date();
const message = {
  id: "abc",
  internalDate: String(now.getTime()),
  payload: {
    headers: [
      { name: "From", value: "Google <no-reply@accounts.google.com>" },
      { name: "Subject", value: "Security alert private text" },
    ],
  },
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
describe("Google consent boundary", () => {
  it("fails closed while disabled", async () => {
    await expect(beginGoogleAuthorization(1, {})).rejects.toThrow(
      "GOOGLE_NOT_CONFIGURED"
    );
  });
  it("requests metadata with PKCE and binds encrypted state to owner and expiry", async () => {
    const result = await beginGoogleAuthorization(1, config, now.getTime());
    const url = new URL(result.authorizationUrl);
    expect(url.searchParams.get("scope")).toBe(
      `openid email ${GOOGLE_MAIL_SCOPE}`
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    await expect(
      readGoogleState(result.state, 1, config, now.getTime())
    ).resolves.toHaveProperty("verifier");
    await expect(
      readGoogleState(result.state, 2, config, now.getTime())
    ).rejects.toThrow();
    await expect(
      readGoogleState(result.state, 1, config, now.getTime() + 600001)
    ).rejects.toThrow();
  });
  it("rejects foreign owner before exchanging a code", async () => {
    const result = await beginGoogleAuthorization(1, config);
    const fetcher = vi.fn();
    await expect(
      completeGoogleAuthorization("code", result.state, 2, config, fetcher)
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires offline consent and matching verified mailbox", async () => {
    const result = await beginGoogleAuthorization(1, config);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          access_token: "access",
          refresh_token: "refresh",
          scope: GOOGLE_MAIL_SCOPE,
        })
      )
      .mockResolvedValueOnce(
        json({ sub: "123", email: "owner@example.com", email_verified: true })
      )
      .mockResolvedValueOnce(
        json({ emailAddress: "other@example.com", historyId: "100" })
      );
    await expect(
      completeGoogleAuthorization("code", result.state, 1, config, fetcher)
    ).rejects.toThrow("GOOGLE_IDENTITY_FAILED");
    expect(String(fetcher.mock.calls[0][1].body)).toContain("code_verifier=");
    const noRefresh = vi
      .fn()
      .mockResolvedValue(json({ access_token: "access" }));
    await expect(
      completeGoogleAuthorization("code", result.state, 1, config, noRefresh)
    ).rejects.toThrow("GOOGLE_OFFLINE_CONSENT_REQUIRED");
  });
  it("sanitizes provider failures", async () => {
    await expect(
      googleToken(
        {},
        config,
        vi
          .fn()
          .mockResolvedValue(
            json({ error: "invalid_grant", error_description: "secret" }, 400)
          )
      )
    ).rejects.toThrow("GOOGLE_REAUTHORIZATION_REQUIRED");
  });
});
describe("Google metadata collection", () => {
  it("stores a review notice without raw mail content or verified-sender claims", () => {
    const result = securityMailObservation(message, "123", now);
    expect(result?.event.details.senderVerified).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private text");
    expect(result?.event.severity).toBe("medium");
  });
  it("rejects unrelated senders and duplicate headers", () => {
    expect(
      securityMailObservation(
        {
          ...message,
          payload: {
            headers: [
              { name: "From", value: "no-reply@accounts.google.com.evil.test" },
              message.payload.headers[1],
            ],
          },
        },
        "123",
        now
      )
    ).toBeNull();
    expect(
      securityMailObservation(
        {
          ...message,
          payload: {
            headers: [...message.payload.headers, message.payload.headers[0]],
          },
        },
        "123",
        now
      )
    ).toBeNull();
  });
  it("deduplicates history entries and requests only metadata", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          historyId: "102",
          history: [
            {
              messagesAdded: [
                { message: { id: "abc" } },
                { message: { id: "abc" } },
              ],
            },
          ],
        })
      )
      .mockResolvedValueOnce(json(message));
    const result = await monitorGoogleMail({
      accessToken: "access",
      accountId: "123",
      previousCheckpoint: { historyId: "100" },
      observedAt: now,
      fetch: fetcher,
    });
    expect(result.observations).toHaveLength(1);
    expect(result.checkpoint.historyId).toBe("102");
    expect(fetcher.mock.calls[1][0]).toContain("format=metadata");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not silently reset expired history", async () => {
    await expect(
      monitorGoogleMail({
        accessToken: "access",
        accountId: "123",
        previousCheckpoint: { historyId: "100" },
        observedAt: now,
        fetch: vi.fn().mockResolvedValue(json({}, 404)),
      })
    ).rejects.toThrow("GOOGLE_HISTORY_EXPIRED");
  });
  it("skips a deleted message but rejects lost authorization", async () => {
    const history = {
      historyId: "102",
      history: [{ messagesAdded: [{ message: { id: "abc" } }] }],
    };
    const options = {
      accessToken: "access",
      accountId: "123",
      previousCheckpoint: { historyId: "100" },
      observedAt: now,
    };
    await expect(
      monitorGoogleMail({
        ...options,
        fetch: vi
          .fn()
          .mockResolvedValueOnce(json(history))
          .mockResolvedValueOnce(json({}, 404)),
      })
    ).resolves.toHaveProperty("observations", []);
    await expect(
      monitorGoogleMail({
        ...options,
        fetch: vi
          .fn()
          .mockResolvedValueOnce(json(history))
          .mockResolvedValueOnce(json({}, 401)),
      })
    ).rejects.toThrow("GOOGLE_REAUTHORIZATION_REQUIRED");
  });
});
