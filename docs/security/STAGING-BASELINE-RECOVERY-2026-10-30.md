# OSIRIS staging baseline recovery gate (30 October 2026)

## Confirmed root cause
The PostgreSQL migration manifest declares `externalBaseline.required=true`. Original Vault table creation predates the migrations recorded in Supabase history; it is absent from canonical Git. Existing `docs/completion/vault-schema-inventory.json` is a partial catalog, explicitly NOT an executable restore.

During a disposable Supabase branch rehearsal (branch deleted afterward), the branch had no public tables and only the `qualify_audit_digest_function` migration in history. Production had eleven migration entries. Therefore the created branch was **not a valid OSIRIS integration test environment**; PR #63 remained draft and hosted integration UNVERIFIED.

## Immediate safe gate
Run `scripts/sql/staging-vault-preflight.sql` against the **isolated staging branch**, never as an excuse to modify production. This read-only statement checks presence, RLS enabled, and policy count of all four Vault tables. Treat **every** status, including `PRESENCE_ONLY_NOT_VERIFIED`, as **not integration verified**. Presence is a minimum condition, not authorization acceptance.

## Baseline recovery sequence
1. Obtain **schema-only** metadata/export from production through an approved read-only mechanism, including tables, constraints, sequences, functions, triggers, indexes, RLS policies, grants, auth/storage dependencies, and extensions. Do not export actual user rows or credentials.
2. Review the export for sensitive literals, `SECURITY DEFINER`, extension dependencies and role ownership. Compare to manifest and known inventory; preserve historical migration hashes and ledger.
3. Create a new, versioned *baseline bootstrap artifact for fresh isolated environments*, distinct from historical applied migrations. It must never automatically run against production or falsely mark migration history.
4. Rehearse bootstrap on a disposable Supabase branch, then replay the remaining canonical migrations in recorded order; compare catalog/grants/policies to reviewed production inventory.
5. Add an automated *fatal* completeness check before any PR #63 ownership test. Test with two distinct hosted Auth users via PostgREST, allow same-case operations, reject cross-case reads/writes, and preserve audit/custody restrictions.
6. Destroy the branch after collecting redacted test evidence. Only then consider `HOSTED_INTEGRATION_VERIFIED`. Production deployment and migration require separate authorization.

## Do not
- Invent the original DDL using only the partial inventory or MySQL legacy migrations.
- Run `drizzle/000*.sql` against PostgreSQL.
- Run PR #63 on `main`, merge it, or mutate production.
- Call a passing table-presence check hosted Auth verification.
