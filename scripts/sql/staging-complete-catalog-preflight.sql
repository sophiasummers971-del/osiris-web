-- Read-only whole-application staging catalogue gate. Evidence is based on
-- read-only production catalog inventory from 2026-10-30.
-- Not a substitute for Auth/PostgREST tenant isolation or replay testing.
BEGIN READ ONLY;
DO $bootstrap$
DECLARE
  missing text[];
  found_tables integer;
  found_policies integer;
  found_foreign_keys integer;
  found_sequences integer;
BEGIN
  SELECT array_agg(v.name) INTO missing
  FROM (VALUES
    ('osiris_operators'), ('security_cases'), ('evidence_records'),
    ('case_audit_events'), ('monitoring_connections'),
    ('monitoring_observations'), ('monitoring_runs'),
    ('pegasus_alerts'), ('pegasus_chain_heads'), ('pegasus_email_config'),
    ('pegasus_email_outbox'), ('pegasus_security_events')
  ) AS v(name)
  WHERE to_regclass(format('public.%I', v.name)) IS NULL;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_INCOMPLETE: missing public tables: %', missing;
  END IF;

  SELECT count(*) INTO found_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname = ANY (ARRAY[
      'osiris_operators', 'security_cases', 'evidence_records',
      'case_audit_events', 'monitoring_connections',
      'monitoring_observations', 'monitoring_runs',
      'pegasus_alerts', 'pegasus_chain_heads', 'pegasus_email_config',
      'pegasus_email_outbox', 'pegasus_security_events'
    ]);
  SELECT count(*) INTO found_policies FROM pg_policies
    WHERE schemaname = 'public';
  SELECT count(*) INTO found_foreign_keys
  FROM pg_constraint con JOIN pg_namespace n ON n.oid = con.connamespace
  WHERE n.nspname = 'public' AND con.contype = 'f';
  SELECT count(*) INTO found_sequences FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S';

  IF found_tables <> 12 OR found_policies < 18
     OR found_foreign_keys < 20 OR found_sequences < 4 THEN
    RAISE EXCEPTION
      'BOOTSTRAP_INCOMPLETE: table=%, policy=%, foreign_key=%, sequence=%',
      found_tables, found_policies, found_foreign_keys, found_sequences;
  END IF;
  IF to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'BOOTSTRAP_INCOMPLETE: auth.users unavailable';
  END IF;
  RAISE NOTICE
    'CATALOGUE_MINIMUM_PASSED only. Compare DDL, grants, owners, triggers, RLS and hosted authorization separately.';
END
$bootstrap$;
ROLLBACK;
