# Pegasus staging-only synthetic route observer

This is a **deliberately inert staging scaffold**, not a production routing adapter.
It has no bindings to OSIRIS, Hyperdrive, Supabase, the Memory Hub, DNS, R2,
or any actual routing provider. It cannot switch real traffic.

Run `pnpm exec vitest run pegasus-staging/worker.test.ts` to test.
The isolated Worker configuration is `pegasus-staging/wrangler.jsonc`.
Never use the production `wrangler.jsonc` for this experiment.
A future independent staging environment must be audited for credentials,
access control, test account and name separation before actual deployment.
No staging deployment is authorized by merging this scaffold.

## Acceptance gates before any operational adapter

1. Separate staging-only service credentials and route targets, no production access.
2. Provider route observer independent from the controller's desired state.
3. Durable fencing enforced at the provider boundary, including restarts.
4. Compare-and-swap or equivalent conflict prevention, plus reliable reconciliation.
5. Forced crash, stale epoch, invalid signature, unhealthy destination and rollback tests.
6. Zero ability to unseal Sector 7 through ordinary failover.
7. Explicit approval of a proposed staging deployment and subsequent production release.

Review staging evidence before merging into main. Merge does not imply production deployment.
