# OSIRIS Production Posture Controls Design

Date: 2026-08-03  
Status: Proposed  
Scope: Replace the five legacy environment-name checks on the Security page with checks that reflect OSIRIS's actual production architecture.

## Objective

The Security page must report whether each production boundary is genuinely configured and usable. It must not show a control as failed merely because an obsolete Manus variable is absent, and it must not show a control as ready based on a cosmetic flag.

## Selected architecture

1. **Identity gateway — Supabase Auth**
   - Supabase remains the only identity provider.
   - Server authentication continues to validate bearer tokens through Supabase Auth.
   - Authorization roles come only from trusted app metadata or the configured owner email; user-editable metadata is not used for roles.

2. **Session verification — Supabase signed access tokens**
   - The current protected posture request itself proves that Supabase accepted the signed access token.
   - OSIRIS will not introduce a second custom JWT or cookie session merely to satisfy the old posture label.
   - The UI label should describe the real boundary: session verification.

3. **Operational database — Vercel-managed Supabase Postgres**
   - Production uses the integration-managed `POSTGRES_URL`.
   - `SUPABASE_DATABASE_URL` remains a local-development fallback.
   - Readiness uses the same connection selector as the Vault and a lightweight database probe. The probe must not write data.

4. **AI intelligence gateway — Vercel AI Gateway with OIDC**
   - Vercel's short-lived `VERCEL_OIDC_TOKEN` is the preferred production credential.
   - A dedicated AI Gateway API key may be supported as a development fallback, but no permanent provider key is required in production.
   - No model call is made merely to render the posture screen; readiness verifies the expected server-only gateway credential and configuration.
   - Actual intelligence calls must fail closed with a clear operator error when the gateway is unavailable.

5. **Payment isolation — Stripe Checkout and verified webhooks**
   - Stripe remains the sole processor of payment data.
   - OSIRIS never collects or stores card numbers.
   - Readiness requires both `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
   - Checkout stays server-created and webhook processing continues to require Stripe signature verification.
   - Payment readiness is configuration readiness, not proof that a real charge was made.

## Posture response

The existing `system.posture` endpoint remains protected and returns no secret values. Each control returns:

- stable ID and operator-facing label;
- `ready` boolean;
- critical/non-critical classification;
- a short, non-secret reason when action is required.

Overall status is `READY` only when all critical controls are ready. Identity, session verification, and operational database remain critical. AI gateway and payments remain non-critical until an OSIRIS workflow depends on them.

## Implementation boundaries

- Replace the obsolete checks in `server/_core/systemRouter.ts`.
- Centralize current environment capability detection in `server/_core/env.ts` or a narrowly scoped posture module.
- Reuse `getVaultConnectionString()` rather than duplicating database precedence.
- Keep secrets server-only and never return credential fragments to the client.
- Preserve the current Security page layout; only labels, status, and actionable reasons may change.
- Do not redesign authentication, create a second payment system, or add paid products in this work.

## Error handling

- A failed database probe marks only the database control unavailable and records a sanitized server log.
- Missing AI or Stripe configuration produces an actionable reason without exposing variable values.
- The posture endpoint should still return the other control results if one probe fails.
- Supabase session failure remains an authentication failure before the protected posture resolver runs.

## Verification

Automated checks will cover:

- Supabase configuration recognized as the identity gateway.
- An authenticated Supabase context recognized as verified session state.
- Managed `POSTGRES_URL` preferred over the manual fallback.
- Database probe success and failure classification.
- Vercel OIDC recognized as AI Gateway readiness.
- Stripe requires both secret and webhook signing secret.
- Posture responses never contain secret values.
- Type check, unit tests, build, preview deployment, and production runtime verification.

## Rollback

The change is limited to readiness evaluation and labels. If production verification fails, revert the posture commit; authentication, Vault storage, and Stripe processing remain untouched.
