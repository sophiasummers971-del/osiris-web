# Owner-only email alarms

Sender: `osiris-alerts@iron-fire.uk`. The existing `email_verify` binding is restricted to the verified recipient `sophiasummers971@gmail.com`.

The private `pegasus_email_config` row identifies the verified owner's vault operator. Activation captures the current maximum alert ID. Only subsequently created high/critical PEGASUS alerts for that owner are eligible. Routine profile changes and historical alerts are not emailed. Alert acknowledgement is separate from email delivery.

The existing 15-minute Cloudflare cron independently runs monitoring and email delivery. No paid Email Sending plan, new cron, certificate change, or incoming-mail rule change is required by this integration.

`pegasus_email_outbox` persists one record per alert. Batches claim up to ten due records using `FOR UPDATE SKIP LOCKED`, with a 30-minute UUID lease. Rejections retry after 15, 30, 60, and 120 minutes, capped at five total attempts. An expired final-attempt lease is marked failed with acceptance unknown. A database outage after provider acceptance leaves the lease for recovery rather than pretending the send was rejected.

States: pending, sending, retry, accepted, failed. Accepted means the Cloudflare send promise resolved, not proof of inbox receipt. The Alerts page shows owner-scoped state and attempt count. There is no automatic bounce/delivery-receipt integration.

Normal duplicate scheduling is prevented by the unique alert key and leases. Exactly-once email delivery is not guaranteed: a crash after acceptance and before persistence can cause a retry and duplicate message. Stable Message-ID values help identify retries but do not guarantee mailbox deduplication.

Emails contain a fixed generic review notice and the Osiris sign-in link. No evidence, raw event payloads, account details, login tokens, or provider errors are included. Both tables have RLS enabled and all client-role CRUD grants revoked; only the server-managed path may access them.

Migration is recorded as `20260916115648_pegasus_private_email_outbox` and preserved under `drizzle/migrations/`. `drizzle/tests/pegasus_email_outbox.sql` rehearses the production SQL in a transaction and rolls back its fixtures. Test sequences may advance, but no synthetic alert is retained or emailed.

To pause safely, a privileged database operator can set `pegasus_email_config.enabled=false`. Leave the outbox and ledger intact. Resuming preserves pending retries; do not reset the activation watermark unless deliberately changing the historical-backfill policy.
