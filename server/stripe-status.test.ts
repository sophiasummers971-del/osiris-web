import { describe, expect, it, vi } from "vitest";
import { getStripeStatus } from "./stripe.js";

describe("getStripeStatus", () => {
  it("distinguishes missing server and webhook configuration", async () => {
    await expect(
      getStripeStatus({} as NodeJS.ProcessEnv, {} as never)
    ).resolves.toEqual({
      status: "not_configured",
      checkoutConfigured: false,
      webhookConfigured: false,
      reason: "Stripe server access is not configured",
    });

    await expect(
      getStripeStatus(
        { STRIPE_SECRET_KEY: "sk_test_secret" } as NodeJS.ProcessEnv,
        { accounts: { retrieve: vi.fn() } } as never
      )
    ).resolves.toMatchObject({
      status: "not_configured",
      checkoutConfigured: true,
      webhookConfigured: false,
      reason: "Stripe webhook signing is not configured",
    });
  });

  it("returns only safe connected account metadata", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      id: "acct_private",
      email: "private@example.com",
      charges_enabled: true,
      payouts_enabled: false,
      details_submitted: true,
    });

    const result = await getStripeStatus(
      {
        STRIPE_SECRET_KEY: "sk_test_secret",
        STRIPE_WEBHOOK_SECRET: "whsec_secret",
      } as NodeJS.ProcessEnv,
      { accounts: { retrieve } } as never
    );

    expect(result).toEqual({
      status: "connected",
      mode: "test",
      checkoutConfigured: true,
      webhookConfigured: true,
      chargesEnabled: true,
      payoutsEnabled: false,
      detailsSubmitted: true,
      checkedAt: expect.any(Date),
    });
    expect(JSON.stringify(result)).not.toContain("acct_private");
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("sk_test_secret");
    expect(JSON.stringify(result)).not.toContain("whsec_secret");
  });

  it("sanitizes provider failures", async () => {
    const retrieve = vi.fn().mockRejectedValue(new Error("sk_live_leaked"));

    await expect(
      getStripeStatus(
        {
          STRIPE_SECRET_KEY: "sk_live_secret",
          STRIPE_WEBHOOK_SECRET: "whsec_secret",
        } as NodeJS.ProcessEnv,
        { accounts: { retrieve } } as never
      )
    ).resolves.toEqual({
      status: "degraded",
      checkoutConfigured: true,
      webhookConfigured: true,
      reason: "Stripe account status is temporarily unavailable",
    });
  });
});
