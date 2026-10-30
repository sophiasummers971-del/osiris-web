#!/usr/bin/env bash
# Collect a schema-only candidate for manual review. Never reads table rows.
# Run only from a trusted workstation with PostgreSQL 17 pg_dump.
# Requires OSIRIS_SCHEMA_EXPORT_URL configured outside Git and shell history.
set -Eeuo pipefail
umask 077
: "${OSIRIS_SCHEMA_EXPORT_URL:?Set OSIRIS_SCHEMA_EXPORT_URL securely (never commit it)}"
command -v pg_dump >/dev/null || { echo 'PostgreSQL pg_dump is required' >&2; exit 2; }
out="${1:-./osiris-public-schema-review.sql}"
if [[ -e "$out" ]]; then echo "Refusing to overwrite existing output" >&2; exit 2; fi
case "$out" in *.sql) ;; *) echo 'Output must be a .sql review file' >&2; exit 2;; esac
# No data, no auth.users or storage rows. Public schema only, not a complete
# Supabase bootstrap: review role/extension/auth dependencies separately.
pg_dump --dbname="$OSIRIS_SCHEMA_EXPORT_URL" --schema-only --no-owner --no-privileges \
  --schema=public --file="$out"
chmod 600 "$out"
echo "Candidate written locally for REVIEW ONLY. Do not commit unreviewed export."
echo "Inspect SECURITY DEFINER functions, extensions, role dependencies, grants,"
echo "auth/storage references, sensitive literals and non-public prerequisites."
