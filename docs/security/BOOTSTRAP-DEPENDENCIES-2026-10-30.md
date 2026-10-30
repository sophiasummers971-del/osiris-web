# OSIRIS bootstrap dependency inventory — 2026-10-30

Status: **PARTIAL READ-ONLY RECOVERY / NOT AN EXECUTABLE BOOTSTRAP**.

## Grounded inventory

The live production PostgreSQL catalogue was queried read-only. It reports:

- 12 application tables in `public` and 18 policies (earlier snapshot)
- 20 foreign-key relationships across the public application schema
- 4 public sequences
- 26 installed extensions (not all are application dependencies)
- 140 table-grant rows for `anon`, `authenticated`, and `service_role`
- `anon` and `authenticated` have `BYPASSRLS=false`
- `postgres` and `service_role` have `BYPASSRLS=true`

The Vault-only detailed definitions are in `docs/security/evidence/vault-catalog-2026-10-30.json`, containing 41 columns, 21 constraints, 12 policies, 3 triggers, 2 functions and 13 indexes.

Foreign keys target `security_cases`, `osiris_operators`, `monitoring_connections`, `pegasus_security_events`, `monitoring_runs`, `pegasus_alerts`, `pegasus_email_config`, and `auth.users` (shown as `users` in catalogue output). This establishes that bootstrap requires the managed Auth schema and ordered Pegasus/monitoring dependencies.

Observed extension schemas include `extensions`, `public`, `pg_catalog` and `vault`. `pg_net` is installed in `public` and the audit sealing function references `extensions.digest`. Neither permits dropping, copying, or relocating extensions without a separate dependency proof.

## Rebuild gates

1. Obtain complete, reviewed `pg_dump --schema-only` of **public**, including owners/GRANT semantics via a separate secured inventory, not application data or credentials. This has not yet been completed.
2. Resolve all cross-schema dependencies (`auth.users`, `storage`, `extensions`) in a disposable Supabase-compatible instance.
3. Synthesize a standalone, versioned staging baseline **without** rewriting historical migration checksums or faking ledger entries.
4. Compare *all twelve tables*, sequences, indexes, triggers, policies, function definitions, grants and extension dependencies to production metadata.
5. Replay canonical migrations in correct historical order, identifying which are already incorporated into the baseline to avoid double-application.
6. Prove PostgreSQL isolation, hosted Supabase Auth/PostgREST behaviour, OSIRIS ownership repair and Pegasus bridge contract with synthetic users before any production approval.

## Explicitly not proven

The recorded evidence is insufficient to create an exact full bootstrap. Do not promote the Vault-only catalogue into executable SQL and mistake it for a fresh production-equivalent environment. PR #63 remains draft, and `SCHEMA_BOOTSTRAP_VERIFIED`, `HOSTED_INTEGRATION_VERIFIED`, and `BRIDGE_CONTRACT_VERIFIED` are all blocked.
