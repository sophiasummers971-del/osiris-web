# Trusted supervisor and agent stop enforcement — verification

**Verdict: synthetic enforcement PASS; production AMBER.** No live swarm, deployment, merge, production credentials, network privilege grants or database changes.

## Exact source and preflight

Separate draft [PR #50](https://github.com/sophiasummers971-del/osiris-web/pull/50), branch `feature/rule-zero-trusted-supervisor`, based exactly on verified PR #49 commit `da4a33ef14eebbe373568c61fd6c9ba428f25883`.

Tested source/test commit: **`b56a64ecf0da8f05509b6adf430354fd8871515b`**; tree `c7a2076cedec1de6cab3b50fa4aa7765a7ebcf8f`. The tested local files were compared against this commit and reconciled to a clean checkout. This report is a subsequent documentation-only revision, identified by its containing commit and final CI run.

Rule Zero preflight passed for isolated development: authenticated repository GET returned the expected repository and read/push permissions; a new clean checkout had the exact requested base, branch and origin. Previous worktrees were untouched. Node `v24.22.1`, pinned Corepack pnpm `10.34.5`, Python `3.12.3` at `/usr/bin/python3`; frozen-lockfile installation with lifecycle scripts suppressed passed. No dependency, lockfile, application route or existing Rule Zero source changes.

Authenticated quota remains **QUOTA_UNVERIFIED / UNSUPPORTED_TELEMETRY**; the unsupported endpoint was not retried. No actual repository 401/403/429 occurred. Fresh official status reads on 29 October: GitHub operational at 00:23:29 UTC; Cloudflare API, Dashboard, Workers, Hyperdrive and R2 operational at 00:23:33 UTC. There is no live provider dependency in this prototype.

Test subprocesses used a credential-stripped environment and network-denial preload. Disposable workers received a separate empty environment plus runtime IPC variables; they did not inherit the test preload. Their networking denial was independently exercised through actual blocked socket creation, not a mocked fetch. All keys/resources were synthetic and all workers disposable.

## Enforcement implemented

- **Single owned execution path:** the supervisor verifies the Plan Y approval and individual handover contract before using the existing Plan Y admission facade and Rule Zero launcher. It owns ephemeral agent/runner keys, replay storage, audit, child launch configuration and a fixed tool/resource registry. Agent input cannot provide a runner, broker, registry or trusted callback; unsupported fields are denied.
- **Process-bound identity:** distinct `NR-xxxxx` identities have distinct keys and PIDs. A signed readiness challenge binds the assigned identity to the child process. Operation signatures bind identity, contract, request ID and resource ID over that child's IPC channel. Unknown/forged identities, signatures and protocol messages revoke and stop the worker.
- **Adapter boundary:** the host resolves resource IDs to fixed local files, actual assigned zones and fixed charges. Permitted-looking agent declarations cannot authorize a restricted resource. The adapter independently checks tool membership in the host registry and contract, actual zone, charges, lease generation, health and expiry. It uses no-follow opens, file type/size checks and a bounded 65-byte read to enforce a 64-byte resource ceiling. Prohibited cases assert **zero underlying adapter effect invocations**; the authorization guard may run to deny them.
- **Worker restrictions:** fixed fixture entry point, no eval or supplied code; Node permissions deny outside filesystem access, process spawning, addons and inspector capabilities. Linux `no_new_privs` and a fail-closed x86_64 seccomp filter deny new sockets, parent signaling, cross-process inspection/interference and selected namespace/mount/io_uring operations. CPU, core-dump, file-size and descriptor limits plus a bounded V8 heap and wall/operation timers apply. The supervisor caps live/pending workers at two and serializes each worker's operations.
- **Observed stop:** revocation invalidates the lease/generation synchronously, blocks pending and future effects, then sends SIGTERM and escalates to SIGKILL. A successful signal call is never treated as death. The child `close` event records PID, exit code/signal and observed time. Tests establish PID liveness before stop and `ESRCH` afterward. Missing exit evidence yields `STOP_UNVERIFIED`, an unhealthy supervisor and blocked admission.
- **Audit failure is not permission:** durable journal acknowledgments have a 200 ms deadline. Signal delivery does not wait for the journal. Failed/hung persistence and actual process exit are reported separately. Global unhealthy state also blocks an already-prepared adapter effect. Late callbacks check the lease generation before effects/results.
- **No automatic replacement:** terminated identities/jobs cannot restart. The manual replacement test requires another identity, a newly approved plan version and fresh contract, while preserving the old exit evidence and journal prefix. Supervisor close preserves its evidence directory; disposable test cleanup removes fixtures only after assertions.

## Isolation evidence and limits

This local execution environment maps only UID 0 and has zero effective capabilities; `chown(..., 65534)` returned `EINVAL`. It also hides `/proc/<child-pid>` (`ENOENT`). Neither observation was labeled an application defect or bypassed with elevated privileges.

The supported local profile is explicitly **capability-less mapped UID**, not a separate OS user. Hosts capable of safely dropping UID/GID use that profile instead. Zero effective capabilities remain mandatory. The fixed bootstrap measures `/proc/self/status`, verifies denied socket creation and parent signaling, and sends the result on a dedicated pipe **closed before worker code starts**. The supervisor independently receives this bootstrap evidence, then verifies the separate agent readiness signature. Absent/failed bootstrap evidence blocks launch. Worker probes after Node startup additionally verify:

| Attempt                                     | Actual observed result                                             |
| ------------------------------------------- | ------------------------------------------------------------------ |
| Socket creation / loopback connection setup | `EPERM`; no connection established                                 |
| Outside-file read (`/etc/passwd`)           | `ERR_ACCESS_DENIED`                                                |
| Child spawn (`/bin/true`)                   | `ERR_ACCESS_DENIED`                                                |
| Signal-zero query of supervisor PID         | `EPERM`                                                            |
| Root/capability profile                     | Effective capabilities zero; no-new-privileges set; seccomp active |

These are fixture-process restrictions, not a claim that Node permissions or this partial syscall policy safely contain arbitrary malicious native code. Dedicated users/namespaces, cgroups/RSS limits, broader syscall/FD analysis, kernel-version coverage and independent sandbox review remain production gates. Unsupported platforms fail closed; no isolation tests are skipped.

## Commands and actual results

All times are UTC on **29 October 2026**. Shell wildcards expanded to the existing explicit test-file lists.

| Command / check                                                                                 | Result                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disposable preflight `prctl(no_new_privs)` + seccomp socket probe, 00:06:42                     | Installed successfully; socket syscall denied with `EPERM`.                                                                                                                                                                                                             |
| Initial supervisor smoke tests, 00:12–00:15                                                     | RED, as required: unsupported UID change, followed by unavailable child `/proc` inspection. No adapter effect occurred; spawned workers were stopped. Explicit capability-less/bootstrap-pipe profile repaired portability without disabling the required restrictions. |
| Targeted startup/isolation smoke command below, 00:16:50                                        | 2 passed: real worker execution and isolation probes.                                                                                                                                                                                                                   |
| `node --test scripts/rule-zero/trusted-supervisor.test.mjs`, 00:17:16                           | Initial 27 tests passed.                                                                                                                                                                                                                                                |
| Targeted global audit-health regression, 00:20:10                                               | Failed before repair: one prepared effect executed after another worker's revocation audit failed. Added final health check; retained regression now passes with zero effects.                                                                                          |
| Targeted hung-journal regression, 00:22:18                                                      | Failed before repair: journal prevented bounded stop completion. Added bounded acknowledgment and independent signal delivery; retained regression now passes.                                                                                                          |
| Targeted stop/audit regressions, 00:23:03                                                       | 3 passed, including falsely reported signal success yielding `STOP_UNVERIFIED`.                                                                                                                                                                                         |
| `node --test scripts/rule-zero/*.test.mjs`, 00:23:24–00:23:33                                   | **236 passed, zero failures/skips/cancellations**, including **30 supervisor tests**.                                                                                                                                                                                   |
| `corepack pnpm verify`, 00:23:24–00:23:39                                                       | Exit 0: boundary lint, static configuration, nine migration file checksums/order, TypeScript, **194 repository tests in 34 files**, formatting, client/server and Worker builds. No schema applied or remote configuration changed.                                     |
| Prettier for the three new `.mjs` files; Python `compile(...)` syntax check; `git diff --check` | Passed. Python also executed in every real worker test.                                                                                                                                                                                                                 |

The targeted startup smoke command was:

```sh
node --test --test-name-pattern='valid signed admission|kernel/Node' scripts/rule-zero/trusted-supervisor.test.mjs
```

Representative actual local test diagnostic (PID is namespace-local and ephemeral):

```json
{
  "agentId": "NR-00001",
  "pid": 104,
  "toolInvocations": 1,
  "exitCode": null,
  "signal": "SIGKILL",
  "independentlyObservedAbsent": true
}
```

Other denials cover unauthorized tools (including a tool approved in a plan but absent from the host registry), forged identities/signatures, wrong tenants/expired authority, restricted resources despite a false zone declaration, unknown paths, forged free usage, symlink/oversize resources, crashes, duplicate starts, concurrency, late callbacks, lease/operation timeouts, revocation write failure and hung journals. Prohibited operation tests assert zero effect invocations plus actual worker exit.

Signal-failure coverage is a **test-only transport fault**: the test temporarily makes `ChildProcess.kill` report success without delivering a signal. The supervisor reports `observedExit: false`, keeps the lease revoked, blocks new admission, and does not invent an exit record. Independent test cleanup then delivers a real SIGKILL and observes exit. No injectable kill callback exists in the supervisor API.

Source CI: [Verify OSIRIS run 40793926563](https://github.com/sophiasummers971-del/osiris-web/actions/runs/40793926563), exact source SHA above. **completed / success**, independently retrieved at 00:27 UTC on 29 October 2026. Job `123185623703` logs independently confirm 236 Rule Zero tests, 194 repository tests, successful verification and actual PID/exit diagnostics. Final report revision/run is linked in the draft PR and delivery message. Both the standalone Node suite and `pnpm verify` are required; the existing workflow runs both.

## Remaining production blockers

**AMBER:** real owner/tenant enrollment and key custody; mandatory capability mediation outside this local supervisor; hardened arbitrary-code isolation; process-tree/cgroup enforcement beyond the fixed no-child fixture; distributed claims/restart recovery; external append-only audit and independent timestamps; and real provider/resource/cost metering. Synthetic Rule Zero probe PASS values are explicitly simulated, not evidence of live provider authorization. Fixture jobs compare the requested commit to the pinned verified base; they do not execute that repository artifact or attest a production binary. Byte-count-derived fixture units and fixed synthetic charges are not actual model-token billing.

The supervisor handles only static synthetic programs and two tiny read-only resources. A malicious privileged host can replace code, keys or state; that threat is not solved. IPC/rate/total-memory denial-of-service hardening is incomplete. When a journal times out, an underlying filesystem operation may still finish later; the unhealthy latch remains set. Local journals are acknowledged with fsync but are not tamper-proof external evidence.

A RED operation result can be returned immediately on revocation; callers must await `stopAgent` or `waitForExit` to obtain observed termination. A stuck process may remain alive under `STOP_UNVERIFIED`; that is a blocker, never a successful stop claim. Already-completed reads and callbacks that passed their effect boundary before revocation cannot be undone. The current signaling filter may require SIGKILL escalation even for a nominally cooperative Node worker; only observed exit is authoritative.

Independent review must rerun both suites and real termination tests on the exact source commit, audit all fixed entry points/syscall rules and failure branches, and establish stronger OS/identity/audit guarantees before any production proposal. Rollback is a normal revert on this new development branch only. Nothing was deployed and no live credentials, databases or permissions need reversal. PRs #47, #48 and #49 are to remain unchanged.

After source publication, PRs #47, #48 and #49 were checked against mission-start snapshots: heads, bases, draft states, titles and descriptions were unchanged.
