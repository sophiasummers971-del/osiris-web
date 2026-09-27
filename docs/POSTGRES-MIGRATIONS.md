# PostgreSQL migration discipline

`pnpm db:validate` checks the reviewed `drizzle/postgres-manifest.json` against all
SQL files in `drizzle/migrations`, including order and SHA-256. Missing, extra or
modified files fail validation. An intentional new migration must add a reviewed
manifest entry; never silently rewrite an applied migration's checksum.

The sequence and read-only verified production versions are:

| Repository file                                           | Applied version  |
| --------------------------------------------------------- | ---------------- |
| `0000_qualify_audit_digest_function.sql`                  | `20260803154721` |
| `0001_pegasus_foundation.sql`                             | `20260808132419` |
| `0002_pegasus_append_only.sql`                            | `20260808151834` |
| `0003_pegasus_function_search_path.sql`                   | `20260808152608` |
| `0004_supabase_table_hardening.sql`                       | `20260914203913` |
| `0005_github_monitoring_foundation.sql`                   | `20260915134225` |
| `20260916115648_pegasus_private_email_outbox.sql`         | `20260916115648` |
| `20260916170726_disable_unrestricted_storage_uploads.sql` | `20260916170726` |

These files require the original Vault tables (`osiris_operators`, `security_cases`,
`evidence_records`, `case_audit_events`) and Supabase auth/storage schemas. The
original Vault DDL is not in canonical Git. `drizzle/vault-schema.ts` describes
application columns but is not sufficient evidence of all historical RLS policies,
triggers, grants or migration names. Do not invent that missing history.

A read-only Supabase ledger check on 2026-09-27 confirmed eight applied migrations.
The missing `20260803154721` audit function was recovered verbatim (plus provenance
comments) as `0000_qualify_audit_digest_function.sql`. It is already applied remotely;
**do not apply it again as a new migration**. The manifest maps historical filenames
to the real applied versions. Original table creation predates that ledger.

A current read-only catalog inventory of all four Vault tables, columns,
constraints, indexes, triggers and policies is preserved in
`docs/completion/vault-schema-inventory.json`. It contains no user rows. It is not
an executable baseline, grants export or full restore. Before a fresh-database
bootstrap, obtain a complete schema-only export (including referenced functions,
grants and Supabase prerequisites), review it, and rehearse on a disposable
Supabase-compatible database. Do not invent original migration history.

Validation here is static inventory/integrity checking. It does not establish SQL
execution success, production drift or the state of remote RLS policies. The
existing SQL outbox test uses rollback but advances sequences; it must not be run
on production as part of this pass.

The legacy top-level `drizzle/000*.sql`, `schema.ts` and `drizzle.config.ts` are
MySQL history. They are not in the PostgreSQL manifest or any deployment command.
`db:push` was removed because its name concealed that mismatch.

## Index and extension findings

Existing PostgreSQL migrations index evidence ownership, audit operator IDs,
alert event IDs, monitoring due work and email due/owner queries. These have
repository-visible query/FK purposes and are retained. Absence of observed usage
in a conversation is not proof that an index is disposable. Further index removal
needs production query/statistics evidence; no speculative DDL is added.

No runtime reference to `pg_net` was found. That does not prove the extension is
unused by database functions, jobs or other applications. Its placement in
`public` requires a separate dependency/extension review. Do not drop or relocate
it based only on this repository scan.

## Fresh advisor observations (read-only, 2026-09-27)

- Four unindexed FK findings: monitoring observations' event/run IDs, monitoring
  runs' owner ID, and email outbox's alert/owner pair. Potentially useful; no new
  join/filter bottleneck or production workload proof was established. The outbox
  already has a primary key on alert ID and an owner index. Review query plans
  before adding redundant indexes.
- Three unused-index observations: case audit case/operator and alert event indexes.
  Retain: they serve FK/query patterns and an unused observation is not deletion proof.
- Five RLS-without-policy information notices concern server-only monitoring/email
  tables. This intentionally denies ordinary browser roles, rather than granting
  broad policies to silence the advisor.
- Leaked-password protection remains disabled and pg_net remains in public. No
  settings/extensions were changed.

Advisor references: [unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys),
[unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index),
[server-only RLS tables](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[extension placement](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
