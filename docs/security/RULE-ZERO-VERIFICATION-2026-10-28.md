# Rule Zero independent verification — 28 October 2026

## 1. Executive verdict

**INCOMPLETE / AMBER after remediation. Baseline: FAIL / RED. Production use remains blocked.**

Nine reproducible weaknesses were found in the original prototype. One permitted a caller to change the execution target after probing and during approval; another allowed two concurrent launches using the same approval. The scoped fixes and 78 additional regression tests now pass: **112/112 Rule Zero tests and 194/194 repository tests**, with full local verification successful.

No unauthorized launch was observed through the repaired launcher's job-input interface in the attempted cases, assuming its documented trusted-host boundary. This is not proof of a complete security protocol. Independently authenticated provider/owner services, protected key custody, distributed replay persistence, mandatory runtime mediation, and external review remain unverified or absent. AMBER follows the mission's rule for passing tests with substantial integration and independent-review evidence missing; it is not production permission.

## 2. Exact source and environment

- Repository: `sophiasummers971-del/osiris-web`.
- Development branch: `feature/rule-zero-preflight-prototype`; [draft PR #47](https://github.com/sophiasummers971-del/osiris-web/pull/47).
- Work item: [S-67](https://linear.app/s-jade/issue/S-67).
- Baseline tested: `743c9ce987facf2b7f41c07cadf6490c08fdf834`.
- Repaired source and regression tests, tested as a clean committed checkout: **`1c3bff0924be08b45395f3d5048c092a4e9234f5`**; tree `4134a007a9b6c351e9fc852a26e779833fafacd6`.
- This report is a subsequent documentation-only commit. Its containing commit identifies the final report revision; it does not change the tested runtime source.
- Isolated checkout: `/workspace/scratch/595a233de0b6/osiris-rule-zero`; Linux x64; Node `v24.22.1`, within repository range `>=22 <25`.
- Repository-pinned pnpm `10.34.5` through Corepack; installed pnpm binary also reports `10.34.5`. Global pnpm `11.25.0` was not used for verification.
- Prettier `3.6.2`, Vitest `4.1.11`, esbuild `0.25.10`; lockfile unchanged.

## 3. Preflight and access limitations

The earlier `PREFLIGHT_BLOCKED` evidence was retained. Resumption did not touch either pre-existing checkout, including the dirty worktree. A new clone was made with:

```sh
git clone --no-checkout --single-branch --branch feature/rule-zero-preflight-prototype https://github.com/sophiasummers971-del/osiris-web.git osiris-rule-zero
git checkout feature/rule-zero-preflight-prototype
git remote get-url origin
git branch --show-current
git rev-parse HEAD
git status --short
corepack pnpm --version
corepack pnpm install --frozen-lockfile --ignore-scripts
```

Origin matched the requested repository; branch matched; SHA matched the baseline; status output was empty before source edits. Installation completed successfully, adding 716 packages, using pnpm `10.34.5`; dependency lifecycle scripts were suppressed. Installed binaries and subsequent complete builds were verified successfully. No `AGENTS.md` was found in the checkout or the checked workspace ancestors.

**PREFLIGHT_PASS for isolated synthetic testing was recorded at 2026-10-28 23:12:44 UTC**, under the user's revised telemetry policy:

| Required check                            | Evidence and limitation                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported authenticated repository GET    | Connected GitHub `GET https://api.github.com/repos/sophiasummers971-del/osiris-web` succeeded; returned the expected repository and authenticated read/push permissions. The account identity had already been verified in the retained preflight evidence.                                                                                                 |
| Actual authorization failures             | No actual repository HTTP 401, 403 or 429 was observed in this resumption. Synthetic responses below are not observations about the account.                                                                                                                                                                                                                |
| Authenticated quota                       | **QUOTA_UNVERIFIED / UNSUPPORTED_TELEMETRY**. The earlier connector restriction was retained; `/rate_limit` was not retried in this resumption. No authenticated quota value is claimed. The earlier anonymous value is not accepted as authenticated evidence.                                                                                             |
| GitHub status                             | Prior independently confirmed official operational status retained, as instructed.                                                                                                                                                                                                                                                                          |
| Cloudflare components                     | Official `https://www.cloudflarestatus.com/api/v2/summary.json`, HTTP 200, response Date and local observation **2026-10-28 23:09:53 UTC**. API, Dashboard, Workers, Workers AI, Workers Builds, Workers Assets, Hyperdrive, R2, Workers KV and Access reported operational. Most component updates were 14:30:39 UTC that day; R2 updated at 21:12:24 UTC. |
| Stale Cloudflare aggregate                | Page-level `updated_at` remained 27 August. The old aggregate did not establish a current global outage; component evidence has same-day timestamps. This is public provider telemetry, not tenant-specific health or authorization proof.                                                                                                                  |
| Isolation                                 | New checkout, temporary synthetic fixtures, no local production environment files imported, no deployment/server startup, no database connection or migration application. Repository static configuration checks only read files.                                                                                                                          |
| Credential and personal-data requirements | No production credentials, live signing keys, personal records, owner tokens, infrastructure privileges or database access were needed. Ephemeral keys were generated in memory; no key material appears in this report.                                                                                                                                    |

Verification subprocesses received only `PATH`, `HOME`, `CI=1`, `NO_COLOR=1` and a local network-denial preload through `NODE_OPTIONS`. The preload replaced global fetch, `net.Socket.prototype.connect`, and `tls.connect` with throwing functions. Tests supplied synthetic fetch implementations. This is a test harness precaution, not a production sandbox or defense against arbitrary malicious code. Public source/status retrieval and dependency installation occurred separately; credential-bearing environment variables were not passed to tests.

## 4. Baseline verification and confirmed remediations

The existing CI failure was investigated first: [Verify OSIRIS run 40783876281](https://github.com/sophiasummers971-del/osiris-web/actions/runs/40783876281), baseline SHA above. Job `123152084194` passed Rule Zero tests and 194 repository tests, then failed `pnpm verify` at Prettier on eight files: attestation, launcher, preflight and trusted-probes, each with its test file. Local verification independently reproduced exactly that failure. Builds were not reached in the baseline full-suite run.

| Finding                                         | Reproduced baseline outcome                                                                                                    | Scoped repair and regression evidence                                                                                                                                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RZ-01: stale observations refreshed by launcher | One-hour-old probe launched because launcher replaced `checkedAt`.                                                             | Preserve probe observation time; stale/missing/future timestamps block before launch.                                                                                                                                                                                                      |
| RZ-02: wrong source commit hidden               | Probe for a different commit launched because launcher overwrote the commit.                                                   | Require probe commit, job ID and target to exactly match the immutable request.                                                                                                                                                                                                            |
| RZ-03: mutable execution context                | Caller changed target during approval; runner received `other/target` and returned LAUNCHED.                                   | Snapshot primitive fields before the first await, freeze context, use that same context through all gates. Mutation test now executes only the original approved job.                                                                                                                      |
| RZ-04: approval/job reuse                       | Two concurrent requests both launched, despite a real atomic file nonce store. Each request minted a different evidence nonce. | Require a verified job-bound approval receipt; atomically consume globally scoped approval ID and job ID claims in addition to the evidence nonce. Same-job, cross-job and concurrent-instance tests permit only one launch.                                                               |
| RZ-05: expiry while waiting for approval        | Advancing clock by two hours during approval still allowed launch.                                                             | Recheck freshness, credential expiry and approval expiry after approval and after replay persistence, immediately before invoking runner.                                                                                                                                                  |
| RZ-06: mismatched execution receipt             | Wrong-job receipt still reported GREEN.                                                                                        | Require receipt job ID, target and commit, plus nonempty run ID. Missing/mismatched receipt or runner exception is RED and does not permit automatic retry.                                                                                                                                |
| RZ-07: missing replay directory erased history  | Consume returned true, directory was deleted, same nonce returned true again after automatic recreation.                       | Never create a missing replay store during consumption. Require pre-provisioned private owner-only directory, reject final symlinks, check directory identity within a store instance, sync claim and directory entry. Missing, deleted, unsafe-permission and symlink stores fail closed. |
| RZ-08: invalid clock bypassed freshness/expiry  | `now=NaN` with old/expired evidence returned GREEN.                                                                            | Finite-clock validation in evaluator, attestation and launcher; thrown clock failures return RED.                                                                                                                                                                                          |
| RZ-09: expiry exemption                         | `credentialExpiry: "not-applicable"` returned GREEN for an otherwise authenticated job.                                        | Authenticated jobs require a parseable future expiry; no sentinel exemption.                                                                                                                                                                                                               |

Formatting was repaired only in the Rule Zero files. No package, lockfile, application route, production configuration, database or credential changes were made. Approval and runner receipt contracts were intentionally tightened; old boolean-only approval adapters and run-ID-only receipts now block and must be updated before staging integration.

## 5. Threat model and attempted bypasses

An adversarial job controls its request fields and may submit malformed contexts, extra key/probe/approval fields, mutate its original object, replay requests, and race requests. Network/provider failures, malformed responses, stale observations, storage failure and runner failure are also modeled. Test fixtures use generated Ed25519 keys, fabricated identities and temporary directories; no real provider revocation or live owner authorization was exercised.

The trusted computing base remains the process constructing the launcher: its signing and pinned public keys, clock, independently authenticated probe, approval verifier, durable claim store and runner. A job cannot replace those via extra request fields in the tested interface. Replacing the pinned key in host configuration causes legitimate signatures to fail; allowing an attacker to replace both host key and signer is outside this interface and is not prevented by this library.

Attempted cases include missing/expired/revoked/unknown credentials; wrong account/tenant or insufficient permissions; synthetic HTTP 401/403/429/503; outage, thrown request, malformed JSON and actual four-second synthetic timeout; forged/tampered/noncanonical signatures, wrong Ed25519 key and RSA key; wrong job/target/commit, stale evidence and concurrent nonce replay; missing/throwing/false/nonboolean claim-store responses; forged boolean, absent, denied, expired and cross-job/target/commit approvals; probe/signer/runner failure; invalid clock; traversal/noncanonical targets; mismatched receipts; caller dependency injection; concurrent approval/job reuse; and filesystem claims from four separate Node processes.

The diagnostic provider adapter never grants execution. Even a healthy synthetic account remains RED without independently established expiry, baseline, quota and approval. The mission's scoped quota exception does not change the security engine: UNKNOWN quota remains RED in launcher evidence.

## 6. Positive and negative execution evidence

At the repaired committed source:

- `authorized synthetic job returns a bound receipt once`: matching signed observations, future credential expiry, independently supplied synthetic approval receipt and real file-backed claims produced exactly `{ light: "GREEN", decision: "LAUNCHED", runId: "synthetic_run" }`. A repeat request was RED; runner count stayed one.
- `concurrent launcher instances cannot reuse an approval`: two instances sharing persistence produced one GREEN and one RED, with exactly one runner call.
- `filesystem replay claims are atomic across separate Node processes`: four child processes claimed the same nonce; exactly one returned true.
- Pre-launch denial tests assert RED **and zero runner calls**. Original target mutation now preserves the original approved target rather than launching the attacker's target.
- Runner failure/missing receipt tests assert RED and one attempted runner invocation, followed by no retry. **A receipt is checked after invoking the runner; RED cannot undo side effects already performed by that runner.** These tests do not claim zero execution for post-launch receipt failures.

Baseline failures are retained reproducibly in `scripts/rule-zero/reproduce-baseline.mjs`. It extracts the immutable baseline Git objects into a temporary tree, runs synthetic attacks and deletes that tree. Run from a clone containing the baseline commit:

```sh
node scripts/rule-zero/reproduce-baseline.mjs
node --test scripts/rule-zero/*.test.mjs
corepack pnpm exec prettier --check 'scripts/rule-zero/**/*.{mjs,js,ts}'
corepack pnpm verify
```

The reproduction command exits zero when the diagnostic script runs; its emitted baseline LAUNCHED/GREEN results are **evidence of failure**, not a successful security verdict. Regression tests assert the repaired behavior independently.

## 7. Commands, timestamps and actual outcomes

Times below are UTC on 28 October 2026. Node test arguments were passed as explicit filename lists, equivalent to the displayed shell wildcard after expansion. The exact verification subprocess argument lists and exit codes follow. Baseline helper scripts in `/tmp` were subsequently consolidated into the committed reproduction script above.

| Start / end UTC   | Exact subprocess command                                                                                                                                                                                                                              | Exit / observation |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| 23:12:51–23:12:51 | `node /tmp/osiris-rule-zero-evidence/baseline-attacks.mjs`                                                                                                                                                                                            | 0                  |
| 23:12:51–23:12:51 | `node --test scripts/rule-zero/attestation.test.mjs scripts/rule-zero/launcher.test.mjs scripts/rule-zero/nonce-store.test.mjs scripts/rule-zero/preflight.test.mjs scripts/rule-zero/trusted-probes.test.mjs`                                        | 0                  |
| 23:12:51–23:12:52 | `corepack pnpm exec prettier --check 'scripts/rule-zero/**/*.{mjs,js,ts}'`                                                                                                                                                                            | 1                  |
| 23:12:51–23:13:05 | `corepack pnpm verify`                                                                                                                                                                                                                                | 1                  |
| 23:14:34–23:14:38 | `node --test scripts/rule-zero/adversarial.test.mjs scripts/rule-zero/attestation.test.mjs scripts/rule-zero/launcher.test.mjs scripts/rule-zero/nonce-store.test.mjs scripts/rule-zero/preflight.test.mjs scripts/rule-zero/trusted-probes.test.mjs` | 0                  |
| 23:14:44–23:14:44 | `corepack pnpm exec prettier --write 'scripts/rule-zero/**/*.{mjs,js,ts}'`                                                                                                                                                                            | 0                  |
| 23:15:11–23:15:11 | `node /tmp/osiris-rule-zero-evidence/store-reset.mjs`                                                                                                                                                                                                 | 0                  |
| 23:15:29–23:15:29 | `corepack pnpm exec prettier --write 'scripts/rule-zero/**/*.{mjs,js,ts}'`                                                                                                                                                                            | 0                  |
| 23:15:49–23:15:49 | `node /tmp/osiris-rule-zero-evidence/evaluator-bypasses.mjs`                                                                                                                                                                                          | 0                  |
| 23:15:49–23:15:54 | `node --test scripts/rule-zero/adversarial.test.mjs scripts/rule-zero/attestation.test.mjs scripts/rule-zero/launcher.test.mjs scripts/rule-zero/nonce-store.test.mjs scripts/rule-zero/preflight.test.mjs scripts/rule-zero/trusted-probes.test.mjs` | 0                  |
| 23:15:49–23:16:02 | `corepack pnpm verify`                                                                                                                                                                                                                                | 0                  |
| 23:16:16–23:16:16 | `node scripts/rule-zero/reproduce-baseline.mjs`                                                                                                                                                                                                       | 0                  |
| 23:16:16–23:16:17 | `corepack pnpm exec prettier --write scripts/rule-zero/reproduce-baseline.mjs`                                                                                                                                                                        | 0                  |
| 23:16:35–23:16:36 | `corepack pnpm exec prettier --check 'scripts/rule-zero/**/*.{mjs,js,ts}'`                                                                                                                                                                            | 0                  |
| 23:17:13–23:17:18 | `node --test scripts/rule-zero/adversarial.test.mjs scripts/rule-zero/attestation.test.mjs scripts/rule-zero/launcher.test.mjs scripts/rule-zero/nonce-store.test.mjs scripts/rule-zero/preflight.test.mjs scripts/rule-zero/trusted-probes.test.mjs` | 0                  |
| 23:17:15–23:17:28 | `corepack pnpm verify`                                                                                                                                                                                                                                | 0                  |

The committed-source Rule Zero run at 23:17:13–23:17:18 passed **112 tests, zero failures/skips/cancellations**. The committed-source `pnpm verify` at 23:17:15–23:17:28 passed all stages: boundary lint (29 Worker modules), static Cloudflare configuration, nine migration file checksums/order, TypeScript, 194 tests in 34 files, repository formatting, Vite/server build and Worker build. These are static checks and synthetic tests; no schema was applied and no remote configuration was verified. The Worker bundle size warning is not a deployment result.

## 8. CI and exact commits

- Baseline: [`743c9ce987facf2b7f41c07cadf6490c08fdf834`](https://github.com/sophiasummers971-del/osiris-web/commit/743c9ce987facf2b7f41c07cadf6490c08fdf834), [run 40783876281](https://github.com/sophiasummers971-del/osiris-web/actions/runs/40783876281): failure at formatting, confirmed from job steps and logs.
- Repaired source: [`1c3bff0924be08b45395f3d5048c092a4e9234f5`](https://github.com/sophiasummers971-del/osiris-web/commit/1c3bff0924be08b45395f3d5048c092a4e9234f5), [run 40786243239](https://github.com/sophiasummers971-del/osiris-web/actions/runs/40786243239): CI status recorded below before committing this report.
- Final documentation-only revision and its run are identified by the containing commit and the final delivery message; they are not inferred from local test results.

At **2026-10-28 23:19:30 UTC**, GitHub reported repaired-source run `40786243239` **completed / success**. This is independently retrieved CI status, separate from local test outcomes. Job `123160032974` logs independently confirm 112 Rule Zero tests, 194 repository tests and successful formatting. Report-only checks subsequently ran `corepack pnpm exec prettier --write docs/security/RULE-ZERO-VERIFICATION-2026-10-28.md` (23:19:51, exit 0) and `corepack pnpm exec prettier --check .` (23:19:51–23:19:54, exit 0).

## 9. Residual limitations and production gates

1. **Complete mediation is absent.** Source search found Rule Zero imports only within `scripts/rule-zero`; Worker/server routes do not invoke this launcher. CI runs the Node tests separately, but `pnpm verify` itself excludes the standalone `.mjs` suite. Direct access to a runner, shell or host constructor is not constrained by this PR. A deployed supervisor must own all capabilities and deny alternate execution paths.
2. **Raw diagnostic GREEN is forgeable by design.** Calling `evaluatePreflight` directly with fabricated PASS fields and approval true can still yield GREEN. It validates data; it does not authenticate its caller. It must never become the execution boundary. The scoped successful regression verdict applies to the launcher job-input interface, not arbitrary imports or malicious host code.
3. **Host truth and owner authentication remain unproven.** The host can sign arbitrary assertions or return fabricated typed approval receipts. The new receipt shape binds context and reuse; it is not a cryptographic owner identity proof. A real authenticated, tamper-resistant approval authority and target-specific tenant/permission probe must be implemented and independently reviewed. The existing provider diagnostic checks account identity, not comprehensive tenant/resource permissions, and intentionally cannot authorize execution.
4. **Replay persistence is staging-only.** Tests cover one private local filesystem and concurrent processes, not multiple hosts, failover, rollback restoration, filesystem power loss or malicious administrators. Restoring/reinitializing a store or changing host-controlled paths can restore replay opportunities. Claim retention must cover identifier lifetimes; do not prune job/approval claims on a five-minute evidence timer. Production needs durable atomic global claims and tested recovery semantics. A failed runner burns its job and approval; recovery requires a newly approved job identity.
5. **Cryptographic and operational custody are not established.** Generated fixture keys prove signature behavior, not host key pinning, issuance authenticity, rotation, trusted clock synchronization or revocation propagation. External state can change after probing; integration must define acceptable evidence age and revalidation at the actual capability boundary.
6. **Runner authority and receipts are trusted.** This module does not sandbox execution or independently attest what the runner actually executed. A context-matching object from a dishonest runner is not proof. Admission and action side effects need durable audit and externally verifiable receipts. A hanging injected host callback can leave a request pending; denial of service and cancellation policy are not fully implemented.
7. **Telemetry limits remain explicit.** Authenticated GitHub quota is unknown. No secret provisioning, live owner approval, tenant outage test, production drift check or deployment was performed. Passing unit tests cannot discharge these gates.

Thus the universal claim “an unauthorized job can never get GREEN or execute” is **not established**. The initial concrete launcher bypasses are repaired, but broader runtime enforcement and independent authentication evidence remain required.

## 10. Rollback and next review

No deployment rollback is needed: this mission did not deploy or alter live state. To undo this development work, create a normal revert commit for the repaired source commit and, separately, this report commit on the development branch; do not force-reset shared history or touch other worktrees. Reverting the source intentionally restores the documented vulnerabilities, so keep the PR draft and any runtime integration disabled. No credentials or database changes need reversal.

Before any production proposal: an independent reviewer must rerun the retained reproduction against the baseline and the regressions against the repaired SHA, audit the source diff and every real host dependency, verify authenticated owner/tenant authorization and protected keys, exercise durable distributed replay and recovery, and demonstrate that no alternate runner path can bypass the gate. A separate non-production integration review must verify actual execution receipts and failure behavior. Explicit owner authorization for any later deployment remains necessary. This mission grants none.
