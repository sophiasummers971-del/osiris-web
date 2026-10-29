# OSIRIS infrastructure and Google monitoring repair

29 October 2026. Read-only production diagnostics, isolated development repair.
**AMBER: a reproducible reliability defect is repaired in development; production
has not been changed or certified.** No overlap with Pegasus PR #60.

## Preflight and evidence scope

PREFLIGHT_PASS for isolated development testing. Authenticated GitHub account
`sophiasummers971-del`; supported repository GET returned push permission, with
no authentication, permission or rate-limit errors. Quota remains
**QUOTA_UNVERIFIED / UNSUPPORTED_TELEMETRY**; `/rate_limit` was not attempted.

Fresh clean checkout: `main` at
`b43c6f33a26f4e6f91827aabed6aa06f32e8ee6b`, origin
`https://github.com/sophiasummers971-del/osiris-web.git`, branch
`fix/google-monitoring-recovery-20261029`. Existing worktrees preserved. Read
existing Rule Zero preflight requirements from the unmerged prototype; this is
not a GREEN launcher receipt or a claim that its quota/expiry requirements were
satisfied. Node v24.22.1, pinned pnpm 10.34.5 via Corepack. Frozen dependency
installation with scripts disabled succeeded; no production credential variables
were populated in the development process. Generated encrypted synthetic tokens
and mocked HTTP/storage boundaries were used for tests; no real Google mailbox
was queried. Protected PRs #47–#58 and Pegasus #60 were not modified.

## Production observations

Evidence collected 05:53–06:02 UTC (also Europe/London on this date), 29 October.

- Google Workspace status reported no incidents (page updated 01:34 UTC);
  Supabase official status reported operational at the 06:01 UTC read.
- GitHub status: operational. Cloudflare: no known service issues, with regional
  maintenance; no global outage inferred.
- Supabase project `pussbwanjsrvitaxzsnh`: ACTIVE_HEALTHY, Postgres 17.6.1.155.
  SQL catalogue/aggregate reads succeeded. This does not prove application
  permission correctness.
- Cloudflare Worker `osiris-web`, deployment
  `b07f7848-eb92-42dd-8e17-45aca8cc9d74`, version
  `5e185056-7eee-4589-a3c9-5d7343b82ce0` at 100%, created 27 September.
  Exact deployed Git SHA was not attested. Bound AI, ASSETS, email, OAuth/token
  secrets, Supabase public configuration and HYPERDRIVE; no secret values read.
- Custom domain `osiris.ev-a.me.uk` maps to this Worker. Zone route list is empty
  (custom domains are a separate routing mechanism). workers.dev and previews
  enabled. Cron `*/15 * * * *` exists. Hyperdrive `osiris-supabase` targets this
  project's database as **postgres**. The Worker prefers Hyperdrive, then direct
  database URL fallbacks; which fallback was actually used by a particular run
  is not independently attested.
- Access application **All Workers**, created 21 October 23:41 UTC, has destination
  `all_workers` and one allow policy selecting an exact email. No bypass policy
  or more-specific OSIRIS application appeared in the available account list.
  Official documentation says this covers production/previews and associated
  domains, subject to more-specific policies. Edge identity is not substituted
  for Supabase application authentication. Owner reports live OAuth works;
  this review did not reproduce a signed-in browser session.
- Bounded unauthenticated GETs of `/api/health` on custom and workers.dev hosts
  returned 403/text, without a login redirect. A CF-Ray was present on the custom
  response. Source of the denial is **UNVERIFIED**: not classified as an
  application, database or provider API authorization failure. No attempt to
  bypass Access. Health handler itself reports binding presence, not a DB query.
- Read-only Cloudflare telemetry query (`dry:true`, prior 24 hours, service filter)
  at 05:57:46 UTC observed 119 `ok` outcome events, no exception outcome group.
  This is bounded log evidence, not every request or proof of monitoring success.
  PostgreSQL aggregate logs, 28 October 05:30 to 29 October 05:30 UTC: 500 LOG/00000,
  one LOG/08006; no ERROR/FATAL group. Root cause of 08006 is not established.

## Actual permission paths

| Path                       | Enforcement found                                                                                                              | Residual boundary                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser → Access → Worker  | Account Access rule, then Supabase bearer-token validation at `/auth/v1/user`                                                  | Access login alone grants no tRPC identity. Runtime-config and health expose public configuration/status only. Auth proxy forwards only to configured Supabase Auth, with fixed allowed methods and manual redirects. |
| Worker tRPC → PostgreSQL   | `protectedProcedure`, authenticated operator mapping, owner predicates for cases/evidence/monitoring/alerts                    | Direct Drizzle/Postgres access uses privileged connection; no per-request `SET ROLE` or RLS identity. Server ownership checks carry isolation.                                                                        |
| Browser Supabase client    | Publishable key, user session; auth fetches routed through auth proxy                                                          | No active application `.from()` table or `.rpc()` call found in browser source. External Data API clients remain governed by grants + RLS independently of Worker/Access.                                             |
| Evidence upload/download   | Owned-case lookup, size/type validation, operator-scoped path, service-secret Storage client, 60-second signed URLs            | Storage service role bypasses RLS. Private bucket verified; no public-role storage policy found. Host/service credential compromise remains powerful.                                                                 |
| Scheduled monitoring/email | Cron calls server runner directly; active connection claim and owner IDs from stored records                                   | No browser/Access identity; database/token key and scheduled host are trusted. No live manual run was triggered by this audit.                                                                                        |
| Public/admin surfaces      | Public tRPC health, auth.me/logout; other mounted routers protected. Admin role from verified app metadata or configured owner | No administrative SQL/role-management RPC mounted in appRouter found. Legacy unmounted modules are not proof of deployed endpoints.                                                                                   |

Catalogue verification: all 12 public application tables owned by postgres, RLS
on, FORCE RLS off. `postgres` and `service_role` have BYPASSRLS; anon/authenticated
do not. Authenticator can assume the API roles; anon/authenticated have no
inherited privileged membership found. Public schema USAGE true, CREATE false
for both. One current operator has a valid auth-user/external-ID mapping; no
missing/mismatched mapping observed. Mapping uses unique auth_user_id and
external_id constraints, maintained by `ensureVaultOperator` from server identity.
Self-owned operator INSERT/UPDATE policies still permit mutable row fields;
external_id/role must not be trusted as an independent administrator assertion.

Effective privileges (including inherited/PUBLIC grants, via
`has_table_privilege`) confirm both prior migrations:

- `20261029053336 revoke_public_pegasus_truncate_privileges`: TRUNCATE false for
  anon/authenticated on alerts, chain heads and security events.
- `20261029053751 revoke_pegasus_api_schema_privileges`: TRIGGER and REFERENCES
  false on those three tables. Despite its name, this migration does **not**
  revoke schema USAGE or ordinary DML. Both migrations preserved, not reapplied.
- These three tables retain SELECT/INSERT/UPDATE/DELETE and PG17 MAINTAIN grants
  to API roles. RLS permits authenticated own alert SELECT/INSERT/UPDATE, own
  security-event SELECT/INSERT, and own chain-head SELECT; anon has no matching
  row policies. Grants alone do not authorize rows. Direct event INSERT also
  invokes the chain-head trigger, whose own RLS/permission checks apply; successful
  direct insertion was not demonstrated. Do not call evidence independently
  trusted merely because its owner field matches.
- The five intentionally private tables (three monitoring tables and two email
  tables) have **no** anon/authenticated table privileges and no row policies.
  Their Advisor INFO notices are intentional; do not add public policies/grants.
- Evidence and case-audit triggers reject UPDATE/DELETE; Pegasus event triggers
  also reject TRUNCATE. The postgres owner can alter/disable controls. Vault
  evidence/audit tables have no TRUNCATE protection trigger; privileged roles
  retain TRUNCATE. These are not immutable against the credential custodian.
- Only public SECURITY DEFINER found: `rls_auto_enable`, postgres-owned, fixed
  `search_path=pg_catalog`, API EXECUTE denied. Four application trigger functions
  are SECURITY INVOKER, fixed empty search_path, returning trigger; API EXECUTE
  grants do not make them ordinary callable RPCs. No exposed definer escalation
  was demonstrated.

The 30 October default-Data-API change affects automatic grants for **new** public
objects, not direct PostgreSQL or existing grants. It does not remove the current
BYPASSRLS role or repair excess grants. Current default privileges still grant
broad table/function/sequence privileges for new public objects. Future migrations
must explicitly keep private objects private. No blanket GRANT is needed for the
current monitoring path. Hosted rollout configuration remains unverified.

## Google diagnosis and repair

Read-only metadata, without account IDs/emails/tokens/content: both Google
connections active, gmail.metadata scope, v1 encrypted token envelopes, refresh
ciphertexts present, valid history IDs, zero pending IDs/pages. Last successful
checks: 29 October 05:30:23 and 05:30:25 UTC; last error null. One GitHub connection
active, checked 05:30:27. Ledger: 4,685 succeeded, four Google failures, one GitHub
failure. A successful run is a bounded collector result, not full account security.

| Recorded failure (UTC)                | First subsequent success       | Supported conclusion                                                                           |
| ------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| GitHub 3 October 14:16:21             | 3 October 14:31:33             | Recovered next scheduled interval; generic code cannot identify timeout/quota/auth root cause. |
| Google 4 October 18:01:06 / 18:01:08  | 9 October 00:38:30 / 00:46:03  | Multi-day coverage interruption; not demonstrated to be a transient OAuth outage.              |
| Google 16 October 00:45:40 / 00:45:43 | 25 October 20:45:19 / 20:36:05 | Multi-day interruption, now recovered.                                                         |

Google errors are all `GOOGLE_REAUTHORIZATION_REQUIRED`. Existing code collapses
OAuth invalid_grant, Gmail 401 and every Gmail 403 to that stop state. Historical
records cannot distinguish those causes. Seven-day intervals are consistent with
Google Testing-mode token expiry, but OAuth consent publishing state and provider
error reasons are unavailable: **hypothesis, not diagnosis**. No historical email
is proof of compromise; no raw provider/email content was retrieved.

**Reproduced P2 defect:** Gmail's documented 403 quota reasons incorrectly enter
reauthorization_required and set next_check_at null. Before repair, four of ten
new collector/runner tests failed: three 403 quota cases stopped authorization,
and 429 lost the specific diagnostic. The repair allowlists rateLimitExceeded,
userRateLimitExceeded and dailyLimitExceeded only when every reason is a known
quota reason; 429 is also GOOGLE_RATE_LIMITED. Runner records that fixed code,
does not advance checkpoint or stage observations, and keeps the existing next
scheduled attempt. No immediate retries or quota/permission increases. Mixed,
unknown, malformed 403, 401 and invalid_grant still stop. UI explicitly reports
delayed coverage and scheduled retry without requesting new consent.

Other reviewed protections: PKCE, encrypted owner/redirect/10-minute-bound state,
verified userinfo/mailbox match, offline refresh consent, AES-256-GCM envelope
with random 96-bit IV; ciphertexts never returned by connection-list routes.
Refresh occurs before each poll; refreshed access tokens are ephemeral. History
pagination/pending IDs bounded, checkpoint retained until draining; history 404
stops rather than silently resynchronizing. Unique observation and source-event
keys protect retry deduplication. From/Subject are explicitly untrusted and
stored notices mark senderVerified=false; only English patterns, no DMARC/DKIM
verification, no bodies/attachments. It is a review signal, not login telemetry.

## Verification and limits

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm verify
corepack pnpm exec vitest run server/monitoring/google-recovery.test.ts
corepack pnpm exec vitest run server/monitoring/google-recovery.test.ts server/monitoring/google.test.ts server/monitoring/runner.test.ts server/google-monitoring-router.test.ts
corepack pnpm exec vitest run server/monitoring/google-recovery.test.ts client/src/lib/monitoring-status.test.ts
corepack pnpm verify
git diff --check
```

Baseline full verification: exit 0, 194 tests / 34 files. New regression on old
source: exit 1, 4 failed / 6 passed. After collector/runner repair: exit 0, 35
focused tests / 4 files. Final focused collector/UI: exit 0, 14 tests / 2 files.
An intermediate full run passed 205 tests but failed Markdown formatting;
Prettier was reapplied and checked before the final rerun.
Final complete verification: 205 tests / 35 files, plus boundary/config/migration
validation, TypeScript, formatting and frontend/Node/Worker builds. Exact repair
SHA and independently completed CI link are recorded in the new draft PR.

Tests execute the real token decrypt, OAuth refresh, Gmail collector and runner;
HTTP and persistence are faked. They prove classification and runner decisions,
not hosted SQL commit/recovery or live Google authorization. Existing negative
owner/anonymous/foreign-account, tamper/expiry, metadata and pagination tests
remain in full verification. Main does not contain the unmerged Rule Zero suite;
no prototype test totals are claimed. Static migration validation is not a live
migration-history audit: the two newly applied production revocations are not
silently recreated by this repair.

## Remaining work, ordered by impact

1. **High — privileged execution/evidence boundary:** postgres/BYPASSRLS owns
   application objects; server compromise can defeat RLS/append-only assumptions.
   Requires isolated compatibility tests for a least-privilege role, explicit owner
   approval before Hyperdrive/credential changes, and independent review.
2. **High — cross-case audit policy gap:** `case_audit_events_insert_own` checks
   operator_id, but does not check that case_id belongs to that operator. The FK
   checks existence only. Server case-detail reads audit by case_id. An API caller
   with an owned operator can therefore satisfy the INSERT policy for a different
   existing case; catalogue/source evidence establishes the missing restriction,
   but no production insertion was attempted. Evidence INSERT similarly checks
   owner_id without binding case ownership. Requires isolated PostgreSQL/RLS
   reproduction, approved policy repair and negative two-owner tests before
   production changes. Do not treat application ownership checks as protection
   for direct Data API access.
3. **High — evidence provenance/access handover to Pegasus:** retained API grants,
   own-row event/alert policies, mutable operator mapping and privileged truncation
   weaken claims of independently protected evidence. No successful cross-owner
   bypass demonstrated. Pegasus owner must decide provenance vs user-submitted
   claims; do not change PR #60 or broaden grants to make writes work.
4. **Medium — OAuth query logging:** deployed observability has
   redact_query_string=false; callback codes/state may enter URL logs. Actual
   leakage not inspected or established. Explicit approval needed for production
   query-redaction configuration and appropriate log access/retention review.
5. **Medium — credential/collector recovery:** historical root causes unresolved;
   Google Console publishing/consent configuration needs owner review. Fifteen-minute
   scheduling is bounded retry, not adaptive Retry-After/backoff. Long runs/manual
   force may overlap beyond the claim interval; disconnect vs in-flight finish and
   stale completion fencing remain unproved. Storage/audit outages can leave running
   records; exactly-once completion is not claimed. No changes to these mechanisms.
6. **Medium — Advisor warnings:** pg_net in public and leaked-password protection
   disabled, confirmed. Moving an extension or enabling an Auth setting requires
   separate production approval and compatibility/plan review. No credentials rotated.
7. **Operational unknowns:** signed-in hosted authorization, exact deployed Git SHA,
   real Google quota/reasons, full Access-session flow, and continuous external
   coverage monitoring not verified. Latest check is a point-in-time observation.

Required production approvals: review/merge and deploy this code separately;
Hyperdrive/role switch only after tests and explicit approval; isolated reproduction and owner-approved repair of cross-case INSERT policies;
independent review of Pegasus grants/provenance before any migration; log-query redaction; password
protection/extension changes. No migrations proposed or run, no permission grants,
no secret changes, no live monitoring trigger, no merge/deployment. Development
rollback: revert this repair commit; existing production has nothing to roll back.

## Primary references

- [Gmail error semantics](https://developers.google.com/workspace/gmail/api/guides/handle-errors)
- [Google refresh-token expiry](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Cloudflare Worker Access and precedence](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Supabase Data API default change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase API grants](https://supabase.com/docs/guides/api/securing-your-api)
- [Extension Advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
- [Leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
