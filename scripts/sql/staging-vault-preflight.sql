-- OSIRIS staging-only fail-closed schema acceptance gate.
-- Invoke psql -X -v ON_ERROR_STOP=1 -f scripts/sql/staging-vault-preflight.sql
-- This is NOT hosted Auth/PostgREST authorization acceptance.
BEGIN READ ONLY;
DO $preflight$
DECLARE
  missing_tables text[];
  missing_policies text[];
  missing_triggers text[];
  disabled_rls text[];
BEGIN
  SELECT array_agg(name) INTO missing_tables
  FROM (VALUES ('osiris_operators'),('security_cases'),('evidence_records'),('case_audit_events')) AS v(name)
  WHERE to_regclass(format('public.%I',name)) IS NULL;
  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'OSIRIS_STAGING_BLOCKED: missing Vault tables: %',missing_tables;
  END IF;

  SELECT array_agg(c.relname) INTO disabled_rls FROM pg_class c
  WHERE c.oid = ANY(ARRAY[
    'public.osiris_operators'::regclass,'public.security_cases'::regclass,
    'public.evidence_records'::regclass,'public.case_audit_events'::regclass])
    AND NOT c.relrowsecurity;
  IF disabled_rls IS NOT NULL THEN
    RAISE EXCEPTION 'OSIRIS_STAGING_BLOCKED: RLS disabled: %',disabled_rls;
  END IF;

  SELECT array_agg(v.policy) INTO missing_policies
  FROM (VALUES
    ('osiris_operators','osiris_operators_select_own'),
    ('security_cases','security_cases_select_own'),
    ('evidence_records','evidence_records_select_own'),
    ('evidence_records','evidence_records_insert_own'),
    ('case_audit_events','case_audit_events_select_own'),
    ('case_audit_events','case_audit_events_insert_own')
  ) v(tbl,policy)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename=v.tbl AND p.policyname=v.policy);
  IF missing_policies IS NOT NULL THEN
    RAISE EXCEPTION 'OSIRIS_STAGING_BLOCKED: missing named policies: %',missing_policies;
  END IF;

  SELECT array_agg(v.trigger_name) INTO missing_triggers
  FROM (VALUES
    ('evidence_records','protect_evidence_records'),
    ('case_audit_events','protect_case_audit_events'),
    ('case_audit_events','seal_case_audit_event')
  ) v(tbl,trigger_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=v.tbl
      AND t.tgname=v.trigger_name AND NOT t.tgisinternal AND t.tgenabled <> 'D');
  IF missing_triggers IS NOT NULL THEN
    RAISE EXCEPTION 'OSIRIS_STAGING_BLOCKED: missing enabled Vault triggers: %',missing_triggers;
  END IF;

  RAISE NOTICE 'PRESENCE_CHECK_PASSED: Vault tables, RLS, policy names and triggers exist. Hosted authorization remains UNVERIFIED.';
END
$preflight$;
ROLLBACK;
