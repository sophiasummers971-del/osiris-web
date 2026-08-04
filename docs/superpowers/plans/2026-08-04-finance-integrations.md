# OSIRIS Finance Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a protected OSIRIS Finance page that safely displays the read-only Coinbase OSIRIS Treasury and verifies the existing Stripe payment connection.

**Architecture:** A focused Coinbase server module signs short-lived Advanced Trade REST JWTs and reduces provider data to a safe treasury view. The existing Stripe module gains a non-mutating status query. Protected tRPC routers expose both integrations to one React page whose panels load and fail independently.

**Tech Stack:** TypeScript 5.9, Express, tRPC 11, React 19, Wouter, TanStack Query, `jose`, Stripe Node SDK 22, Vitest, Vite.

## Global Constraints

- Coinbase is read-only: no trade, transfer, withdrawal, deposit-address, or payment-acceptance procedure.
- Coinbase credentials and raw provider responses remain server-side and must never be logged or returned.
- Coinbase uses `COINBASE_API_KEY_NAME`, `COINBASE_API_PRIVATE_KEY`, and `COINBASE_PORTFOLIO_ID`; display currency defaults to GBP.
- Stripe Checkout and signed webhook contracts remain unchanged.
- Missing configuration or provider failure degrades only its own panel and never application startup.
- The feature does not change authentication, case management, Evidence Vault behavior, or database schema.

---

### Task 1: Read-only Coinbase treasury client

**Files:**
- Create: `server/coinbase.ts`
- Test: `server/coinbase.test.ts`

**Interfaces:**
- Produces: `getCoinbaseTreasury(environment?: NodeJS.ProcessEnv, request?: typeof fetch): Promise<CoinbaseTreasuryResult>`.
- Produces: `CoinbaseTreasuryResult`, a discriminated union with `status: "connected" | "not_configured" | "degraded"`.
- Consumes: Coinbase Advanced Trade `GET /api/v3/brokerage/portfolios/{portfolio_id}?portfolio_balance_currency=GBP`.

- [ ] **Step 1: Write failing configuration and response-shaping tests**

```ts
it("returns not_configured without revealing partial credentials", async () => {
  const result = await getCoinbaseTreasury({} as NodeJS.ProcessEnv);
  expect(result).toEqual({
    status: "not_configured",
    reason: "Coinbase treasury credentials are not configured",
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE KEY");
});

it("reduces a Coinbase portfolio response to the safe treasury shape", async () => {
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    portfolio: { name: "OSIRIS Treasury", type: "CONSUMER" },
    portfolio_balances: {
      total_balance: { value: "12.34", currency: "GBP" },
      total_cash_equivalent_balance: { value: "10.00", currency: "GBP" },
      total_crypto_balance: { value: "2.34", currency: "GBP" },
    },
    spot_positions: [{ asset: "USDC", total_balance_crypto: 13.5, total_balance_fiat: 10 }],
  }), { status: 200 }));
  const result = await getCoinbaseTreasury(configuredEnvironment, request);
  expect(result).toMatchObject({ status: "connected", portfolio: { name: "OSIRIS Treasury" } });
  expect(JSON.stringify(result)).not.toContain(configuredEnvironment.COINBASE_API_PRIVATE_KEY);
});
```

- [ ] **Step 2: Run the focused test and verify the feature is absent**

Run: `pnpm vitest run server/coinbase.test.ts`

Expected: FAIL because `server/coinbase.ts` does not exist.

- [ ] **Step 3: Implement short-lived JWT signing, provider validation, and safe shaping**

```ts
export type CoinbaseTreasuryResult =
  | { status: "not_configured"; reason: string }
  | { status: "degraded"; reason: string }
  | {
      status: "connected";
      portfolio: { name: string; type: string; currency: string };
      balances: { total: string; cashEquivalent: string; crypto: string };
      positions: Array<{ asset: string; crypto: number; fiat: number; allocation?: number }>;
      checkedAt: Date;
    };

const buildCoinbaseJwt = async (method: "GET", path: string, keyName: string, privateKey: string) => {
  const now = Math.floor(Date.now() / 1000);
  const key = await importPKCS8(privateKey.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({ sub: keyName, iss: "cdp", nbf: now, exp: now + 120, uri: `${method} api.coinbase.com${path}` })
    .setProtectedHeader({ alg: "ES256", kid: keyName, nonce: randomBytes(16).toString("hex") })
    .sign(key);
};
```

Validate required fields with a narrow Zod schema, set an abort timeout, and map all non-2xx, timeout, authentication, and malformed-payload failures to `{ status: "degraded", reason: "Coinbase treasury is temporarily unavailable" }`. Log only the status/category, never the response body or credentials.

- [ ] **Step 4: Run Coinbase tests**

Run: `pnpm vitest run server/coinbase.test.ts`

Expected: PASS for missing configuration, safe shaping, failed response, malformed payload, and secret-redaction cases.

- [ ] **Step 5: Commit the Coinbase client slice**

```bash
git add server/coinbase.ts server/coinbase.test.ts
git commit -m "Add read-only Coinbase treasury client"
```

### Task 2: Protected Coinbase router and posture control

**Files:**
- Modify: `server/routers.ts`
- Modify: `server/_core/posture.ts`
- Modify: `server/_core/posture.test.ts`
- Test: `server/coinbase-router.test.ts`

**Interfaces:**
- Consumes: `getCoinbaseTreasury()` from Task 1.
- Produces: `appRouter.coinbase.treasury`, a protected, input-free query.
- Produces: posture control `id: "treasury"`, labelled `Coinbase treasury`, non-critical.

- [ ] **Step 1: Add failing posture and authentication tests**

```ts
expect(evaluateStaticPosture({
  ...configured,
  COINBASE_API_KEY_NAME: "organizations/test/apiKeys/key",
  COINBASE_API_PRIVATE_KEY: "secret",
  COINBASE_PORTFOLIO_ID: "portfolio-id",
}, true).find(control => control.id === "treasury")).toMatchObject({ ready: true, critical: false });
```

Create a tRPC caller with `user: null` and assert `caller.coinbase.treasury()` rejects with `UNAUTHORIZED` without invoking the provider seam.

- [ ] **Step 2: Run the tests and verify failure**

Run: `pnpm vitest run server/_core/posture.test.ts server/coinbase-router.test.ts`

Expected: FAIL because the treasury control and router do not exist.

- [ ] **Step 3: Register the protected query and non-critical posture control**

```ts
coinbase: router({
  treasury: protectedProcedure.query(() => getCoinbaseTreasury()),
}),
```

Extend `PostureControl["id"]` with `"treasury"`; mark it ready only when all three Coinbase variables exist and use `Coinbase treasury credentials are not configured` as the safe reason.

- [ ] **Step 4: Run router and posture tests**

Run: `pnpm vitest run server/_core/posture.test.ts server/coinbase-router.test.ts`

Expected: PASS, including explicit secret-redaction assertions.

- [ ] **Step 5: Commit the protected Coinbase surface**

```bash
git add server/routers.ts server/_core/posture.ts server/_core/posture.test.ts server/coinbase-router.test.ts
git commit -m "Expose protected treasury status"
```

### Task 3: Stripe operational status without changing payments

**Files:**
- Modify: `server/stripe.ts`
- Modify: `server/routers.ts`
- Test: `server/stripe-status.test.ts`

**Interfaces:**
- Produces: `getStripeStatus(environment?: NodeJS.ProcessEnv): Promise<StripeStatusResult>`.
- Produces: protected `appRouter.stripe.status` query.
- Preserves: `createCheckoutSession`, `handleStripeWebhook`, orders, subscriptions, and product procedures.

- [ ] **Step 1: Write failing Stripe status tests**

```ts
it("distinguishes missing server and webhook configuration", async () => {
  await expect(getStripeStatus({} as NodeJS.ProcessEnv)).resolves.toEqual({
    status: "not_configured",
    checkoutConfigured: false,
    webhookConfigured: false,
    reason: "Stripe server access is not configured",
  });
});

it("returns safe connected account metadata", async () => {
  stripeAccountsRetrieve.mockResolvedValue({ id: "acct_123", charges_enabled: true, payouts_enabled: true, details_submitted: true, livemode: false });
  await expect(getStripeStatus(configuredStripeEnvironment)).resolves.toMatchObject({
    status: "connected",
    mode: "test",
    chargesEnabled: true,
    webhookConfigured: true,
  });
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm vitest run server/stripe-status.test.ts`

Expected: FAIL because `getStripeStatus` does not exist.

- [ ] **Step 3: Implement non-mutating status retrieval**

Use Stripe `accounts.retrieve()` through the lazy server client. Return only mode, charge/payout/detail booleans, webhook-configured boolean, and a sanitized reason. Do not return account ID, email, business identity, secret key, webhook secret, or raw Stripe errors. Register `status: protectedProcedure.query(() => getStripeStatus())` without changing checkout or webhook code.

- [ ] **Step 4: Run Stripe tests and existing payment-adjacent checks**

Run: `pnpm vitest run server/stripe-status.test.ts server/_core/posture.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the Stripe status slice**

```bash
git add server/stripe.ts server/routers.ts server/stripe-status.test.ts
git commit -m "Add safe Stripe connection status"
```

### Task 4: Protected Finance page and navigation

**Files:**
- Create: `client/src/pages/Finance.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Navigation.tsx`

**Interfaces:**
- Consumes: `trpc.coinbase.treasury`, `trpc.stripe.status`, `trpc.stripe.getProducts`, `trpc.stripe.getUserOrders`, and `trpc.stripe.getUserSubscription`.
- Produces: protected browser route `/finance` with independent Coinbase and Stripe panels.

- [ ] **Step 1: Implement the authenticated page boundary**

Use `useAuth()` to show the existing authentication call-to-action until a verified session exists. Enable all finance queries only when `isAuthenticated` is true.

```tsx
const treasury = trpc.coinbase.treasury.useQuery(undefined, { enabled: isAuthenticated });
const stripe = trpc.stripe.status.useQuery(undefined, { enabled: isAuthenticated });
```

- [ ] **Step 2: Build independent Coinbase and Stripe cards**

Coinbase displays portfolio name/type, GBP total, cash/crypto split, position rows, checked time, and configured/degraded/empty states. Stripe displays connection mode, charges, payouts, webhook readiness, product count, order count, subscription state, and its own loading/degraded state. Use existing Card, Badge, Alert, Skeleton, and Table primitives; do not render provider error objects.

- [ ] **Step 3: Register route and navigation link**

```tsx
<Route path="/finance" component={Finance} />
```

Add `["Finance", "/finance"]` to the shared navigation links so desktop and mobile menus remain consistent.

- [ ] **Step 4: Run static verification**

Run: `pnpm check`

Expected: PASS with no TypeScript errors.

- [ ] **Step 5: Commit the Finance UI slice**

```bash
git add client/src/pages/Finance.tsx client/src/App.tsx client/src/components/Navigation.tsx
git commit -m "Add OSIRIS finance workspace"
```

### Task 5: Configuration contract and full verification

**Files:**
- Create: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Documents: exact Vercel environment variable names and read-only Coinbase permission requirement.
- Verifies: the complete integrated feature without deploying or moving money.

- [ ] **Step 1: Document variables without values**

```dotenv
COINBASE_API_KEY_NAME=
COINBASE_API_PRIVATE_KEY=
COINBASE_PORTFOLIO_ID=583bff77-da67-4c32-a8c6-e72d62b5517b
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

State in README that the Coinbase key must be scoped to the OSIRIS Treasury and have View permission only. Explain that Stripe connection readiness is not proof of settlement and that the final payment check uses Stripe test mode.

- [ ] **Step 2: Run secret and diff checks**

Run: `git diff --check && ! git diff | rg "(sk_live_|sk_test_[A-Za-z0-9]{12}|whsec_[A-Za-z0-9]{12}|BEGIN (EC )?PRIVATE KEY)"`

Expected: PASS with no credential material in the diff.

- [ ] **Step 3: Run focused and broad verification**

Run: `pnpm vitest run server/coinbase.test.ts server/coinbase-router.test.ts server/stripe-status.test.ts server/_core/posture.test.ts`

Expected: PASS.

Run: `pnpm test && pnpm check && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 4: Inspect the integrated diff**

Run: `git status --short && git diff --stat HEAD~4..HEAD && git log -5 --oneline`

Expected: only Finance integration, tests, and documentation changes; no database migration, credential value, trading procedure, transfer procedure, or unrelated edit.

- [ ] **Step 5: Commit documentation if changed after the UI slice**

```bash
git add .env.example README.md
git commit -m "Document finance integration configuration"
```

Do not deploy, push, configure Vercel, execute a Stripe charge, move Coinbase funds, or grant broader Coinbase permissions as part of this plan. Those are separate explicit operational actions after code verification.
