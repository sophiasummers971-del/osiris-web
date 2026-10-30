# CAT-START-01: fresh owner approval at the execution boundary (design gate)

Status: REVIEW REQUIRED / NOT IMPLEMENTED. Synthetic CI green is not deployment acceptance.

## Existing guarantee versus missing guarantee

`plan-y.mjs:verifyPlanApproval` verifies the signature on `osiris.plan-approval/v1`, the canonical plan hash, task/owner/tenant identity, version and expiry. This proves a key signed matching data, **not** that the human owner just verified and intentionally approved this exact job. The existing issuer may be an automated service; no trusted human step-up is established.

`launcher.mjs` accepts a host-provided `verifyOwnerApproval(job)` callback with `{approved:true,approvalId,jobId,target,commit,expiresAt}`. A true boolean from an untrusted adapter must not count as independent owner authorization. The legacy callback also lacks a full Plan Y digest.

## Required boundary

1. A trusted approval service creates a server-stored, random one-time challenge bound to authenticated tenant/owner, canonical immutable plan hash, job/contract identity, approved scope summary, intended action (START), short expiry, credential policy and nonce.
2. Present that exact transaction summary to the owner. Perform **fresh user-verified authenticator step-up** (such as a correctly configured WebAuthn assertion) with relying-party ID/origin, challenge, credential/owner binding, signature, user-verification and authenticator policy verified on the trusted server. Browser session and autofill do not satisfy the gate.
3. Approval issuer verifies the challenge, request context, risk policy and credential status *before* issuing a signed, short-lived job-bound receipt. Use controlled key custody and revocation. Do not expose issuer signing keys to agents or browser.
4. The execution host independently checks receipt signature, actor/tenant, exact plan digest, contract/job, scope, expiry and a **durable atomic one-use claim** shared by all dispatchers. Check immediately before any effect. Unverifiable authority, nonce store or expiry => deny before dispatch.
5. A plan or permissions change, new job, changed tenant, widened tool/zone/budget or expiry requires a new approval ceremony. Bounded pre-approved substeps under the same unchanged contract do not.
6. Track audit durability and execution outcome separately. If a runner may have accepted the operation before an audit/receipt outage, show `EFFECT_UNKNOWN_RECONCILE`, quarantine and forbid automatic retry.

## Mandatory isolated acceptance tests

| Case | Expected result |
| --- | --- |
| START clicked while logged in but no fresh approval | deny; 0 dispatch |
| Browser replay/autofill, stale or wrong challenge | deny; 0 dispatch |
| Real user verifies for plan hash A; submitted plan hash B | deny; 0 dispatch |
| Wrong RP ID, origin, owner, tenant, credential or invalid signature | deny; 0 dispatch |
| Expired, revoked or already claimed approval | deny; 0 dispatch |
| Missing/partitioned authority store | deny; 0 dispatch |
| Two independent supervisors race same job/approval | 1 claim; at most 1 effect |
| Valid approval but different tools, target, budget or agent | deny; 0 dispatch |
| Valid approval, unchanged job and verified host runner | 1 dispatch with signed durable receipt |
| Audit fails after dispatch | UNKNOWN, no retry, reconcile externally |

## Release blockers

No connected authenticator / RP identity; no verified approval signer and issuer key custody; no durable shared one-time approval store; no mandatory interception of actual worker/cron/queue/effect adapters; no hosted independent negative tests; no approved staging security reviewer. The current branch is **design only** and cannot turn these items green.

Do not merge/deploy/start live agents on the strength of this document. Preserve OSIRIS freeze until security/owner acceptance authorizes the specific next boundary.
