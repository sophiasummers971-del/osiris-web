#!/usr/bin/env bash
# Isolated staging-only schema rehearsal. Never points at production.
# The schema file must be manually reviewed before use.
set -Eeuo pipefail
umask 077
: "${OSIRIS_STAGING_DATABASE_URL:?Missing isolated staging database URL}"
: "${OSIRIS_EXPECTED_STAGING_REF:?Missing staging project ref}"
: "${OSIRIS_STAGING_REHEARSAL_APPROVED:?Explicit staging approval required}"
[[ "$OSIRIS_STAGING_REHEARSAL_APPROVED" == "yes" ]] || { echo "BLOCKED: staging rehearsal not approved" >&2; exit 2; }
[[ "$OSIRIS_EXPECTED_STAGING_REF" != "pussbwanjsrvitaxzsnh" ]] || { echo "BLOCKED: production ref" >&2; exit 2; }
candidate="${1:?Pass an independently reviewed schema-only SQL export}"
[[ -f "$candidate" && -s "$candidate" && "$candidate" == *.sql ]] || { echo "BLOCKED: missing SQL candidate" >&2; exit 2; }
command -v node >/dev/null && command -v psql >/dev/null || { echo "Requires node and psql" >&2; exit 2; }
node -e '
const u = new URL(process.env.OSIRIS_STAGING_DATABASE_URL);
const ref = process.env.OSIRIS_EXPECTED_STAGING_REF;
if (!/^postgres(?:ql)?:$/.test(u.protocol) ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    u.hostname !== `db.${ref}.supabase.co`) {
  console.error("BLOCKED: connection URL does not match direct staging project");
  process.exit(2);
}
'
# Refuse a nonempty application schema; no destructive schema reset is supported.
count="$(psql "$OSIRIS_STAGING_DATABASE_URL" -X -At -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname IN ('osiris_operators','security_cases','evidence_records','case_audit_events','pegasus_security_events','monitoring_connections')")"
[[ "$count" == "0" ]] || { echo "BLOCKED: staging already contains OSIRIS tables" >&2; exit 2; }
# Transactional restore of REVIEWED schema only. This does not create Supabase Auth.
psql "$OSIRIS_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 -1 -f "$candidate"
# A clean schema-only restore does not prove migration replay or authorization.
OSIRIS_STAGING_REHEARSAL_APPROVED= \
  bash scripts/check-staging-vault.sh
echo "SCHEMA_RESTORED_FOR_REVIEW: no hosted authorization or historical migration replay acceptance."
