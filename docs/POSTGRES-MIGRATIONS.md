# PostgreSQL migration discipline

`pnpm db:validate` checks the reviewed `drizzle/postgres-manifest.json` against all
SQL files in `drizzle/migrations`, including order and SHA-256. Missing, extra or
modified files fail validation. An intentional new migration must add a reviewed
manifest entry; never silently rewrite an applied migration's checksum.

The sequence is:

1. `0001_pegasus_foundation.sql`
2. `0002_pegasus_append_only.sql`
3. `0003_pegasus_function_search_path.sql`
4. `0004_supabase_table_hardening.sql`
5. `0005_github_monitoring_foundation.sql`
6. `20260916115648_pegasus_private_email_outbox.sql`
7. `20260916170726_disable_unrestricted_storage_uploads.sql`

These files require the original Vault tables (`osiris_operators`, `security_cases`,
`evidence_records`, `case_audit_events`) and Supabase auth/storage schemas. The
original Vault DDL is not in canonical Git. `drizzle/vault-schema.ts` describes
application columns but is not sufficient evidence of all historical RLS policies,
triggers, grants or migration names. Do not invent that missing history.

Before authorizing any clean-database bootstrap or production migration, obtain a
schema-only export and a read-only export of `supabase_migrations.schema_migrations`
from the intended Supabase project. Reconcile the reported eighth applied migration
and preserve the exact baseline in a reviewed follow-up. Do not include user rows,
auth credentials or secrets in the export. Only then rehearse the entire sequence
on a disposable Supabase-compatible database. An ordinary PostgreSQL instance
without Supabase roles/functions/storage schemas is not equivalent.

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
