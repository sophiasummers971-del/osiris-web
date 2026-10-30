# Pegasus ↔ OSIRIS shared security contract (proposal, v1.0)

Status: **DRAFT / NOT ENFORCED / NOT DEPLOYED**. This is the shared review target, not a claim that either runtime accepts or enforces it. Pegasus owner must independently approve and implement its sending side. PR #63 and PR #66 remain separate; no production routing or migration is authorized.

## Boundaries and responsibilities

- **Pegasus** is the policy admission gateway: authenticate workload identity, bind audience, check route-level permission, rate/replay budget, quarantine and record a decision. It **must not** assert that a case is owned merely because a caller supplied an owner ID.
- **OSIRIS** is the final resource authority: independently authenticate the gateway or end-user principal, resolve tenant/case permissions from trusted server data, enforce RLS plus relational FKs, and write evidence/audit under protected transaction boundaries. No gateway ALLOW overrides OSIRIS DENY.
- **Database** defends even privileged paths where possible (composite FKs), but privileged bypass, source authenticity and custody remain independent controls.
- A request **must** pass both sides. Trusted gateway ingress does not make arbitrary user-supplied payload fields trusted.

## Transport and identity binding

The wire shape is defined by `envelope.v1.schema.json`, which is deliberately insufficient by itself for security. The trusted ingress must derive verified issuer, principal, service identity, target environment and permissions from authenticated connection/credential, **not** from strings in the envelope. Workload JWT/mTLS/signed-request are candidate transport mechanisms, not automatically enabled or interchangeable. Select and document one before shipping.

Bind: issuer, exact audience, environment, tenant, resolved case owner, actor, action, payload digest, event_id, nonce, issued/expires timestamps and policy version to the authenticated request. Verify signature/credential, canonicalization, clock window, body digest, single-use event/nonce semantics and idempotency atomically. Fail closed if replay storage is unavailable; do not retry non-idempotent append without an idempotency key.

Never accept `service_role` or database superuser credentials as client credentials, never forward an unverified caller JWT as gateway identity, and never permit a SECURITY DEFINER shortcut around resource authorization.

## Versioned decision model

Results: `ALLOW`, `DENY`, `QUARANTINE`. Unknown version, action, event type, identity, tenant, case or policy => `DENY`; missing evidence or dependency failures => `QUARANTINE` or `DENY`, never `ALLOW`. A quarantine receipt carries a correlation ID and non-sensitive reason code; it is **not** an accepted append. No execution occurs until a separately approved replay passes fresh admission and idempotency checks.

Two independent gates:
1. **Shape/transport admission** at Pegasus: required fields, exact versions, authenticated issuer/audience, signed digest, TTL, replay, route policy and resource budget.
2. **Resource authorization** at OSIRIS: look up tenant/case/actor ownership and allowed action in trusted tables, reject mismatches even if Pegasus issued ALLOW. Database constraints and immutable event controls remain in effect.

### Event policy catalogue (review required)

| Category | Event/action | Default v1 outcome | Reason |
| --- | --- | --- | --- |
| Case reads | `case.read` | DENY until explicit actor+case policy | No implicit gateway permission |
| Case creation | `case.create` | DENY until explicit capability | Avoid unbounded case creation |
| Evidence append | `evidence.append` | DENY until verified case ownership + trusted provenance | PR #63 enforces ownership only |
| Audit append | `audit.append` | DENY until trusted authorship + policy | Self-authored audit is not trustworthy server provenance |
| Alert submission | `alert.submit` | DENY until Pegasus alert ownership/provenance review | Pegasus-track decision outstanding |
| Unrecognized/new types | any | DENY | Explicit versioned inclusion required |
| Replay/suspicious sequence | any | QUARANTINE without side effects | Independent security investigation |
| Unknown actor/tenant/case | any | DENY | No implicit fallback |
| Upstream/downstream unavailable | any | QUARANTINE or DENY without side effects | Never allow on timeout |

All application feature traffic is *disabled by default* under this draft contract. The table does not claim production policies have changed.

### Evolution and event exclusion

- Each new event type needs a documented threat model, permitted actor/capability, tenant/case scope, allowed route, schema/payload allowlist, retention/data classification, rate limit, idempotency behaviour, audit trail, and negative tests.
- Explicit exclusions: no cross-tenant joins, ownership reassignment by payload, direct operator role mutation, unsigned events, ambiguous audience, unknown protocol version, arbitrary SQL/tool commands, raw secrets or user data in diagnostics, and bypass of Rule Zero.
- Unknown future fields fail strict schema validation (`additionalProperties:false`). Adding any field or event requires a versioned schema/policy review, not a blanket wildcard.
- Compatible minor changes may add a separately negotiated extension profile only with deny-by-default enforcement; incompatible changes require a major version and staged dual-version tests.
- Revoke/disable a capability or event type without accepting stale cached ALLOW. Backward compatibility does not outrank revocation.
- Preserve a signed/immutable policy decision ID for each accepted event; do not put credentials or user secrets in audit metadata.

## Required negative/positive integration tests

Run on isolated environment with synthetic identities and cases only:
1. valid credential + permitted same-case event succeeds exactly once, with recorded decision and DB constraints intact
2. same transport credential with another tenant/case/actor is denied at OSIRIS, including privileged gateway path
3. fake issuer, mismatched audience or environment, expired/not-yet-valid timestamp and altered body digest are denied
4. duplicate event_id/nonce, concurrent duplicate delivery and retry-after-timeout create at most one append
5. unknown version, extra field, unknown type and disallowed action are denied
6. unavailable replay store/policy store/OSIRIS database returns no accepted side effects
7. quarantine cannot be turned into write permission by replay without fresh approval
8. audit and evidence records cannot be modified or forged by an ordinary caller
9. exact gateway deployment and receiving OSIRIS deployment versions are recorded; rollout and rollback tested
10. branch bootstrap is complete and hosted Supabase Auth/PostgREST positive/negative tests pass independently

## Release gate

Require separate receipts:
- `SCHEMA_BOOTSTRAP_VERIFIED`: clean fresh database from reviewed baseline and manifest, catalog diff accepted
- `HOSTED_INTEGRATION_VERIFIED`: hosted Auth/PostgREST + ownership allowed/denied cases, no production credentials
- `BRIDGE_CONTRACT_VERIFIED`: actual Pegasus and OSIRIS releases exchange signed events and pass negative cases
- `RULE_ZERO_APPROVED`: supervisory constraints and fail-closed readiness checked
- `PRODUCTION_CHANGE_APPROVED`: separate explicit authorization, migration/rollback evidence and release owner

**No individual receipt implies the others.** Never declare the integrated platform release-ready based on a local suite or document-only contract.
