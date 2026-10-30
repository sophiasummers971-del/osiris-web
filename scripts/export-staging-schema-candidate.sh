#!/usr/bin/env bash
# Read-only PostgreSQL 17 schema export for isolated review.
# The URL must be provided securely, outside Git and shell history.
set -Eeuo pipefail
umask 077

: "${OSIRIS_SCHEMA_EXPORT_URL:?Set the production DATABASE URL securely}"
command -v pg_dump >/dev/null || { echo "PostgreSQL pg_dump required" >&2; exit 2; }
command -v node >/dev/null || { echo "Node.js required" >&2; exit 2; }
command -v sha256sum >/dev/null || { echo "sha256sum required" >&2; exit 2; }

node -e '
const u = new URL(process.env.OSIRIS_SCHEMA_EXPORT_URL);
if (!/^postgres(?:ql)?:$/.test(u.protocol) ||
    u.hostname !== "db.pussbwanjsrvitaxzsnh.supabase.co") {
  console.error("BLOCKED: schema export URL must target the verified OSIRIS database");
  process.exit(2);
}
'

out="${1:-./osiris-public-schema-review.sql}"
case "$out" in *.sql) ;; *) echo "Expected a .sql output filename" >&2; exit 2 ;; esac
[[ ! -e "$out" && ! -e "$out.sha256" ]] || { echo "Refusing to overwrite output" >&2; exit 2; }
tmp="$(mktemp "${out}.partial.XXXXXXXX")"
trap 'rm -f "$tmp"' EXIT

# No application rows; include public table grants, policies, functions,
# triggers, constraints and sequences. Auth/storage managed schemas are not
# exported, and their dependencies must be reviewed separately.
pg_dump --dbname="$OSIRIS_SCHEMA_EXPORT_URL" --schema-only --no-owner \
  --schema=public --file="$tmp"

[[ -s "$tmp" ]] || { echo "Empty schema export" >&2; exit 2; }
mv "$tmp" "$out"
sha256sum "$out" > "$out.sha256"
chmod 600 "$out" "$out.sha256"
echo "Schema-only candidate and SHA256 recorded locally. REVIEW REQUIRED."
echo "Never upload or commit an unreviewed export or database credentials."
