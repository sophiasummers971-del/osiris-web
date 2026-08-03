# Production Posture Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OSIRIS report the readiness of its real Supabase, managed Postgres, Vercel AI Gateway, and Stripe boundaries instead of obsolete Manus environment variables.

**Architecture:** Add a pure posture evaluator for deterministic capability checks, keep the protected tRPC resolver responsible for the authenticated-session proof, and inject a read-only database probe. Reuse the Vault connection selector, recognize Vercel OIDC for AI Gateway, and require both Stripe server credentials without returning secret material.

**Tech Stack:** TypeScript 5.9, tRPC 11, Vitest 2, Drizzle ORM, postgres.js, Supabase Auth, Vercel AI Gateway/OIDC, Stripe.

## Global Constraints

- Supabase remains the only identity provider.
- Do not create a second custom JWT or cookie session.
- Production database precedence is `POSTGRES_URL`, with `SUPABASE_DATABASE_URL` only as fallback.
- Never expose credential values or fragments in posture responses or logs.
- The database probe is read-only.
- Preserve the Security page layout.
- Stripe remains the sole processor of payment data; OSIRIS stores no card data.
- No real model request or Stripe charge is made by the posture screen.

---

## File map

- Create `server/_core/posture.ts`: pure control evaluation plus response types.
- Create `server/_core/posture.test.ts`: regression coverage for identity, session, AI, Stripe, and secret non-disclosure.
- Modify `server/vault-db.ts`: expose a read-only database connectivity probe using the existing singleton.
- Modify `server/vault-db.test.ts`: preserve URL precedence coverage and test probe result mapping through dependency injection.
- Modify `server/_core/systemRouter.ts`: replace legacy checks and assemble the protected posture response.
- Modify `client/src/pages/SecurityCenter.tsx`: render sanitized action reasons and the real session label.
- Create or modify the nearest Security Center test if one exists; otherwise keep UI verification in the preview checklist because the repository currently has no page test harness.

### Task 1: Pure production capability evaluator

**Files:**
- Create: `server/_core/posture.ts`
- Create: `server/_core/posture.test.ts`

**Interfaces:**
- Consumes: server environment values and an authenticated-session boolean.
- Produces:
  - `type PostureEnvironment = Record<string, string | undefined>`
  - `type PostureControl = { id: string; label: string; ready: boolean; critical: boolean; reason?: string }`
  - `evaluateStaticPosture(environment: PostureEnvironment, authenticated: boolean): PostureControl[]`

- [ ] **Step 1: Write failing evaluator tests**

Create `server/_core/posture.test.ts` with focused cases:

```ts
import { describe, expect, it } from "vitest";
import { evaluateStaticPosture } from "./posture.js";

const configured = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  VERCEL_OIDC_TOKEN: "signed-oidc-token",
  STRIPE_SECRET_KEY: "sk_test_secret",
  STRIPE_WEBHOOK_SECRET: "whsec_secret",
};

describe("evaluateStaticPosture", () => {
  it("recognizes the production architecture", () => {
    const controls = evaluateStaticPosture(configured, true);
    expect(controls.find(control => control.id === "identity")?.ready).toBe(true);
    expect(controls.find(control => control.id === "session")?.ready).toBe(true);
    expect(controls.find(control => control.id === "intelligence")?.ready).toBe(true);
    expect(controls.find(control => control.id === "payments")?.ready).toBe(true);
  });

  it("requires both Stripe server boundaries", () => {
    const controls = evaluateStaticPosture(
      { ...configured, STRIPE_WEBHOOK_SECRET: undefined },
      true
    );
    expect(controls.find(control => control.id === "payments")).toMatchObject({
      ready: false,
      reason: "Stripe webhook signing is not configured",
    });
  });

  it("does not disclose secret values", () => {
    const serialized = JSON.stringify(evaluateStaticPosture(configured, true));
    expect(serialized).not.toContain("signed-oidc-token");
    expect(serialized).not.toContain("sk_test_secret");
    expect(serialized).not.toContain("whsec_secret");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `pnpm vitest run server/_core/posture.test.ts`  
Expected: FAIL because `./posture.js` does not exist.

- [ ] **Step 3: Implement the pure evaluator**

Create `server/_core/posture.ts` with explicit checks:

```ts
export type PostureEnvironment = Record<string, string | undefined>;

export type PostureControl = {
  id: "session" | "identity" | "database" | "intelligence" | "payments";
  label: string;
  ready: boolean;
  critical: boolean;
  reason?: string;
};

export function evaluateStaticPosture(
  environment: PostureEnvironment,
  authenticated: boolean
): PostureControl[] {
  const supabaseConfigured = Boolean(
    environment.VITE_SUPABASE_URL &&
      environment.VITE_SUPABASE_PUBLISHABLE_KEY
  );
  const stripeSecret = Boolean(environment.STRIPE_SECRET_KEY);
  const stripeWebhook = Boolean(environment.STRIPE_WEBHOOK_SECRET);

  return [
    {
      id: "session",
      label: "Session verification",
      ready: authenticated,
      critical: true,
      reason: authenticated ? undefined : "No verified Supabase session",
    },
    {
      id: "identity",
      label: "Identity gateway",
      ready: supabaseConfigured,
      critical: true,
      reason: supabaseConfigured
        ? undefined
        : "Supabase Auth is not fully configured",
    },
    {
      id: "database",
      label: "Operational database",
      ready: false,
      critical: true,
      reason: "Database probe has not completed",
    },
    {
      id: "intelligence",
      label: "AI intelligence gateway",
      ready: Boolean(
        environment.VERCEL_OIDC_TOKEN || environment.AI_GATEWAY_API_KEY
      ),
      critical: false,
      reason:
        environment.VERCEL_OIDC_TOKEN || environment.AI_GATEWAY_API_KEY
          ? undefined
          : "Vercel AI Gateway credentials are unavailable",
    },
    {
      id: "payments",
      label: "Payment isolation",
      ready: stripeSecret && stripeWebhook,
      critical: false,
      reason: !stripeSecret
        ? "Stripe server access is not configured"
        : !stripeWebhook
          ? "Stripe webhook signing is not configured"
          : undefined,
    },
  ];
}
```

- [ ] **Step 4: Run the focused test**

Run: `pnpm vitest run server/_core/posture.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the evaluator slice**

Commit message: `feat: evaluate real production posture controls`

### Task 2: Read-only managed Postgres probe

**Files:**
- Modify: `server/vault-db.ts`
- Modify: `server/vault-db.test.ts`

**Interfaces:**
- Consumes: `getVaultConnectionString()` and the existing postgres.js client.
- Produces: `probeVaultDatabase(): Promise<{ ready: boolean; reason?: string }>`

- [ ] **Step 1: Write failing probe tests**

Add tests that inject a probe callback so no test connects externally:

```ts
import { probeVaultDatabase } from "./vault-db.js";

it("reports a successful read-only database probe", async () => {
  await expect(
    probeVaultDatabase(async () => [{ ok: 1 }])
  ).resolves.toEqual({ ready: true });
});

it("sanitizes a failed database probe", async () => {
  await expect(
    probeVaultDatabase(async () => {
      throw new Error("postgresql://user:password@secret-host");
    })
  ).resolves.toEqual({
    ready: false,
    reason: "Operational database is unreachable",
  });
});
```

- [ ] **Step 2: Run the focused test and confirm export failure**

Run: `pnpm vitest run server/vault-db.test.ts`  
Expected: FAIL because `probeVaultDatabase` is not exported.

- [ ] **Step 3: Implement the probe**

Add a dependency-injected probe whose default performs only `select 1` using the initialized postgres client. Return a fixed reason on error and log only `error.name`, never the message or connection URL.

```ts
type DatabaseProbe = () => Promise<unknown>;

export async function probeVaultDatabase(
  probe: DatabaseProbe = async () => {
    getVaultDb();
    if (!client) throw new Error("Database client unavailable");
    return client`select 1 as ok`;
  }
) {
  try {
    await probe();
    return { ready: true } as const;
  } catch (error) {
    console.error("[Posture] Database probe failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      ready: false,
      reason: "Operational database is unreachable",
    } as const;
  }
}
```

- [ ] **Step 4: Run Vault database tests**

Run: `pnpm vitest run server/vault-db.test.ts`  
Expected: PASS, including existing managed URL precedence tests.

- [ ] **Step 5: Commit the database probe slice**

Commit message: `feat: probe operational database readiness`

### Task 3: Assemble the protected posture endpoint

**Files:**
- Modify: `server/_core/systemRouter.ts`
- Create: `server/_core/systemRouter.test.ts` if router caller tests are viable; otherwise add `assemblePosture` tests to `posture.test.ts`.

**Interfaces:**
- Consumes:
  - `evaluateStaticPosture(process.env, Boolean(ctx.user))`
  - `probeVaultDatabase()`
- Produces the existing posture shape plus optional sanitized `reason` values.

- [ ] **Step 1: Write a failing assembly test**

Test that a successful database result replaces the database placeholder and that overall status depends only on critical controls:

```ts
const result = assemblePosture({
  controls: evaluateStaticPosture(configured, true),
  database: { ready: true },
  isProduction: true,
  checkedAt: new Date("2026-08-03T16:00:00Z"),
});

expect(result.status).toBe("READY");
expect(result.controls.find(control => control.id === "database")).toMatchObject({
  ready: true,
  reason: undefined,
});
```

- [ ] **Step 2: Run the assembly test**

Run: `pnpm vitest run server/_core/posture.test.ts`  
Expected: FAIL because `assemblePosture` is not implemented.

- [ ] **Step 3: Implement assembly and update the resolver**

Add `assemblePosture` to `posture.ts`. Change `system.posture` to an async protected query, evaluate static controls, await the database probe, replace the database control, and calculate `READY` only when every critical control is ready.

Remove imports and checks for `ENV.cookieSecret`, `ENV.appId`, `ENV.oAuthServerUrl`, `ENV.databaseUrl`, `ENV.forgeApiUrl`, and `ENV.forgeApiKey` from the posture resolver. Do not remove legacy `ENV` fields still consumed by other modules.

- [ ] **Step 4: Run posture and Vault tests**

Run: `pnpm vitest run server/_core/posture.test.ts server/vault-db.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit the endpoint slice**

Commit message: `fix: report live OSIRIS security posture`

### Task 4: Show actionable, sanitized control reasons

**Files:**
- Modify: `client/src/pages/SecurityCenter.tsx`

**Interfaces:**
- Consumes: optional `control.reason` from `system.posture`.
- Produces: existing cards with a short action reason only when a control is not ready.

- [ ] **Step 1: Fetch and inspect the full component before editing**

Confirm the generated tRPC type exposes `reason?: string` after the server change and locate the control-card status text. Preserve all layout classes.

- [ ] **Step 2: Implement minimal rendering**

Under `ACTION REQUIRED`, render:

```tsx
{!control.ready && control.reason && (
  <p className="mt-2 text-xs leading-5 text-muted-foreground">
    {control.reason}
  </p>
)}
```

Do not display environment variable names or credential fragments.

- [ ] **Step 3: Run type check and production build**

Run: `pnpm check && pnpm build`  
Expected: exit 0 from both project commands.

- [ ] **Step 4: Run the complete test suite**

Run: `pnpm test`  
Expected: all tests pass.

- [ ] **Step 5: Commit the UI slice**

Commit message: `feat: explain posture control failures`

### Task 5: Preview and production verification

**Files:**
- No source changes unless verification reveals a defect.
- Update the design status to Implemented only after production evidence passes.

**Interfaces:**
- Consumes: Vercel preview deployment and current project integrations.
- Produces: verified production posture without secret disclosure.

- [ ] **Step 1: Open a pull request**

PR title: `Use real production posture controls`  
PR body must list Supabase identity/session, managed Postgres probe, Vercel OIDC detection, and Stripe dual-secret readiness.

- [ ] **Step 2: Verify preview build logs**

Confirm the project-owned `tsc --noEmit` and Vite/esbuild build complete. Record Vercel's known secondary Express type diagnostics separately if they remain non-blocking.

- [ ] **Step 3: Verify preview behavior**

While authenticated, load `/security` and confirm:

- session verification is ready;
- identity gateway is ready;
- operational database probe is ready;
- AI gateway is ready if `VERCEL_OIDC_TOKEN` is injected;
- payments are ready only if both Stripe secrets exist;
- no response or log contains secret values.

- [ ] **Step 4: Merge after preview evidence**

Use a squash merge only after preview is READY and the focused tests, full suite, type check, and build are green.

- [ ] **Step 5: Verify production**

Confirm production deployment READY, homepage 200, protected posture request 200 for the signed-in operator, and database probe activity without writes. If AI or payments remain unavailable, report the exact missing boundary from the sanitized reason rather than marking it ready manually.

- [ ] **Step 6: Update design status**

Change the design document status from `Proposed` to `Implemented` only after the production checks above pass.
