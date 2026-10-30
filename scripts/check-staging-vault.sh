#!/usr/bin/env bash
# Read-only staging-only preflight; never applies a migration or restores schema.
set -Eeuo pipefail
: "${OSIRIS_STAGING_DATABASE_URL:?Missing staging URL}"
: "${OSIRIS_EXPECTED_STAGING_REF:?Missing independently recorded staging ref}"
if [[ "$OSIRIS_EXPECTED_STAGING_REF" == "pussbwanjsrvitaxzsnh" ]]; then
  echo "BLOCKED: production project ref" >&2
  exit 2
fi
# For this guard require direct Supabase database hostname, not ambiguous pooler.
# Parse the actual connection URL rather than trusting a second caller string.
node -e '
const url = new URL(process.env.OSIRIS_STAGING_DATABASE_URL);
const ref = process.env.OSIRIS_EXPECTED_STAGING_REF;
if (!/^postgres(?:ql)?:$/.test(url.protocol) ||
    !/^[a-z0-9]{20}$/.test(ref) ||
    url.hostname !== "db." + ref + ".supabase.co") {
  process.stderr.write("BLOCKED: staging URL does not identify expected project\n");
  process.exit(2);
}
'
command -v psql >/dev/null || { echo "psql unavailable" >&2; exit 2; }
PGOPTIONS="-c default_transaction_read_only=on" \
  psql "$OSIRIS_STAGING_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -f scripts/sql/staging-vault-preflight.sql
echo "Vault catalog presence only: hosted Auth/PostgREST still UNVERIFIED."
