# Rule Zero / Plan Y ruleset catalogue (v0.1)

**Status: DRAFT / evidence index only. Production remains AMBER.** This catalogue is a navigational control register, **not** a signed policy, deployed configuration, authority grant, or evidence that an existing application entry point is mediated. No runtime or policy changes are authorized by this document.

## Scope and ownership

- **Task X:** requested work. **Plan Y:** immutable, versioned steps including necessity, dependencies, risk, evidence and scope. An authority approves the exact plan hash/version.
- **Handover:** independently verified per-agent identity and scoped contract (`NR-xxxxx`); only the supervisor/host owns actual execution capabilities.
- **Enforcement:** local synthetic Rule Zero/supervisor tests exist; deployed HTTP, cron and database paths are not yet covered. Rules marked *implemented in synthetic scope* are not production-ready.
- **Evidence:** record actor/tenant, plan hash, contract ID, source commit, action/result, trusted timestamps, receipt, and outcome uncertainty with suitable redaction. A worker's own claim of success is not independent evidence.
- **Separation:** immutable work artifacts, snapshots/checkpoints, security claims and completion attestations are distinct objects. A snapshot never grants execution authority.

## Catalogue

| Rule ID | Rule / expected decision | Current implementation boundary | Primary source / evidence |
| --- | --- | --- | --- |
| RZ-001 | Preflight of identity, auth, provider, quota, source and expiry: UNKNOWN or FAIL blocks privileged launch | Synthetic evaluator and probes; account-level quota telemetry unsupported | `scripts/rule-zero/preflight.mjs`, `trusted-probes.mjs` |
| RZ-002 | Approval is independent, exact-job, time-bound and not caller-supplied | Signed/verified prototype; real owner enrollment pending | `launcher.mjs`, `plan-y.mjs` |
| RZ-003 | Plan Y is canonical, versioned, immutable and justified step by step; changes require new approval | Implemented in synthetic scope | `plan-y.mjs` |
| RZ-004 | Each agent has a distinct verified handover, assigned zones/tools/budget and identity key | Implemented in synthetic scope | `plan-y.mjs`, `plan-y-admission.mjs` |
| RZ-005 | Unapproved or out-of-zone actions cause DENY and contract revocation; no self-escalation | Fixed-resource synthetic adapter only | `plan-y-admission.mjs`, `trusted-supervisor.mjs` |
| RZ-006 | No direct worker credentials, runner choice, arbitrary host callback or bypass path | Synthetic supervisor entry only; deployed HTTP/cron paths **not mediated** | `trusted-supervisor.mjs`; `docs/security/p0p1-inventory/EXECUTION-GAPS.md` |
| RZ-007 | Violation, timeout and revocation stop future effects; stop is confirmed by process exit/PID absence; unknown remains blocked | Synthetic Linux worker, not arbitrary process tree | `trusted-supervisor.mjs`, `synthetic-worker-bootstrap.py` |
| RZ-008 | Admission concurrency is bounded; duplicate jobs/contracts/steps are denied | Host-local admission plus synthetic shared-claims mode | `swarm-admission.mjs`, `shared-claims.mjs` |
| RZ-009 | Shared claims and effect-intent are durable; ambiguous outcomes never automatically retry or replace agents | Synthetic shared filesystem only | `shared-claims.mjs` |
| RZ-010 | Protected epoch/fence required at actual resource effect boundary; coherent rollback denied when authority intact | Synthetic separate local authority; no hosted resource fence | `epoch-authority.mjs`, `epoch-fencing.test.mjs` |
| RZ-011 | Recovery needs independent reconciliation, fresh owner approval, new epoch and new agent/job identities | Synthetic signed recovery only | `epoch-authority.mjs`; `docs/security/production-authority/IMPLEMENTATION-AND-ACCEPTANCE.md` |
| RZ-012 | Audit failure cannot authorize effects; missing/uncertain receipts are not success | Local journal/fixtures; external immutable custody pending | `trusted-supervisor.mjs`, `shared-claims.mjs` |
| RZ-013 | Human/owner acceptance is bound to the tested build and final end-to-end acceptance journey | **Proposed, not implemented** as a completion stamp | `docs/security/production-authority/READINESS-AND-EVIDENCE.md` |
| RZ-014 | Research from external plugins/providers is untrusted read-only evidence, never approval or execution authority | **Future option, not implemented** | No current runtime adapter |
| RZ-015 | Production deployment and merged activation require independent reviewer plus owner-specific authorization | **Open gate; no permission conveyed by passing CI** | `docs/security/p0p1-inventory/DECISIONS-AND-STAGING.md` |

## Global states and accountable owner

| State | Meaning | May agents execute effects? |
| --- | --- | --- |
| DRAFT | Plan proposed; source review permitted within existing access | No |
| REVIEW_REQUIRED | Authority has not approved exact plan/scope | No |
| BLOCKED / RED | Preflight, identity, signature, authority, claims, fence, audit or supervisor evidence failed/unknown | No new effects; stop or quarantine relevant running work |
| APPROVED | Verified authority receipt for specific plan/version | Not on its own; each agent still needs valid handover and Rule Zero admission |
| ADMITTED | Contract, tool/zone/budget/identity and current shared fence checks passed | Only specific mediated, time-bounded operation |
| QUARANTINED | Effect or termination outcome uncertain | No retry/takeover; independent reconciliation required |
| VERIFIED | Independent tests and effect receipts confirm scoped result | No automatic production authorization |
| DONE | Explicit owner acceptance of defined end-to-end requirements at a pinned build | Only for the approved project/version and environment |

## Required contract fields for future enforcement

Plan: `taskId`, `version`, `ownerId`, `tenantId`, step dependencies, justification, expected evidence, exact target/commit, `rulesetHash`, tools/zones/budgets. Signed approvals and handovers must bind their canonical hashes, expiry and the issuing/subject identities. Agent actions additionally bind contract, resource, nonce and short lifetime. **Never treat this prose catalogue as the authoritative `rulesetHash` input** without a separately reviewed canonical versioned schema and trusted issuer.

## Activation gates, in order

1. **Catalogue review:** owner and security reviewer agree on operations, exceptions, severity, evidence and each rule's exact enforcement point.
2. **Staging authority and effect boundary:** separately authorized isolated resources, real owner/tenant enrollment and custody, resource-side fenced DB append, protected checkpoints, no privileged fallback.
3. **Negative security exercises:** direct REST/tRPC/cron/DB bypass, wrong tenant, forged contract, stale epoch, crash, timeout, replay, audit loss, stop failure and restore; measure actual effect count.
4. **First project integration:** choose one named project and one explicitly approved low-risk workflow. Inventory every alternate ingress/credential. Do not connect a live swarm before complete mediation.
5. **Project DONE gate:** pin approved plan, commit/build, deployment environment, login/logout, core pages, save/reload/edit/delete of disposable data, security/recovery results and independent receipts. Evidence missing = REVIEW_REQUIRED, not DONE.

## Non-goals / explicit prohibition

No production account/resource provisioning, migration, deployment, merge, permission expansion, autonomous agent replacement, automatic retry on uncertain effects, claims reset, destructive real-data acceptance, or claiming complete security from green CI. Existing PRs #47-#56 remain draft pending separate review.

**Catalogue maintenance:** Update this file only with a versioned review; record which rule and test/evidence changed. Future machine-readable enforcement must be separately designed, versioned, signed and tested. Never infer enforcement merely from catalogue text.
