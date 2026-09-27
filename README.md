# OSIRIS

OSIRIS is a private security workspace for cases, evidence, account monitoring,
alerts and assisted analysis. PEGASUS records append-only security observations;
an alert is a signal for review, not proof of compromise.

## Architecture

- React 19 / Vite SPA. Pages are lazy-loaded.
- Cloudflare Worker / tRPC production API (`worker/index.ts`).
- Supabase Auth verifies bearer tokens through `/auth/v1/user`. The browser uses
  the same-origin authentication proxy. Supabase UUIDs remain distinct; PostgreSQL
  operators are resolved from the verified identity, never a client-supplied ID.
- Supabase PostgreSQL through the request's Hyperdrive binding, or explicit
  `SUPABASE_DATABASE_URL` / `POSTGRES_URL` for local execution.
- Private `osiris-evidence` storage: server-managed uploads, file validation and
  hashing, owner-scoped metadata and paths, 60-second signed attachment downloads.
- GitHub OAuth/API monitoring, with encrypted tokens and an owner-scoped manual
  check. Cloudflare cron runs every 15 minutes.
- Durable owner email outbox and Cloudflare Email binding. Provider acceptance
  is recorded separately from inbox delivery. The installation has one fixed,
  verified owner recipient; it is not a general mailing service.
- Authenticated Workers AI analysis. Missing/provider-failed inference returns a
  sanitized error. Generated analysis is not independently verified evidence.

`pnpm dev` retains Express/Vite for local development. It uses Supabase identity,
not Manus cookies. Workers AI and Cloudflare Email bindings are unavailable in
that local Express process. Use a separately authorized Cloudflare preview for
binding-dependent smoke checks; no deploy command is part of verification.

## Reproducible verification

Use Node 24 (see `.node-version`) and **pnpm 10.34.5**, matching both the package
manager declaration and the previously locked pnpm dependency. No application
packages were upgraded as part of toolchain reconciliation.

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm --version
pnpm install --frozen-lockfile
pnpm verify
```

If Corepack is not installed, install `pnpm@10.34.5` with npm. Do not use the
machine's unrelated pnpm 11 installation. The commands above must use this
checkout's own dependencies.

`verify` runs bounded architecture lint, Cloudflare config checks, PostgreSQL
migration inventory/checksums, TypeScript, all unit/HTTP contract tests, check-only
Prettier, frontend/Express builds and a bundled Worker build. `lint` is an explicit
runtime-dependency boundary check, not a claim of comprehensive ESLint coverage.
CI runs the same verification with read-only repository permissions and no secrets
or deployment step. Unit tests mock external services; they do not write production.

## Configuration

See `.env.example`. Only publishable Supabase configuration may reach the browser.
Never prefix service credentials with `VITE_`. Supply production secrets through
Cloudflare secret bindings, not committed config. `wrangler.jsonc` describes
`ASSETS`, `HYPERDRIVE`, `AI`, `email_verify` and the cron schedule.

The static asset `_headers` file protects responses served directly by Cloudflare;
the Worker applies the same headers to API/error responses. API responses use
`Cache-Control: no-store`. No speculative CSP is enabled.

## Database change discipline

Run `pnpm db:validate`. Read [PostgreSQL migrations](docs/POSTGRES-MIGRATIONS.md)
before planning any DDL. The eight checked-in migrations require an existing Vault
baseline. They are **not** a complete empty-database bootstrap. A read-only
Supabase ledger check confirmed all eight applied versions; the missing historical
audit-function migration was recovered without applying any DDL. No generic `db:push`
command is exposed: the previous one targeted obsolete MySQL tables.

## Supported surface and retained history

Active procedures are `auth`, `system.health`, `system.posture`, `cases`,
`pegasus`, `monitoring` and `intelligence`. Legacy MySQL notifications, supporter
endpoints/UI, browser push, Manus authentication/notification proxy and Vercel
entrypoints are retired. Existing PEGASUS alerts and email alarms remain active.
The Tools page's candidate tools are explicitly illustrative, not implemented
connectors or commands.

Some unexposed, tested finance/email helpers and MySQL schema history remain for
compatibility and audit context. The Worker import-graph check prevents them from
entering the production runtime. Historical design documents and template assets
are not the operational specification. See [legacy disposition](docs/completion/LEGACY.md).

## Verification status

Repository implementation, automated tests, deployment and live validation are
separate facts. This completion branch has not been merged or deployed. Current
production configuration, RLS enforcement, inbox delivery and live AI inference
require external validation; prior conversation claims do not prove their present
state. See [post-merge validation](docs/POST-MERGE-VALIDATION.md) and the completion
audit for exact commands, results and outstanding work.
