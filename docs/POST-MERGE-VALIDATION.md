# Controlled validation after separate approval

This is a procedure, not evidence that these steps have been executed. It grants
no authorization to merge, deploy, send mail, infer with AI or write production.

1. Review the completion audit/diff and run GitHub CI on the proposed branch.
   Confirm the intended Cloudflare project, Supabase project and rollback version.
2. Review the recovered migration and remaining Vault bootstrap prerequisite as described
   in POSTGRES-MIGRATIONS.md. The recovered historical migration is already applied; no migration in this pass needs applying.
3. Inspect Supabase Authentication password settings. If leaked-password
   protection is still disabled, enable it if supported by the account's plan;
   otherwise record the plan limitation. Do not assume its current state.
4. On an authorized preview, sign in with two controlled Supabase accounts. Create
   disposable cases/evidence only with explicit write authorization. Confirm B
   cannot list A's metadata, read A's case, upload to A's case or request A's signed
   download URL. Test anonymously as well. Confirm the private bucket has public
   access disabled and no broad authenticated upload policy.
5. For an authorized owned file, confirm the download is an attachment and the
   signed URL expires after 60 seconds. A signed URL is bearer access until expiry:
   cross-account checks apply to requesting the URL, not to an already shared URL.
6. Inspect deployed HTML and `/api/health` headers, plus an API error response.
   Confirm HSTS/nosniff/frame/referrer/permissions policies, and no-store on API
   responses. Inspect account-level Cloudflare transforms for overrides. Health
   binding booleans are not proof of database access or AI availability.
7. Verify sign-in, sign-out and GitHub callback state rejection in a browser. With
   a controlled GitHub account, validate connect/manual check/disconnect and a
   scheduled run without triggering changes to unrelated accounts.
8. Verify PEGASUS append-only database protections and RLS using the disposable
   environment. Do not attempt destructive mutations against real evidence.
9. After explicit email authorization, use the owner-only email test once. Record
   provider acceptance and actual inbox arrival separately. Inspect the singleton
   email config's owner against the verified recipient, then test a controlled
   eligible alert only in the authorized environment. Check pending -> sending ->
   accepted or retry/failed. Do not turn on historical alert backfill by accident.
10. After explicit inference authorization, send a harmless short prompt through
    the authenticated AI endpoint. Confirm anonymous rejection and a useful reply.
    Never include evidence or secrets merely to smoke-test the binding.
11. Inspect recent cron results, Hyperdrive connectivity and outbox errors. Confirm
    both scheduled tasks complete independently. Record exact time, version and
    outcome, including failures; then assess production readiness.

External-only findings: current leaked-password setting, complete baseline schema/grants export, `pg_net` dependency graph, index usage statistics, remote binding
values, Cloudflare header transforms and real inbox/AI/browser outcomes.
