# Vault ownership inventory and isolated repair

29 October 2026. **Development repair verified; production remains AMBER.**
No production policies, grants, roles, migrations or records changed.

## Source and preflight

Fresh branch `fix/vault-case-ownership-20261029`, main baseline
`b43c6f33a26f4e6f91827aabed6aa06f32e8ee6b`. Origin verified; initial tree clean;
existing worktrees preserved. Authenticated GitHub account
`sophiasummers971-del`, repository read/push access verified. Quota remains
QUOTA_UNVERIFIED / UNSUPPORTED_TELEMETRY. Rule Zero's unmerged launcher was not
used and no GREEN launcher receipt is claimed. Development preflight passed for
read-only catalogue inspection and isolated synthetic testing.

Node v24.22.1, pinned pnpm 10.34.5, frozen dependency installation succeeded.
GitHub/Supabase status operational; Cloudflare reported no known service issue,
with regional maintenance. Production diagnostics used only supported read-only
connector calls. No live credentials supplied to tests; no mailbox contents or production mutation tests used.

Native PostgreSQL/Docker unavailable; the package-manager setup attempt failed
because this managed runtime cannot perform its required user/group switching.
No escalation or network-policy bypass attempted. Tests instead run an in-memory
PostgreSQL WASM engine, PGlite 0.5.13 / **PostgreSQL 18.6**, with no connection URL,
files or hosted service. Production is PostgreSQL 17: native PG17/Supabase rehearsal
is a remaining approval gate, not a demonstrated guarantee.

## Live ownership inventory

Read-only catalogue snapshot: **06:33:35 UTC**, 12 tables, 18 policies. Exact names,
roles, predicates and table ACLs are committed in
`server/fixtures/ownership-catalog-20261029.json`. All 12 tables are postgres-owned,
RLS enabled, FORCE RLS disabled. postgres and service_role have BYPASSRLS;
anon/authenticated do not. No column-specific grants found at 06:32:29 UTC.

S/I/U/D = SELECT/INSERT/UPDATE/DELETE. Grants allow an operation to reach RLS;
a policy is still required for row access. Empty policies on private tables are
intentional, not permission defects.

| Table                   | Existing authenticated policies                                            | API table grants (anon / authenticated) | Finding and proposal                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| osiris_operators        | select_own, insert_own, update_own, delete_own: auth_user_id = auth.uid()  | SIUD / SIUD                             | Own role/external identity can be changed through direct API. Keep authenticated SELECT for ownership lookup; reserve provisioning/update/delete for server. |
| security_cases          | select_own, insert_own, update_own, delete_own: owner_id belongs to caller | SIUD / SIUD                             | Existing owner rule retained. Add composite unique key required by child ownership FKs. Remove unused anonymous grants.                                      |
| evidence_records        | select_own, insert_own: owner_id belongs to caller                         | SIUD / SIUD                             | Does not bind case_id to owner_id. Tighten both policies and add composite FK; remove anonymous and authenticated U/D grants.                                |
| case_audit_events       | select_own, insert_own: operator_id belongs to caller                      | SIUD / SIUD                             | Does not bind case_id to operator_id. Tighten both policies and add composite FK; remove anonymous and authenticated U/D grants.                             |
| pegasus_alerts          | select_own, insert_own, update_own: owner_id belongs to caller             | SIUD + MAINTAIN / same                  | Provenance, event-owner relationship and write authority require Pegasus decisions. Unchanged.                                                               |
| pegasus_security_events | select_own, insert_own: owner_id belongs to caller                         | SIUD + MAINTAIN / same                  | Trigger/chain-head restrictions also apply; policy alone is not proof of trusted provenance. Unchanged.                                                      |
| pegasus_chain_heads     | select_own: owner_id belongs to caller                                     | SIUD + MAINTAIN / same                  | No API write policy; database trigger maintenance. Excess grants handed to Pegasus track, unchanged.                                                         |
| monitoring_connections  | None                                                                       | None / None                             | Intentionally server-only; preserve.                                                                                                                         |
| monitoring_runs         | None                                                                       | None / None                             | Intentionally server-only; preserve.                                                                                                                         |
| monitoring_observations | None                                                                       | None / None                             | Intentionally server-only; preserve.                                                                                                                         |
| pegasus_email_config    | None                                                                       | None / None                             | Intentionally server-only; preserve.                                                                                                                         |
| pegasus_email_outbox    | None                                                                       | None / None                             | Intentionally server-only; preserve.                                                                                                                         |

Policy names above have the exact table prefix, e.g.
`case_audit_events_insert_own`; the JSON snapshot lists every complete name and
USING/WITH CHECK expression. No anonymous policy exists. Service role retains
full table grants and bypasses RLS; ordinary API roles cannot CREATE in public.
Existing owner checks in Worker/tRPC do not constrain a separate direct Data API
request. Conversely, RLS does not constrain the current privileged direct Worker
connection. Both boundaries matter.

The prior production TRUNCATE and TRIGGER/REFERENCES revocations on the three
Pegasus tables are still present in migration history and grants. Nothing was
reapplied or changed there. Existing applied migration files/checksums unchanged.

## Reproduction and minimal repair

**P1 ownership gap confirmed in isolated PostgreSQL:** authenticated synthetic
owner A can insert an audit row with operator A into owner B's case. The actual
captured INSERT policy accepts it, the existing single-column FK accepts the
case's existence, and the captured sealing trigger produces a hash. The same
cross-case evidence append succeeds under the old policy. This is reproduced SQL
behavior, not merely a hypothetical reading of the policy. No production insert
was attempted. Live read-only counts found **zero** currently mismatched audit
and evidence rows; this does not prove no other misuse occurred.

The tested SQL repair is
`docs/security/proposals/20261029_vault_case_ownership.sql`:

1. Bind evidence `(case_id, owner_id)` and audit `(case_id, operator_id)` to
   `security_cases(id, owner_id)` with validated composite foreign keys.
   These also reject accidental mismatched BYPASSRLS/server writes.
2. Require matching case ownership in both child SELECT and INSERT policies.
3. Preserve authenticated operator SELECT; revoke its direct INSERT/UPDATE/DELETE.
   The application's real `ensureVaultOperator` upsert still succeeds through the
   trusted-server role. Self-edited DB role is not proven to elevate Supabase JWT
   app_metadata; this finding concerns mutable attribution and unnecessary access.
4. Remove anonymous grants on the four Vault tables and authenticated UPDATE/DELETE
   on append-only children. Triggers remain intact. Keep existing authenticated
   own-case operations; do not add public policies or change private tables.

The proposal is **not** in the automatic migration manifest. It is a single
transaction with lock/statement timeouts. Conflicting existing evidence makes
validation fail and rolls back every change; tests verify this separately for
both child tables. It never deletes or rewrites evidence to make validation pass.
Constraint validation rejects the old gap; it does not prove tamper-resistant
custody against the database owner, who can still alter constraints/triggers.

This preserves the application's current single-owner case model. Delegated or
collaborative case authorship would require a reviewed actor/owner distinction,
not silently loosening these checks.

## Verification evidence

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
corepack pnpm verify
OSIRIS_TEST_OWNERSHIP_BASELINE=1 corepack pnpm exec vitest run server/vault-ownership.test.ts
corepack pnpm exec vitest run server/vault-ownership.test.ts
corepack pnpm verify
git diff --check
```

Baseline full verify: exit 0, **194 tests / 34 files**. The initial test authoring
run included a missing proposal-file error; it is not security evidence. After
creating the proposal, baseline-mode run: exit 1, **14 failed / 11 passed**. Two
cross-case appends and identity/role edits succeeded; other failures expose
unnecessary grants or missing FK protection, not 14 independent exploits.

Repaired focused suite subsequently expanded to **26 passing tests**. It exercises
real SQL grants, RLS, FKs and the captured append-only/sealing triggers; no mock
policy evaluator. Includes two owners, anonymous/missing subject, impersonation,
identity/role edits, BYPASSRLS mismatches, case-owner movement, append protection,
real application operator provisioning/upsert, permitted appends and transactional
rollback on existing conflict. Each test transaction rolls back; engines close.

Final full verify: **220 tests / 35 files**, TypeScript, formatting, boundary and
configuration checks, static migration validation, frontend/Node/Worker builds.
The draft PR records exact repair SHA and final CI link. This branch starts from
main, not unmerged PR #61: its 11 Google tests are deliberately not incorporated.

## Approval gates and remaining gaps

- **Not applied.** Before production: independently review predicates and SQL;
  rehearse on disposable native PG17/Supabase; test real Auth/PostgREST claims and
  existing application clients; authorize this exact transaction separately.
- Recheck live schema/grants/policies and mismatch counts immediately beforehand.
  Confirm no external consumer legitimately writes operator profiles via Data API.
  Lock acquisition/validation cost and rollback timing require staging measurement.
  Snapshot at 06:33 is point-in-time evidence, not permission to apply later.
- PostgreSQL 18 WASM is real SQL evidence, but not hosted PG17, Hyperdrive, network
  authentication, concurrent sessions, row-lock timing or restored-backup evidence.
  Relevant fixture tables model the ownership columns/FKs/triggers, not a full
  Supabase bootstrap; Auth-user FK and all unrelated schema details are not modeled.
- Privileged postgres/BYPASSRLS, independently protected evidence custody, and
  Pegasus grant/provenance/alert-event ownership decisions remain unresolved.
  No role switch, credential rotation, new definer function or Pegasus edits.
- No production rollback is needed. Before commit, failed migration rolls back;
  after any separately authorized application, prefer an approved forward repair.
  Do not blindly restore broad grants or drop ownership constraints. Development
  rollback is reverting this PR commit. Preserve the snapshot and reproduction.
- PRs #47–#62, including both Pegasus branches and the Google repair, preserved.
  No merge, deployment, hosted provisioning or production migration authorized.

References: [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html),
[PGlite engine](https://pglite.dev/docs/about).
