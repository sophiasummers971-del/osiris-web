# Existing ecosystem: reuse map and integration gates

Reviewed 2026-10-28. Documentation-only working note. No live connection, credentials or security guarantee is implied.

## Verified source locations

- Oracle/AREN: https://github.com/sophiasummers971-del/Oracle_show_me ; examined src/server/index.ts, src/ui/oracleApi.ts and README.md. Intelligence POST /api/intelligence; outcomes POST /api/intelligence/outcomes; exact recall GET /api/intelligence/recall. The examined handlers use a D1 repository. **Security gate:** no explicit caller authentication/tenant authorization was visible within the inspected route handlers; audit full deployment and middleware/access gates before exposing endpoints or linking Memory Hub. This is NOT proof of public exposure.
- MARK 001.5 historical local reference: Google Drive folder https://drive.google.com/drive/folders/1LFtzH0t5FU260UOGL_gqG1tgoLkfbI82 . CORE_CONTRACT.md and 2026-08-20 handoff describe six bounded rings, integrity admission, 429 backpressure, journal, delivery/recovery and historical 500k-record stress runs. Runtime/persistence is loopback-local; not a production transport implementation.
- MARK 002.5 historical local reference: https://drive.google.com/drive/folders/10r8sAKJ-WaX-UJKcGGYYFjlai6_TNYps . GATEWAY_CONTRACT.md and handoff document pass/quarantine/reject, original-envelope integrity, operator review and audit. Prior unintended source exposure was fixed by a static-file allowlist in its local prototype. Verify regression independently before adaptation.
- OSIRIS/Pegasus: this repo's server/pegasus.ts, server/pegasus-router.ts, server/monitoring/runner.ts, and draft server/memory-hub-boundary.ts on this branch. The latter is pure validation/review logic only. It is NOT an authenticated integration, durable quarantine or production protection.
- Cross-AI Memory Hub: https://github.com/sophiasummers971-del/cross-ai-memory-hub . Governed memory and review workflows exist; do not grant other services its broad browser API or underlying database service role.
- Sector 7: user reports a local mobile-client/Surface-server prototype; no current source/runtime verified by this review. Treat multi-worker execution as an architectural intention, NOT a deployed property.

## Reuse, do not multiply authorities

1. Gateway/Pegasus identifies safe envelopes and routes. Existing MARK 002.5 is a _reference_ for classification; preserve explicit proof and owner-authorized decisions.
2. Sector 7 worker transport may reuse MARK 001.5 queuing/backpressure invariants. Worker job contracts must be purpose-scoped and minimally privileged; do not allow broad memory/database reads.
3. Memory Hub alone owns approval and retrieval policy over private memory. Security journal stores metadata and evidence references, not memory contents.
4. AREN/Oracle consumes only approved and bounded context through dedicated authenticated read-only integration. AREN does not approve its own requests or hold privileged credentials in the UI.
5. OSIRIS receives narrow alerts/evidence references and alerts operators. It does not retaliate or gain custody of private information.
6. Sector 9 physical control (if ever implemented) stays separate, local, fail-safe, independently limited and operator-controlled. No direct AI/remote motor authority without device-specific safety verification.

## Implementation gates (order matters)

- [ ] Verify current branches, deployment identity, and actual auth boundaries for Oracle/AREN, OSIRIS and Memory Hub. Negative tests must show unauthenticated and cross-tenant requests denied.
- [ ] Re-run isolated MARK 001.5/002.5 tests on source snapshots; record commands, platform, resource usage and failed cases. Historical numbers are not deployment guarantees.
- [ ] Compare MARK 002.5 quarantine with draft Pegasus boundary. Choose one canonical source of state and one source of operator authority. Avoid parallel queues deciding differently.
- [ ] Define immutable minimal signed event envelope, verification, timestamps, idempotency, replay limits, tenant mapping and key rotation. No raw private memory or instructions in security-signal summaries.
- [ ] Define durable quarantined records with strict owner RLS, append-only review/audit, lifecycle and privacy retention. The caller cannot self-assert authorized=true.
- [ ] Enforce pre-retrieval and pre-ingest hold in Memory Hub; quarantined inputs must not become canonical memory or appear in AREN retrieval.
- [ ] Test damaged route -> isolated state -> bounded buffering/refusal -> trusted alternate route (revalidated) -> OSIRIS alert -> authenticated owner decision -> audited recovery.
- [ ] Run disaster/recovery, concurrency, replay, bad-origin, overload and prompt-injection regression tests in disposable environments.
- [ ] Only then request explicit owner approval for any merge, migration, secret changes or production deployment.

## Known unknowns

- Are Oracle endpoint protections implemented by infrastructure outside the examined handler? Must verify.
- Which local Sector 7 source tree is canonical? No claim made.
- How to anchor audit chain independently, restore backups, and keep decrypted content out of logs? Needs implementation and independent verification.

## Security principle

Fail closed, preserve authority boundaries, retain explicit evidence for each claimed safeguard, and never claim absolute protection or invisible/undetectable infrastructure.
