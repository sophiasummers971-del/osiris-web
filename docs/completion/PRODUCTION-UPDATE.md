# Production update preparation — 2026-09-27

Jade explicitly authorized updating the existing deployment and removing stale
configuration. Canonical main was rechecked at `9d9c332`; production still served
version `54767658-feda-4497-8fbe-0bb6a4f338d0` (rollback reference).

## Corrections before deployment

- The Cloudflare non-main trigger previously ran `wrangler deploy` against the
  production Worker. It now verifies branches and only echoes a completion message.
- The main trigger now runs a frozen install and `pnpm verify` with pnpm 10.34.5.
  Build caching is disabled for this release. Deployment uses the previously
  successful Wrangler 4.132.0 with `--keep-vars`.
- Both build triggers had an obsolete Supabase URL and public key. They now match
  the current Worker's public configuration. Node 24 is explicitly selected.
- Client bootstrap now reads runtime configuration even when build-time variables
  exist. The runtime values take precedence before the authentication client is
  created. Two regression tests cover stale-build precedence and client stability.
- Static responses require cache revalidation; Worker-served HTML does too.
  Hashed asset filenames continue to separate builds. A regression test covers HTML.
- Unreferenced Manus debug collector and unfinished push service-worker files were
  removed from public assets. Neither had a current registration/import. The old
  push worker had no fetch handler or offline cache.

No database migrations or production-data edits are needed for this release.
Existing secret bindings, Hyperdrive, AI, email binding and fifteen-minute cron
remain required. Preserve these when deploying.

Local `pnpm verify` passed: 173 tests in 32 files, typecheck, formatting, architecture
checks, configuration checks, eight migration checksums and frontend/server/Worker
builds. Real authenticated workflows and controlled email delivery still require
the operator session; public smoke checks cannot establish those results.

This document records preparation, not a claim of deployment success. Cloudflare's
deployment history and the release handoff identify the final deployed version.
