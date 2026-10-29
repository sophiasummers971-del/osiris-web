# Shared claim and recovery verification — 29 October 2026

**Verdict: tested synthetic exclusion PASS; production and automatic recovery INCOMPLETE / AMBER.** This is a single-filesystem shared coordinator prototype. It is not a production distributed claim service or an exactly-once guarantee across restored storage.

## Source, preflight and scope

Repository `sophiasummers971-del/osiris-web`; new draft [PR #52](https://github.com/sophiasummers971-del/osiris-web/pull/52), branch `feature/rule-zero-shared-claims`, stacked on #51. Exact base: **`b4769259d637bafa07884e489616c4022a704650`**, tree `336f7ee1609f25bb6a0f030badc38a62f092a5d6`. Source/test revision: **`a121bd81d84b76dc8912625a533f8734702a1725`**, tree `7256f6bc049027dcf9657660cc94752a41c1cc40`. This report is a subsequent documentation-only commit; its containing revision and final CI are identified in PR #52 and the delivery message.

**PREFLIGHT_PASS for isolated development testing**, with quota explicitly unverified:

- A new, separate checkout was created from the exact base. Origin was set to `https://github.com/sophiasummers971-del/osiris-web.git`; branch, HEAD and initially empty `git status --short` were verified. Existing checkouts were untouched. After source publication, staged files were compared against the remote source commit and the isolated checkout was reconciled cleanly to it.
- Authenticated connector repository-scoped PR GETs succeeded. The authorized account was confirmed; the repository listing reported pull/push permission. No actual repository HTTP 401, 403 or 429 occurred. **QUOTA_UNVERIFIED / UNSUPPORTED_TELEMETRY** remains recorded; the unsupported quota endpoint was not retried and no quota number is invented.
- Official [GitHub status](https://www.githubstatus.com/) and [Cloudflare service components](https://www.cloudflarestatus.com/services) were read at approximately 00:57–00:58 UTC. GitHub API/Git/Actions and Cloudflare API, Workers and Durable Objects were operational in the opened pages. An initial cached search excerpt had shown Durable Objects degraded; it was not used as current status. This prototype does not connect to any Cloudflare account or depend on that service.
- Linux x86_64, Node `v24.22.1`, Python `3.12.14`, pinned Corepack pnpm `10.34.5`; `corepack pnpm install --frozen-lockfile --ignore-scripts` passed using cached dependencies. No new dependency, package/lockfile, workflow or migration was added.
- All runtime verification used a credential-stripped environment, Node network-denial preload, temporary private directories, generated synthetic keys and disposable workers. No production credential, personal data, database or infrastructure access was required. The existing verification script checks migration files but does not apply them. No live agents, production modifications, merge or deployment occurred.

This is fresh reproducible test evidence, not organizationally independent certification: the same assistant authored earlier prototypes. An external reviewer must rerun and assess the boundary.

## Identity and authorization contract

The journal derives keys from verified signed Plan Y material, using canonical JSON tuples rather than delimiter concatenation.

| Entity   | Tenant-scoped identity and binding                                               | Policy                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plan     | `[tenant, "plan", taskId, version]` → exact plan hash                            | Same task/version cannot bind different plan bytes. Later versions require new approval. No automatic supersession of older versions.                        |
| Approval | `[tenant, "approval", approvalId]` → hash of the complete verified approval body | One plan-wide receipt may authorize distinct independent steps. Its ID cannot be refreshed or rebound to different receipt bytes. It is not a one-job grant. |
| Contract | `[tenant, "contract", contractId]`                                               | Permanently exclusive after acquisition, including failures. Contract hash and signed receipt are retained.                                                  |
| Agent    | `[tenant, "agent", NR-xxxxx]`                                                    | Permanently exclusive in this store generation; new key material does not free a used identity.                                                              |
| Job      | `[tenant, "job", jobId]`                                                         | Permanently exclusive, including after expiry, stop, restart or uncertainty.                                                                                 |
| Step     | `[tenant, "step", planHash, stepId]`                                             | Once-only assignment for that exact plan.                                                                                                                    |

Owner/task/tenant, key fingerprints, plan hash/version, expiry and permitted scope still pass the existing cryptographic verifier. The claim client independently pins public keys, copies the registry and snapshots signed input bytes before storage awaits. It revalidates the bundle after acquiring serialization. Invalid signatures, tenant mismatches, expired/future credentials and changed plans cannot create claims. Agents cannot supply the coordinator configuration, executor, registry or authorization callback through `start` or worker IPC.

`sharedClaims` is an explicit **host** configuration. Metrics distinguish `SHARED_SYNTHETIC` from retained `LOCAL_ONLY` compatibility mode. An invalid configured store fails rather than silently falling back. A future multiple-supervisor entry point must require shared mode and a protected common store/epoch; this prototype does not make every older host constructor globally mandatory.

## Atomic persistence and enforcement

The synthetic coordinator serializes operations with atomic POSIX `mkdir` of `exclusive.lock`. Contention denies immediately; no waiting retry, lock stealing or time-based cleanup exists. All exclusive keys and nonexclusive bindings are written together in **one ACQUIRED record**. Partial persistence cannot return a successful grant. Existing claims are never deleted or released, so any uncertain partial outcome fails closed.

Each canonical journal event contains a sequence, previous hash, store ID and content hash. The append is fsynced; a separate create-exclusive witness file with identical bytes is fsynced, as is its directory, before acknowledgment. Every operation validates the entire bounded chain against the separately retained witness. ACQUIRED records preserve canonical plan JSON and the exact signed approval/contract receipts, not private keys. Returned inspection data is deeply frozen. These are append-only application semantics and tamper-detection evidence under trusted host storage, **not WORM storage or cryptographic protection against a privileged host rewriting both copies**.

The state sequence is ACQUIRED → EXECUTING → QUARANTINED. EXECUTING must persist before spawn. Both before spawn and immediately before the synthetic adapter effect, the supervisor checks shared ownership/lifetime as well as its existing local lease, signatures, scopes, resource/zone checks, Rule Zero gate and isolation guards. Claim time is bounded by the supervisor lease, contract and approval expiry. A late acknowledgment cannot extend that lifetime.

Shared calls have a 500 ms fail-closed deadline. Timeout latches supervisor health RED; the underlying filesystem call may still finish later, but it cannot resume revoked local execution or make the claim reusable. The original local audit and stop deadlines were not relaxed. Revocation/generation invalidation remains synchronous; shared quarantine persistence runs in parallel with signal delivery. Exit evidence and `sharedQuarantinePersisted` are distinct observations. A log/quarantine acknowledgment never substitutes for actual observed process exit.

## Actual verification and reproducibility

Run from a clean checkout of the source revision with its pinned toolchain:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
node --test scripts/rule-zero/shared-claims.test.mjs
node --test scripts/rule-zero/*.test.mjs
corepack pnpm verify
git diff --check
```

The tests generate their own temporary stores and authority keys. They require the same Linux x86_64/Python/Node isolation profile as the existing supervisor tests. No test endpoint, credential or remote database is needed. Parent-side fault hooks pause real filesystem operations or make acknowledgments fail; worker inputs cannot inject those hooks.

| Actual command/run, UTC on 29 October                                     | Result                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base full `node --test scripts/rule-zero/*.test.mjs`, 00:58:40–00:58:48   | 246 passed, exit 0.                                                                                                                                                     |
| First focused new harness, 01:00:40–01:00:42                              | 20 passed / 4 failed, exit 1. Four fixtures used job IDs shorter than the existing eight-character minimum. They were corrected; the existing verifier was not relaxed. |
| Expanded focused harness, 01:01:36–01:01:41                               | 31 passed, exit 0.                                                                                                                                                      |
| Final 37-case focused harness, 01:02:26–01:02:34                          | 37 passed, exit 0.                                                                                                                                                      |
| Full integrated suite before explicit mode diagnostics, 01:02:33–01:02:41 | 283 passed, exit 0; its first second overlapped the focused run. No failure was hidden.                                                                                 |
| `corepack pnpm verify`, 01:02:49–01:03:08                                 | Passed, exit 0.                                                                                                                                                         |
| Final integrated suite after diagnostic changes, 01:03:38–01:03:47        | **283 passed**, zero failures, skips or cancellations; exit 0.                                                                                                          |
| Final `corepack pnpm verify`, 01:03:47–01:04:01                           | **Passed**, exit 0: static/configuration/migration-file checks, TypeScript, **194 repository tests in 34 files**, formatting and client/server/Worker builds.           |
| `git diff --check`                                                        | Passed.                                                                                                                                                                 |

Key retained observations:

- **Two independent supervisor Node processes**, independently generated agent keys, common tenant job/store, simultaneous starts: exactly one GREEN, one spawned worker and one adapter effect. The losing supervisor could not dispatch work. Final local diagnostic PID `189` was observed exited and independently absent; `sharedQuarantinePersisted: true`. Another test races six separate Node claim-client processes: exactly one successful acquisition, one retained ACQUIRED record.
- Fresh remaining identifiers cannot bypass a conflicting job, contract, agent or step. Separate authenticated tenants can use their own namespace. An approval can authorize distinct steps without allowing receipt or same-version plan rebinding.
- Lost durable acquisition acknowledgment and lost begin acknowledgment deny progress. Begin acknowledgment loss produced **zero spawned workers** and retained a crash lock. A real process killed while holding the writer lock prevented restarted clients from opening the store.
- Storage/witness outages during an admitted worker's operation produced RED, **zero effects**, actual observed exit and independent PID absence. Hung revocation storage still allowed actual worker termination and returned `sharedQuarantinePersisted: false`; the supervisor stayed unhealthy.
- Worker crashes, operation timeouts, stale/expired leases, token substitution and restarts deny reuse. Simulated signal success with an actually live worker yielded **unconfirmed shutdown**, denied further dispatch and prevented a second supervisor launching the job. The harness subsequently cleaned only its known disposable PID.
- A restored journal with retained witness, or a rolled-back witness with retained journal, is rejected. Missing initialization is never recreated on client open. Evidence tampering preserves a blocking lock.
- **Characterization, not protection:** coherent rollback of BOTH directories to their earlier matching snapshot allows a claim to be acquired again. This passing diagnostic proves an unsupported security property. It must never be counted as production recovery PASS.
- Explicit fresh replacement material (new approved plan version, approval, contract, agent and job) can acquire in an otherwise healthy store while the complete old evidence prefix remains unchanged. No replacement is automatic.

Source and final CI evidence are linked in the final section of this report and PR #52. A passing test total includes the explicit unsupported-rollback characterization and the older local-only characterization; it does not establish production readiness.

## Uncertainty, recovery and reapproval procedure

1. **Freeze admission at the host boundary.** Treat ACQUIRED without a confirmed launch, EXECUTING without final evidence, expired grants, lost acknowledgments, crash locks and STOP_UNVERIFIED as potentially executed. Never infer safe retry from RED, an absent response, lease expiry or missing acknowledgment.
2. Preserve both directories, local supervisor journals, public verification pins, signed plan/approval/contract material and process evidence as read-only copies. Retain the store ID and external epoch/backup provenance. Do not delete claim files, clear the writer lock, reset the journal or initialize over missing evidence merely to regain service.
3. Independently establish worker/descendant termination and reconcile real effects/receipts. An unavailable host or unconfirmed shutdown remains quarantined. Previously completed effects cannot be undone by revocation. This prototype supplies no general orphan reconciliation or recovery repair tool.
4. For healthy-store manual replacement, obtain a fresh owner-approved plan version with explicit reconciliation/evidence requirements, then issue new approval/contract/agent/job identities and bounded scope. The earlier identities remain burned. The existing dependency-evidence gate remains unchanged. The test demonstrates the authorization/claim part, not independent real-world effect reconciliation.
5. A crashed or restored coordinator stays offline pending independently reviewed reconciliation. Restoring it into active service requires an externally protected monotonic epoch/high-water authority, shared consensus/fencing and a reviewed repair/import protocol retaining all burned identities. **Those controls are not implemented here.** Merely choosing a new directory/store ID, clearing a lock or restoring both copies is not an authorized recovery procedure. Until those controls exist, do not resume work from such a restore.

## Production dependencies and limits

- **High — coherent rollback / divergent store generations:** both-copy rollback, identical store IDs on independent directories, privileged rewriting or misconfigured common paths defeat global once-only enforcement. Host epoch custody and mandatory shared configuration are prerequisites, not properties supplied by these local files.
- **High — actual distributed service:** no network protocol, consensus, partition testing, authenticated service transport, external monotonic fencing or transactional production backend exists. Atomic `mkdir`, append/fsync semantics were tested only on this local filesystem; NFS/object storage and cross-host durability are unverified. No production database/migration is proposed.
- **Availability:** contention denies immediately, filesystem errors leave a global lock, and claims/identities are never reclaimed. Full-chain inspection is deliberately bounded (10,000 events / 8 MiB readable file) and can fail closed earlier under the 500 ms budget. Capacity planning, memory/space bounds over long-lived workloads, fair scheduling and reviewed compaction/recovery remain work. No throughput/SLA claim is made.
- **Trusted host/evidence:** host custody of configuration, pins, clocks, supervisor process and filesystem is assumed. Local fsync/hash chains are not independent immutable external evidence. Timeout is not cancellation of the underlying syscall. A privileged host can bypass an optional prototype constructor or rewrite both copies.
- **Existing gates retained:** fixed synthetic workers only; general OS/filesystem/process-tree isolation, host/owner enrollment and key custody, actual provider authorization/quota, live cost metering and safe orphan recovery remain AMBER from #51. The fixture commit in signed contracts is the existing pinned synthetic baseline, not binary attestation of this branch. Stopping one observed PID does not prove arbitrary descendant cleanup after a sandbox escape.
- Shared exclusion is **at-most-one acquisition under intact common state**, not exactly-once useful work. A winner may crash before work; a completed effect may lose its acknowledgment. No automatic retry, takeover or agent replacement is safe or implemented.

Before production, require independent review of the transaction and supervisor seams, reproduction of the process races/faults, a selected linearizable service with externally retained epochs and fencing, restore/partition drills, mandatory deployment mediation and externally durable evidence. Do not connect live agents on the strength of unit or CI success.

Rollback: revert this branch's source commit and report on this new development branch only; do not reset or alter PRs #47–#51. Do not delete retained claim evidence as part of rollback, and never substitute local-only mode for a failed shared production gate. No production state was changed by this mission.

## CI evidence

Source CI [Verify OSIRIS run 40798171642](https://github.com/sophiasummers971-del/osiris-web/actions/runs/40798171642), source `a121bd81d84b76dc8912625a533f8734702a1725`, **completed / success**. Retrieved job `123199589594` logs independently confirm 283 Rule Zero tests, 194 repository tests, full verification and the cross-process diagnostic: one winner, one spawned worker, one effect, PID `2527`, observed exit and acknowledged shared quarantine. The unsupported coherent-rollback characterization is visible in the same logs.

PRs #47–#51 were rechecked after source CI: exact heads, bases, draft/open states, titles and descriptions remained unchanged. PR #52 remains draft. The report's containing revision and its final Actions run are identified in PR #52 and the delivery message.
