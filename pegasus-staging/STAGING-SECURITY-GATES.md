# Pegasus staging evidence and merge gate (2026-10-29)

## Current verified baseline
- Separate offline laboratory: 58/58 tests passed using `node --test *.test.mjs` (local execution).
- Draft PR #62 contains four-pipeline policy; draft PR #64 contains the sealed staging-only Worker.
- This repository's staging observer returns fixed synthetic state. It does not query any route provider or alter traffic.
- Offline recovery/quarantine modules remain in the handover archive, **not** imported as a production runtime.

## Staging activation prerequisites
1. Stage under a distinct Cloudflare Worker identity with a non-production hostname and isolated test traffic, credentials, storage and operator permissions.
2. Prove the deployment has no OSIRIS, Memory Hub, production Hyperdrive, email, cron, custom-route or Access privileges.
3. Replace synthetic observations with read-only provider observations from outside the controlling Worker.
4. Enforce fencing epochs at the route-effect boundary, including after provider restarts and controller races.
5. Verify signed approvals, expiration, replay prevention, rollback and known-state reconciliation across failures.

## Security review: unresolved and blocking
- No managed signing key lifecycle or independently trusted clock.
- SQLite transactions cover the offline simulator, not Cloudflare route changes.
- Vault file removal does not guarantee SSD, backup, snapshot or remote replica erasure.
- Offline rebuild shortcuts are test-only, not independently approved restoration.
- The watcher is synthetic; a green endpoint is not proof of real staging routing.
- Sector 7 A and B remain sealed.

**Gate:** NO-GO for actual production traffic, production merge, or live routing control. Staging deployment also requires verified resource isolation and explicit deployment approval. PR #64 remains draft pending those checks.
