# Node runtime authentication configuration: defect verification

Date: 2026-10-29 UTC. Scope: isolated development repair; no deployment.

## Verdict and selected defect

**P2 application defect reproduced and repaired:** the supported Node server
(`pnpm build`, `pnpm start`) returned SPA HTML with HTTP 200 at
`/api/runtime-config`. Browser bootstrap expects JSON at this URL. Consequently,
a frontend built without embedded Supabase settings cannot consume correctly
supplied Node runtime settings and authentication remains unconfigured.

The Cloudflare Worker already implements this endpoint. This finding does not
establish a current production outage or a defect in its implementation.

## Rule Zero development preflight

- Source: GitHub `main`, exact base
  `b43c6f33a26f4e6f91827aabed6aa06f32e8ee6b`; new isolated checkout and branch
  `fix/node-runtime-auth-config`. Origin verified as
  `https://github.com/sophiasummers971-del/osiris-web.git`; initial tree clean.
  Existing worktrees and Rule Zero PRs #47–#58 were not modified.
- Authenticated connector account: `sophiasummers971-del`. Supported repository
  GET succeeded with push permission. No 401, 403 or 429 observed in these reads.
  **QUOTA_UNVERIFIED / UNSUPPORTED_TELEMETRY**: no quota value inferred; the
  unsupported `/rate_limit` endpoint was not attempted.
- Node `v24.22.1`; repository-pinned pnpm `10.34.5` via Corepack. Frozen dependency
  installation succeeded with lifecycle scripts disabled.
- GitHub official status reported operational. Cloudflare reported no known
  service issues plus regional maintenance; this is not application health proof.
- **PREFLIGHT_PASS for isolated development testing only.** Tests used synthetic
  settings, disposable loopback servers and no populated production credential
  environment. Deployment metadata and aggregate logs were read only. No live
  authentication, production record access, database changes or deployment.

## Triage evidence and priority

| Priority       | Observation                                               | Evidence and disposition                                                                                                                                                                                                                                                                                               |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2             | Node runtime auth bootstrap receives HTML instead of JSON | Reproduced against actual built Node entry point and two regression tests; selected repair.                                                                                                                                                                                                                            |
| P3 maintenance | Failed automated dependency remediation                   | [Dependabot run 40731939658](https://github.com/sophiasummers971-del/osiris-web/actions/runs/40731939658), job 122970284378: `security_update_not_possible` for `dompurify`; resolvable 3.3.0 versus required 3.4.17. Exploitability and user exposure were not established; separate dependency investigation needed. |
| Unverified     | Current hosted application outage                         | Available bounded logs do not establish one. No speculative production repair.                                                                                                                                                                                                                                         |
| Excluded       | Rule Zero production integration gaps                     | Draft PRs #47–#58 are separate unfinished security work, not evidence of this application defect.                                                                                                                                                                                                                      |

The repository's open-issues response contained no ordinary open issues and 16
open PRs at the initial read. Active dependency PRs #44/#45 and older integration
PRs were inspected as triage context; none was changed.

Read-only deployment evidence at 04:00:27 UTC: Worker `osiris-web`, deployment
`b07f7848-eb92-42dd-8e17-45aca8cc9d74`, version
`5e185056-7eee-4589-a3c9-5d7343b82ce0` at 100%. An exact deployed Git SHA was
not independently attested. Observability metadata was available.

Bounded Cloudflare aggregate queries on the preceding seven days observed 784
`ok` outcomes at 04:01:47 UTC. A separate status aggregate at 04:03:47 UTC found
99 HTTP-200 events and 2029 missing/non-HTTP status values, with no 5xx group.
Different aggregates are not a request census; missing status is not HTTP failure.
Supabase aggregate logs for 2026-10-28 04:00 through 2026-10-29 04:00 UTC contained
503 LOG/00000 and one LOG/08006 PostgreSQL events, plus 73 pooler events. No ERROR
or FATAL group was observed. These aggregates neither prove complete application
health nor establish an application root cause. A public health-URL lookup was
inaccessible to the retrieval tool; it was not an observed HTTP failure.

## Minimal repair and reproducible verification

Register GET `/api/runtime-config` in the existing Node auth-route registration,
before the SPA fallback. Return only the public URL and publishable key as JSON
with `Cache-Control: no-store`, matching the existing Worker contract. Missing
settings remain empty; no authorization restrictions or credentials changed.

Commands run from the isolated checkout:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm verify
corepack pnpm exec vitest run server/_core/supabaseAuthProxy.test.ts
corepack pnpm exec prettier --write server/_core/supabaseAuthProxy.ts server/_core/supabaseAuthProxy.test.ts
corepack pnpm verify
git diff --check
```

Baseline full verification passed: **194 tests in 34 files**, all verification
stages. Adding the regression tests before the fix yielded **2 failed tests**:
HTML content type instead of JSON. After the fix both pass. An intermediate full
run passed 196 tests but failed Prettier on the edited source; formatting was
corrected and the complete verification rerun.

Final full verification: **196 tests in 35 files passed**; boundary lint,
Cloudflare configuration validation, migration-file validation, TypeScript,
Prettier, frontend/Node build and Worker build passed. Migration validation is
static only: no migrations were applied. Main does not contain the unmerged
Rule Zero prototype suite; no such results are claimed here.

Regression tests exercise real loopback HTTP with the SPA fallback present,
configured and empty runtime values, JSON/no-store and an exact two-field public
response even when synthetic private settings are present. The actual built
Node process was also started with synthetic runtime settings: baseline returned
200/text-html and invalid JSON; repaired build returned 200/application-json,
no-store and exactly the expected public values. Processes were stopped and
awaited. No real identity-provider calls were made.

## Review, rollback and remaining work

The new draft PR and its Actions run identify the exact tested repair SHA and CI
result; the parent SHA above identifies the baseline. No production fix is
claimed until separately reviewed and deployed through an authorized process.
Rollback is to revert the repair commit on its development branch; no resource
or database rollback is needed. Do not merge or deploy automatically.

Remaining work: independently review the small route change; investigate the
Dependabot remediation constraint and real exposure; independently attest the
hosted version and test actual sign-in only under separate authorization. This
repair does not certify Rule Zero production enforcement or hosted availability.
