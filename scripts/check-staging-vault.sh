#!/usr/bin/env bash
# Fail-closed staging import preflight. Never connects to production.
set -Eeuo pipefail
: "${OSIRIS_STAGING_DATABASE_URL:?Set an isolated staging database URL}"
: "${OSIRIS_EXPECTED_STAGING_REF:?Set the isolated Supabase project ref}"
: "${OSIRIS_ACTUAL_STAGING_REF:?Set the actual connection's independently verified project ref}"
if [[ "${OSIRIS_EXPECTED_STAGING_REF}" != "${OSIRIS_ACTUAL_STAGING_REF}" ]]; then
  echo "BLOCKED: staging project identity mismatch" >&2
  exit 2
fi
if [[ "${OSIRIS_ACTUAL_STAGING_REF}" == "pussbwanjsrvitaxzsnh" ]]; then
  echo "BLOCKED: production project is forbidden" >&2
  exit 2
fi
command -v psql >/dev/null || { echo "psql unavailable" >&2; exit 2; }
# The role must not be a superuser when running the diagnostic.
# This command is read-only; it never restores the schema or applies migrations.
PGOPTIONS="-c default_transaction_read_only=on" \
  psql "$OSIRIS_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -f scripts/sql/staging-vault-preflight.sql
echo "Only Vault presence verified. Hosted identity and migration replay unverified."
