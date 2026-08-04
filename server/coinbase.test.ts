import { exportPKCS8, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { getCoinbaseTreasury } from "./coinbase.js";

let configuredEnvironment: NodeJS.ProcessEnv;

beforeAll(async () => {
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  configuredEnvironment = {
    COINBASE_API_KEY_NAME: "organizations/test/apiKeys/key",
    COINBASE_API_PRIVATE_KEY: await exportPKCS8(privateKey),
    COINBASE_PORTFOLIO_ID: "583bff77-da67-4c32-a8c6-e72d62b5517b",
  };
});

describe("getCoinbaseTreasury", () => {
  it("returns not_configured without revealing partial credentials", async () => {
    const result = await getCoinbaseTreasury({
      COINBASE_API_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----secret",
    } as NodeJS.ProcessEnv);

    expect(result).toEqual({
      status: "not_configured",
      reason: "Coinbase treasury credentials are not configured",
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("reduces a Coinbase response to the safe treasury shape", async () => {
    const request = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          portfolio: { name: "OSIRIS Treasury", type: "CONSUMER" },
          portfolio_balances: {
            total_balance: { value: "12.34", currency: "GBP" },
            total_cash_equivalent_balance: {
              value: "10.00",
              currency: "GBP",
            },
            total_crypto_balance: { value: "2.34", currency: "GBP" },
          },
          spot_positions: [
            {
              asset: "USDC",
              total_balance_crypto: 13.5,
              total_balance_fiat: 10,
              allocation: 0.81,
            },
          ],
        }),
        { status: 200 }
      )
    );

    const result = await getCoinbaseTreasury(configuredEnvironment, request);

    expect(result).toMatchObject({
      status: "connected",
      portfolio: {
        name: "OSIRIS Treasury",
        type: "CONSUMER",
        currency: "GBP",
      },
      balances: {
        total: "12.34",
        cashEquivalent: "10.00",
        crypto: "2.34",
      },
      positions: [
        { asset: "USDC", crypto: 13.5, fiat: 10, allocation: 0.81 },
      ],
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toContain(
      "/api/v3/brokerage/portfolios/583bff77-da67-4c32-a8c6-e72d62b5517b"
    );
    expect(request.mock.calls[0][1].headers.Authorization).toMatch(/^Bearer /);
    expect(JSON.stringify(result)).not.toContain(
      configuredEnvironment.COINBASE_API_PRIVATE_KEY
    );
  });

  it("returns degraded for provider and malformed-response failures", async () => {
    const denied = vi
      .fn()
      .mockResolvedValue(new Response("credential details", { status: 401 }));
    const malformed = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ portfolio: null })));

    await expect(
      getCoinbaseTreasury(configuredEnvironment, denied)
    ).resolves.toEqual({
      status: "degraded",
      reason: "Coinbase treasury is temporarily unavailable",
    });
    await expect(
      getCoinbaseTreasury(configuredEnvironment, malformed)
    ).resolves.toEqual({
      status: "degraded",
      reason: "Coinbase treasury is temporarily unavailable",
    });
  });
});
