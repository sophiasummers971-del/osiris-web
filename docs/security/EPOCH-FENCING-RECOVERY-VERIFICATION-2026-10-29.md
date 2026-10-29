# Epoch fencing and recovery verification

**Verdict: configured synthetic boundary PASS; production INCOMPLETE / AMBER.** With the external authority intact and epoch mode configured, coherent rollback of the claim journal and its witness cannot authorize a consumed job. Recovery is an explicit signed transition; it never erases consumed identities. This is not a production distributed authority or permission to deploy.

## Exact source and preflight

Repository `sophiasummers971-del/osiris-web`; separate draft [PR #53](https://github.com/sophiasummers971-del/osiris-web/pull/53), branch `feature/rule-zero-epoch-fencing`, stacked on #52.

- Requested base: **`36310f6fb8e965ec2e006877833508a12f4fb464`**, tree `9228439be0543da2ddcfbb879d14a62c0a0aea38`.
- Tested source: **`867860f6f34f07bbdaa2da4b0ec93a5aa1837676`**, tree `0265d7758ff6a38347f55442658941987fd3d2bb`. The staged local source was compared with this remote commit and reconciled to a clean checkout. This report is a later documentation-only revision, identified by its containing commit and final CI in PR #53.
- **PREFLIGHT_PASS for isolated development testing:** new checkout, exact base/branch/origin and empty initial working tree verified. Origin is `https://github.com/sophiasummers971-del/osiris-web.git`; existing worktrees were untouched. Authenticated repository-scoped PR GETs succeeded; account identity and repository pull/push permission were confirmed. No actual repository 401/403/429 occurred.
- Quota remains **QUOTA_UNVERIFIED / UNSUPPORTED_TELEMETRY**. The unsupported quota endpoint was not retried; no quota number is claimed.
- At approximately 01:15 UTC on 29 October, opened official [GitHub status](https://www.githubstatus.com/) and [Cloudflare service status](https://www.cloudflarestatus.com/services) pages reported operational service status. No Cloudflare account or live provider call is needed by this prototype.
- Linux x86_64, Node `v24.22.1`, Python `3.12.14`, pinned Corepack pnpm `10.34.5`. `corepack pnpm install --frozen-lockfile --ignore-scripts` passed. Test subprocesses used a credential-stripped environment, outbound-network denial, generated keys and disposable private storage/workers. No production credentials, personal data, migrations, database or infrastructure changes, live agents, merge or deployment occurred. Repository migration-file validation is read-only.

The same assistant authored earlier prototypes. Fresh adversarial reproduction and direct CI-log inspection do not constitute organizationally independent human review.

## Authority model and enforcement

The authority has its own directory, signing key, signed append-only records and checkpoints, all outside the claim journal/witness snapshot. These are distinct logical persistence domains on the same local filesystem, not a physically protected remote service. Shared append/fsync/locking code was extracted into `synthetic-ledger.mjs`; the existing unfenced claim format and tests were retained.

| Authority fact                 | Enforcement                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Current epoch                  | Starts at 1; only a verified recovery transition can advance exactly to the next integer. Epoch/fencing counters do not derive from wall-clock time.                                                               |
| Current supervisor fence       | Issued only for a preconfigured public key after signature verification. A newer fence for the same supervisor ID invalidates its predecessor. Registered IDs with different keys cannot impersonate one another.  |
| Expected claim generation/head | Store ID plus exact journal sequence/hash must match the authority before registration, reservation, advancement or effects. A matching pair of old claim files is insufficient.                                   |
| Consumed tenant identities     | Job, contract, agent and exact-plan step identities, plan/version bindings and approval-body bindings persist externally across all approved store generations. They are never reset on expiry, crash or recovery. |
| Effect ownership               | A current signed supervisor request, current epoch/fence, active claim and exact journal head are required. EFFECT_INTENT persists before the protected callback; acknowledgment is recorded separately afterward. |

The client uses a fresh nonce and verifies an authority-signed response bound to its request/action and authority identity. The authority independently verifies Plan Y/contract signatures, tenant/owner/key bindings and lifetime when reserving a claim. It advances its expected head **before** the claim journal append: an interrupted two-store write becomes a safe mismatch requiring reconciliation, not an opportunity for retry.

At admission the supervisor must acquire the external reservation and persist the start transition before creating a process. At the adapter boundary, shared-claim and authority locks span the **actual fixed synthetic read/hash effect**, including its final local lease/scope guard. Recovery and fence replacement cannot interleave between a successful authority check and that effect. A delayed resource preparation rechecks the fence afterward. This is stronger than validating a cached token then releasing serialization before acting.

Existing owner approval, Rule Zero admission, resource/tool/zone checks, request expiry, worker isolation and observed process-stop requirements remain active. No audit deadline or authorization restriction was relaxed. Shared-call timeout remains 500 ms; local revocation is immediate and authority persistence cannot prevent signal delivery. A timed-out filesystem operation may finish later; late callbacks still check local health/revocation before effects.

Compatibility modes remain explicit: `LOCAL_ONLY`, `SHARED_SYNTHETIC`, and `EPOCH_FENCED_SYNTHETIC`. A malformed configured authority never falls back. Future host integration must mandate epoch mode; constructing an older unfenced host is not made impossible by this library change.

## Adversarial findings and evidence

**Baseline gap, high in a restored multi-supervisor setting:** in a second untouched checkout at the exact base, the existing coherent-rollback characterization reacquired a job after restoring both claim directories. At 01:30:45 UTC, the following command exited 0 because it intentionally confirms the missing protection:

```sh
node --test --test-name-pattern='restored both snapshot' scripts/rule-zero/shared-claims.test.mjs
```

Its diagnostic states that coherent rollback is undetectable without external epoch custody. That characterization remains valid for the explicitly unfenced compatibility mode; it is not a production PASS.

**Prototype finding F-01, high — false storage independence through symlink aliases:** the first epoch implementation compared lexical paths only. Moving the authority under the claim directory and addressing it through an outside-looking symlink still issued a fence. The focused `symlink aliases` test failed at 01:27:33 with “Missing expected rejection.” This was a demonstrated defect in the new prototype, not attributed to #52. The repair resolves canonical paths, checks actual ancestry and pins the canonical authority root. Each request rechecks that root against path substitution. Both the initial-alias and post-registration substitution regressions now deny before effects.

Retained post-repair evidence:

- **Two independent supervisor Node processes**, independently generated agent keys, common authority/store/job: one winning start, one spawned worker, one adapter effect. Losing requests cannot dispatch. The harness checks actual observed exit and PID absence. The existing six-client shared-claim race also still passes.
- Coherent rollback blocks a new fence. Rolling back while a worker is running returns RED before any effect and actually stops that worker. A copied divergent claim store and a superseded fence also fail closed.
- An explicitly approved recovery to restored claim bytes succeeds only at the next epoch. Fresh approved work can then execute; old consumed identities still cannot. Separate tests isolate old job, contract and agent reuse individually.
- Wrong owner/reconciler signatures, changed reconciliation hash, wrong tenant/target/epoch, expired approval, stale authority head and unconfirmed termination reject recovery. Replay of a previously accepted recovery receipt is rejected.
- Forward/backward wall-clock changes do not revive a fenced epoch. These tests establish counter/fence behavior, not a trustworthy production time source or general approval-clock security.
- Worker crashes/timeouts retain consumption. Simulated signal success with a still-live process yields unconfirmed shutdown; a second worker cannot acquire the job, and reconciliation declaring workers unstopped cannot advance recovery. Test-only cleanup terminates the known disposable PID afterward.
- Lost reservation acknowledgment yields RED with **zero workers**, an externally retained reservation and no successful local claim append. No automatic repair/adoption follows.
- Lost effect acknowledgment yields RED after **one actual synthetic effect**; the intent remains external, the worker is stopped, and another attempt cannot execute. RED is not evidence that nothing happened.
- Authority loss/hang, corrupt records, wrong authority key, unregistered supervisor key and late callbacks fail closed. A hung authority still permits independently observed worker termination.
- A deterministic held-effect test attempts recovery while the real adapter read owns the authority lock: recovery is denied by contention, the epoch remains unchanged, and the authorized effect completes. No check/effect race is assumed away.

## Verification commands and actual outcomes

All times below are UTC on 29 October 2026. The wrapper retained command arrays, start/end timestamps, complete output and exit codes. Fixtures create/clean their own temporary directories and synthetic key material.

| Command/run                                                                      | Actual outcome                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base `node --test scripts/rule-zero/*.test.mjs`, 01:17:54–01:18:03               | 283 passed; exit 0.                                                                                                                                                                                                |
| Existing shared persistence regression suite after extraction, 01:21:07–01:21:16 | 37 passed; exit 0.                                                                                                                                                                                                 |
| First epoch harness, 01:23:06–01:23:10                                           | 20 passed / 1 failed; exit 1. Receipt-byte rebinding correctly triggered an earlier denial than the fixture expected. The fixture was corrected to preserve the original approval bytes; no verifier was weakened. |
| Expanded epoch harness, 01:25:35–01:25:45                                        | 37 passed; exit 0.                                                                                                                                                                                                 |
| Symlink regression before repair, 01:27:33                                       | 1 failed; exit 1, reproducing F-01.                                                                                                                                                                                |
| Focused epoch harness after repair, 01:28:01–01:28:11                            | 39 passed; exit 0. Two further path/key cases were then added.                                                                                                                                                     |
| Final `node --test scripts/rule-zero/*.test.mjs`, 01:29:27–01:29:39              | **324 passed**, including **41 epoch cases**; zero failures/skips/cancellations, exit 0.                                                                                                                           |
| Final `corepack pnpm verify`, 01:30:18–01:30:39                                  | **Passed**, exit 0: boundary/configuration/migration-file checks, TypeScript, **194 tests in 34 files**, formatting and client/server/Worker builds.                                                               |
| Immutable-base rollback reproduction, 01:30:45                                   | One diagnostic characterization passed; exit 0, confirming the old unfenced gap.                                                                                                                                   |
| `git diff --check`                                                               | Passed.                                                                                                                                                                                                            |

Reproduce the repaired boundary from the source revision:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
node --test scripts/rule-zero/epoch-fencing.test.mjs
node --test scripts/rule-zero/*.test.mjs
corepack pnpm verify
git diff --check
```

The supervisor tests require the existing Linux x86_64/Python/Node isolation profile. Parent-side fault hooks intercept real filesystem timing, persistence acknowledgment or process signaling; worker IPC cannot install them. Full-suite totals include retained unfenced characterization tests and therefore do not imply that every compatibility mode enforces epochs.

## Recovery protocol and evidence custody

1. Freeze admissions and preserve the claim journal, witness, external authority records/checkpoints, verification pins, signed approvals/contracts and process/effect receipts. Do not clear locks, delete claims, rewind the authority or infer safe retry from a missing response.
2. An independent reconciler must establish termination and effect outcomes, then sign a receipt identifying the current authority head, from/to epoch, exact target store/head, termination/effect evidence hashes and quarantine of uncertain work. Unconfirmed shutdown remains blocking. One synthetic test binds a real observed-exit/PID-absence result into this signed receipt.
3. The owner supplies a fresh, separately signed recovery approval bound to that exact reconciliation hash and target. The authority checks both signatures/lifetimes, tenant/owner/authority, exact current head, next epoch and single-use recovery ID under serialization.
4. Append RECOVERY_APPROVED without deleting historical reservations. Old fences become invalid. Recovered supervisors must obtain new fences. Previously used tasks require a newer approved plan version and fresh approval; consumed jobs/contracts/agents/steps remain burned. No automatic replacement or retry exists.
5. Resume only independently reconciled new work. A claim does not attest execution; EFFECT_INTENT does not attest completion; EFFECT_ACKNOWLEDGED is distinct from worker exit and owner/reconciler approval. Preserve all those records separately.

The prototype verifies receipt authenticity and binding. It **does not independently prove the truth of arbitrary remote reconciliation claims**. A trusted reconciler falsely signing “all stopped” is outside its protection. Real independent process/resource observation and reconciler custody must exist before production.

Interrupted authority persistence or an abandoned authority lock has no automatic repair protocol. Such failures remain offline pending separately reviewed authority recovery; the signed claim-store recovery path is not a license to reset the root authority itself.

## Remaining production gates and rollback

- **High: root-authority protection.** Its monotonicity is conditional on its separate records remaining intact. This local simulation stores its generated signing key on disk under the same host UID. Rolling back or compromising the authority itself is not prevented; signatures alone do not provide an external monotonic counter. A real protected authority, key custody, durable consensus and independent epoch retention are required.
- **High: mandatory host/resource integration.** Only fixed synthetic adapter effects are mediated. Real resources must enforce fencing at their execution boundary with equivalent serialization/transaction semantics. A cached remote check followed by an unrelated tool call would reopen the race. Untrusted code in the supervisor process or privileged filesystem modification is not isolated by this prototype.
- **Distributed operation unverified.** Tests use independent processes on one filesystem, not a network service under actual partitions, NFS/object storage, machine power loss or consensus failure. Copy-based split brain is tested only with one intact common authority. No production migrations or service configuration were added.
- **Recovery availability/capacity.** Locks are never stolen; persistence/signature failures can globally block progress. Full-chain verification has bounded file/event capacity and latency limits. Production capacity, fairness, compaction, interrupted-authority repair and secure backup restoration remain unimplemented. Timeouts do not cancel underlying syscalls.
- **Other existing gates.** Real owner/provider authorization, trusted clocks, quota verification, external immutable audit, billing and general OS/process-tree isolation remain AMBER. Existing synthetic commit comparisons are not executing-binary attestation. Observing one PID exit does not prove arbitrary descendants cannot survive a sandbox escape.

Require an independent reviewer to rerun baseline rollback, the repaired epoch suite, the alias regression and actual exit evidence; then review a real authority/actuator design and recovery/partition drills before any live integration. Do not treat CI success as production permission.

Rollback is a normal revert on this new branch only. Preserve authority and consumed-identity evidence; do not switch live work to unfenced mode or delete records to restore availability. PRs #47–#52 must remain unchanged. No production state was modified.

## CI evidence

Source CI [Verify OSIRIS run 40800969636](https://github.com/sophiasummers971-del/osiris-web/actions/runs/40800969636), source `867860f6f34f07bbdaa2da4b0ec93a5aa1837676`, **completed / success**. Retrieved job `123208721410` logs independently confirm 324 Rule Zero tests, 194 repository tests, full verification and the competing-supervisor diagnostic: two independent supervisors, one winner, one spawned worker, one effect, PID `2835`, observed exit. The valid-authority diagnostic separately records PID `2711`, epoch 1 and seven external authority events.

After source CI, PRs #47–#52 were rechecked: exact heads, bases, draft/open states, titles and descriptions were unchanged. PR #53 remains draft. The report's containing documentation revision and final Actions run are recorded in PR #53 and the delivery message.
