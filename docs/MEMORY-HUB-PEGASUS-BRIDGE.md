# Pegasus ↔ Memory Hub: Phase 1 quarantine boundary

Status: **proposed contract, NOT connected to live ingestion**.

## Purpose
OSIRIS observes security signals from Memory Hub via Pegasus. It must not gain direct read access to stored memories or autonomous remediation authority. New information stays under Memory Hub's existing approval process. A suspicious **update** is blocked **before** trusted ingestion by the Memory Hub write boundary, not by asynchronous Pegasus polling.

## Fail-closed path
1. A trusted, authenticated Memory Hub adapter emits a minimal `pegasus.memory-hub.security/v1` signal (id, timestamp, severity, code, digest and short sanitised summary). Never memory text, raw logs, tokens or JWTs.
2. Pegasus authenticates sender with an independently held credential/mTLS or equivalent, verifies replay protection (unique event ID), source clock limits, length limits and schema. The pure validator in `server/memory-hub-boundary.ts` is **not sender authentication**.
3. Pegasus stages the event in a restricted quarantine datastore. Append-only event ledger records the security observation, not the untrusted payload. OSIRIS may notify and recommend; no automatic remediation.
4. A separate authenticated owner review API checks permission server-side and performs atomic, auditable state transitions. No approval is inferred from external content.
5. Memory Hub records only status and reference metadata in a security journal; it never imports quarantined instructions into retrievable memory.
6. Toolbox proposals are separately sanitised and manually approved; never published or executed by the bridge.

## Remaining implementation gates
- Authenticated transport and replay/idempotency handling
- Durable quarantine schema with RLS, immutable audit trail and explicit retention
- Memory Hub pre-ingest checkpoint and journal schema
- Pegasus adapter and UI for operator actions
- Negative tests for cross-tenant access, unauthorised approval, tampering, unavailable providers and duplicate delivery
- Staged end-to-end integration before production rollout

**No production database migration, Worker deploy, memory import or credential sharing is authorised by this file.**
