# PEGASUS recovery and quarantine custody contract

Status: **design contract only**. This document is not evidence that production routing, cryptographic erasure, independent verification, or control-plane recovery has been implemented.

## Fixed topology

- `primary`: normally active.
- `failover`: verified healthy standby, able to receive explicitly approved traffic.
- `sector7-a` and `sector7-b`: physically and logically sealed placeholders, with no credentials and no routes to Sector 7 until independent integration acceptance.
- Every data pipeline has a distinct isolation boundary; no shared mutable authority, credentials, or unverified route shortcuts.
- OSIRIS and the recovery controller belong to a separate management/control plane, outside all data-pipeline and quarantine boundaries.

## Operation contracts

1. **Identity and maintenance preflight:** An unknown or stale identity fails the requested maintenance operation. It does not establish infection, initiate quarantine, delete data, isolate the recovery plane, or change healthy routing.
2. **Detection:** Untrusted traffic indicators are evidence requiring classification, not automatic proof of compromise. Preserve provenance and diagnostic reasons without recording sensitive payloads in plain text.
3. **Failover:** Before closing an affected active route, a separately authorized recovery controller verifies a healthy alternative with matching authorization policy. Use an atomic, reversible route transition. Never fail over to sealed Sector 7 ports.
4. **Containment:** Seal the affected isolated data plane and quarantine its disposable contents. Quarantine has no authority to modify routing or recover itself.
5. **Rebuild:** Restore a _clean_ pipeline from known-good infrastructure and signed, versioned configuration. Do not reuse suspect keys, workloads, or mutable state.
6. **Independent approval:** Before reconnecting, require independent verification outside the affected trust domain, plus explicit authorized approval. A component must not approve its own recovery.
7. **Retention:** Quarantined disposable payloads remain sealed for at most seven days without an authorized disposition or extension. At expiry, destroy the applicable encryption keys and all copies under our control, and verify deletion. No automatic release, reopening, or cleanup of unrelated infrastructure. Expiry does not imply a credential, authority, or control-plane deletion.
8. **Evidence limits:** Keep a minimal non-content disposal receipt for accountability. Do not claim mathematically certain deletion of uncontrolled external copies or third-party backup snapshots.

## Production activation gate

- Simulate expired engineer identity; expected: deny only, unchanged traffic, no timer.
- Simulate compromised primary while standby healthy; expected: independently authorized failover, then isolation.
- Simulate standby unhealthy; expected: safe halt without silently routing insecure traffic.
- Prove two Sector 7 ports cannot be opened via ordinary failover.
- Simulate OSIRIS disagreement, invalid signature, tampered clock, replayed approval, and unavailable control plane.
- Verify seven-day expiry destroys only in-scope disposable quarantined content while independent recovery remains available.
- Rebuild and independently verify a pipeline in a disposable isolated environment before any live routing.

No production route activation, merge, or deletion until the applicable negative tests and independent approval are recorded.
