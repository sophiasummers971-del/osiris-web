-- Read-only staging preflight for OSIRIS. Run against an ISOLATED branch.
-- Does not apply migrations or access user records.
-- PASS is only a schema-presence gate, NOT hosted Auth/PostgREST verification.
WITH required_table(name) AS (
  VALUES ('osiris_operators'), ('security_cases'),
         ('evidence_records'), ('case_audit_events')
), tables AS (
 SELECT name, to_regclass(format('public.%I', name)) IS NOT NULL AS present
 FROM required_table
), policy_counts AS (
 SELECT tablename, count(*)::int AS n
 FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN (SELECT name FROM required_table)
 GROUP BY tablename
), checks AS (
 SELECT t.name, t.present,
        coalesce(p.n, 0) AS policy_count,
        coalesce(c.relrowsecurity, false) AS rls_enabled
 FROM tables t
 LEFT JOIN pg_class c ON c.oid = to_regclass(format('public.%I', t.name))
 LEFT JOIN policy_counts p ON p.tablename = t.name
)
SELECT name, present, policy_count, rls_enabled,
       CASE WHEN NOT present THEN 'BLOCKED_MISSING_TABLE'
            WHEN NOT rls_enabled THEN 'BLOCKED_RLS_DISABLED'
            WHEN policy_count = 0 THEN 'BLOCKED_POLICY_MISSING'
            ELSE 'PRESENCE_ONLY_NOT_VERIFIED' END AS status
FROM checks ORDER BY name;
