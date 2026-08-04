# OSIRIS Finance Integrations Design

## Outcome

Add a protected `/finance` workspace that gives an authenticated OSIRIS operator one safe place to inspect Coinbase treasury data and Stripe payment readiness. Coinbase access is read-only in this version. Stripe retains its existing checkout and signed-webhook flows while gaining an operational view and explicit connection checks.

## Scope

### Coinbase treasury

- Read the portfolio identified by `COINBASE_PORTFOLIO_ID` from the server only.
- Use server-side Coinbase credentials with view permission only.
- Return a deliberately small response: portfolio name and type, total value, cash-equivalent value, crypto value, spot positions, denomination currency, and connection status.
- Default the display currency to GBP.
- Do not expose API credentials, raw provider responses, trading, transfers, withdrawal actions, deposit addresses, or payment acceptance in this version.

### Stripe operations

- Preserve the existing server-created Checkout Session and signature-verified webhook behavior.
- Add a server-side Stripe connection check that retrieves safe account/configuration metadata without returning secret values.
- Show configuration readiness, webhook configuration readiness, product availability, and the authenticated user's existing orders and subscription.
- Keep checkout available through existing product controls and success/cancel routes.
- Treat readiness as an operational signal, not proof of settlement. A real test-mode checkout and webhook delivery remain the end-to-end acceptance check.

### Finance page

- Add a protected `/finance` route and navigation entry.
- Present separate Coinbase Treasury and Stripe Payments panels on one page.
- Each panel loads and fails independently so one unavailable provider does not break the other.
- Display loading, empty, configured, degraded, and error states without leaking provider internals.
- Do not render financial data until the existing authenticated session is established.

## Architecture

- Add a focused server Coinbase module responsible for configuration validation, authenticated provider requests, response validation, and safe response shaping.
- Extend the existing Stripe module with a non-mutating connection/readiness procedure while reusing its lazy client.
- Register Coinbase and Stripe procedures through the existing tRPC application router.
- Build the Finance page using the existing tRPC client and UI primitives.
- Extend production-posture evaluation with a non-critical Coinbase treasury control. Payment processing remains non-critical to core OSIRIS case and Vault operation.

## Configuration

Required Coinbase variables:

- `COINBASE_API_KEY_NAME`
- `COINBASE_API_PRIVATE_KEY`
- `COINBASE_PORTFOLIO_ID`

Existing Stripe variables:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

Only presence and safe status labels may reach the browser. Values must never be logged or returned.

## Data Flow

1. An authenticated operator opens `/finance`.
2. The browser invokes protected tRPC queries for Coinbase treasury and Stripe status/data.
3. Server modules validate configuration and call their providers.
4. Provider payloads are reduced to the documented safe response shapes.
5. The page renders each integration independently and labels stale or unavailable data clearly.
6. Stripe checkout continues through the existing protected mutation and Stripe-hosted Checkout page; signed webhooks remain the authority for persisted payment state.

## Failure and Security Behavior

- Missing configuration returns an actionable `not_configured` state rather than crashing application startup.
- Provider authentication, rate-limit, timeout, and malformed-response failures become a generic degraded state for the browser and a sanitized server log entry.
- Coinbase procedures are protected and non-mutating.
- Stripe Checkout remains protected; webhook requests continue to require a valid Stripe signature.
- No financial provider secret is stored in the OSIRIS database or client bundle.
- Coinbase credentials used for this version must not include trade or external-transfer permissions.

## Verification

- Unit tests cover Coinbase response shaping, missing configuration, provider failure, and credential redaction.
- Stripe tests cover readiness with missing/present configuration and safe account-status output.
- Router tests verify that finance queries require authentication.
- UI tests or deterministic component checks cover loading, configured, empty, and degraded panels where supported by the repository.
- Run TypeScript checking, affected tests, the full test suite, and the production build.
- Perform a production-safe read-only Coinbase connection check and a Stripe test-mode Checkout/webhook verification only when the corresponding credentials and test product are available.

## Compatibility and Rollback

The feature is additive. It does not alter case management, Evidence Vault behavior, authentication, database schema, or existing Stripe checkout contracts. Rollback consists of removing the Finance route, Coinbase router/module, Stripe status procedure, navigation entry, and Coinbase posture control; existing Stripe payment processing remains intact.
