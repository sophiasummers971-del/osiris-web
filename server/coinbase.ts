import { randomBytes } from "node:crypto";
import { importPKCS8, SignJWT } from "jose";
import { z } from "zod";

const COINBASE_HOST = "api.coinbase.com";
const UNAVAILABLE_REASON = "Coinbase treasury is temporarily unavailable";

const balanceSchema = z.object({
  value: z.string(),
  currency: z.string(),
});

const portfolioResponseSchema = z.object({
  portfolio: z.object({
    name: z.string(),
    type: z.string(),
  }),
  portfolio_balances: z.object({
    total_balance: balanceSchema,
    total_cash_equivalent_balance: balanceSchema,
    total_crypto_balance: balanceSchema,
  }),
  spot_positions: z
    .array(
      z.object({
        asset: z.string(),
        total_balance_crypto: z.number(),
        total_balance_fiat: z.number(),
        allocation: z.number().optional(),
      })
    )
    .default([]),
});

export type CoinbaseTreasuryResult =
  | { status: "not_configured"; reason: string }
  | { status: "degraded"; reason: string }
  | {
      status: "connected";
      portfolio: { name: string; type: string; currency: string };
      balances: { total: string; cashEquivalent: string; crypto: string };
      positions: Array<{
        asset: string;
        crypto: number;
        fiat: number;
        allocation?: number;
      }>;
      checkedAt: Date;
    };

async function buildCoinbaseJwt({
  method,
  path,
  keyName,
  privateKey,
}: {
  method: "GET";
  path: string;
  keyName: string;
  privateKey: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const signingKey = await importPKCS8(
    privateKey.replace(/\\n/g, "\n"),
    "ES256"
  );

  return new SignJWT({
    sub: keyName,
    iss: "cdp",
    nbf: now,
    exp: now + 120,
    uri: `${method} ${COINBASE_HOST}${path}`,
  })
    .setProtectedHeader({
      alg: "ES256",
      kid: keyName,
      nonce: randomBytes(16).toString("hex"),
    })
    .sign(signingKey);
}

export async function getCoinbaseTreasury(
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
): Promise<CoinbaseTreasuryResult> {
  const keyName = environment.COINBASE_API_KEY_NAME;
  const privateKey = environment.COINBASE_API_PRIVATE_KEY;
  const portfolioId = environment.COINBASE_PORTFOLIO_ID;

  if (!keyName || !privateKey || !portfolioId) {
    return {
      status: "not_configured",
      reason: "Coinbase treasury credentials are not configured",
    };
  }

  const path = `/api/v3/brokerage/portfolios/${encodeURIComponent(portfolioId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const token = await buildCoinbaseJwt({
      method: "GET",
      path,
      keyName,
      privateKey,
    });
    const response = await request(
      `https://${COINBASE_HOST}${path}?portfolio_balance_currency=GBP`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      console.error("[Coinbase] Treasury request failed", {
        status: response.status,
      });
      return { status: "degraded", reason: UNAVAILABLE_REASON };
    }

    const parsed = portfolioResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error("[Coinbase] Treasury response was invalid", {
        type: "validation",
      });
      return { status: "degraded", reason: UNAVAILABLE_REASON };
    }

    const data = parsed.data;
    return {
      status: "connected",
      portfolio: {
        name: data.portfolio.name,
        type: data.portfolio.type,
        currency: data.portfolio_balances.total_balance.currency,
      },
      balances: {
        total: data.portfolio_balances.total_balance.value,
        cashEquivalent:
          data.portfolio_balances.total_cash_equivalent_balance.value,
        crypto: data.portfolio_balances.total_crypto_balance.value,
      },
      positions: data.spot_positions.map(position => ({
        asset: position.asset,
        crypto: position.total_balance_crypto,
        fiat: position.total_balance_fiat,
        ...(position.allocation === undefined
          ? {}
          : { allocation: position.allocation }),
      })),
      checkedAt: new Date(),
    };
  } catch (error) {
    console.error("[Coinbase] Treasury request failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return { status: "degraded", reason: UNAVAILABLE_REASON };
  } finally {
    clearTimeout(timeout);
  }
}
