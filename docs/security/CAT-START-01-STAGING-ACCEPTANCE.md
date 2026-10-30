# CAT-START-01: staging acceptance and release hold

Status: **STAGING GATE NOT PASSED**. This is a release checklist, not authorization to deploy.

## Verified evidence (30 October 2026)

- PRs #69, #71, #72, #73, #74 and #75 are open drafts; later branches stack onto earlier drafts. Their green synthetic CI checks do **not** establish an integrated merged production build.
- OSIRIS Workers Cloudflare API `GET /accounts/{account_id}/workers/scripts/osiris-web/deployments` returned the latest listed active deployment dated 2026-09-27 17:32 UTC, version `5e185056-7eee-4589-a3c9-5d7343b82ce0` at 100%. The PR #75 bot reported a successful production _build_ for commit `89706036` on October 30; do **not** confuse build completion with active deployment.
- `postgres-challenge-store.mjs` uses PostgreSQL `INSERT ... ON CONFLICT DO NOTHING RETURNING` and `DELETE ... RETURNING`. Its tests use a Map-backed fake database, **not a hosted PostgreSQL concurrency test**.
- Draft SQL creates a challenge table and revokes PUBLIC privileges; it is not applied. No dedicated service role, schema grants, RLS/tenant boundary review, retention cleanup or hosted failover testing has been demonstrated.
- `webauthn-assertion.mjs` cryptographically checks an assertion; there is no verified relying-party registration, authenticator ownership lookup, credential revocation, server-issued approval signer or mandatory launcher connection.

## Acceptance sequence (in order)

1. **Inventory and branch integrity.** Confirm complete ancestry of the draft chain; run one combined checkout; verify no unrelated PR changes; confirm the real production deployment and actual routes separately. Do not merge or deploy draft branches.
2. **Isolated staging database.** Provision synthetic tenant and credentials only. Independently review table schema and explicit minimum grants, role access, RLS or enforceable equivalent, immutable audit and cleanup. Confirm clients/agents cannot query the challenge table. Never point staging tests at production.
3. **Real hosted negative database tests.** Run truly separate connections and workers competing for the same challenge (at most one claim). Test duplicate issuance, missing grants, tenant mismatch, expiry, concurrent delete, rollback, database timeout, lost acknowledgement and outage recovery. Record query output and evidence; distinguish denial before effect from uncertain outcome.
4. **WebAuthn relying-party trust.** Verify RP ID and HTTPS origin are configured, register a credential to the authenticated owner/tenant, store and check credential public key and counter policy, perform real user-verification ceremony, use atomic one-time server challenge. Test wrong identity, wrong credential, wrong plan, wrong origin, expiry, stale ceremony and revoked credential. Only trusted issuer may sign job-bound receipts.
5. **Mandatory host effect boundary.** Enumerate HTTP, queue, cron, agent, direct tool and emergency paths. Prove _each_ executes exclusively behind the same host verification and durable job claim. Two approvers or retries must never launch twice. Post-dispatch ambiguity must quarantine `EFFECT_UNKNOWN_RECONCILE`, not silently retry.
6. **Independent review and rollout.** A reviewer not implementing the change checks evidence, permissions and bypass inventory; owner expressly approves staging exit and controlled production change. Release only with observability, rollback, audit and rate/quota guards. No PROD authorization without those proofs.

## Hard stop

Until steps 1–6 are evidenced and accepted, keep all PRs draft, make no production DB or Worker changes and do not label the system release-ready. Passing unit tests and passing Cloudflare _builds_ are necessary but insufficient.
