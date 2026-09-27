# Google security-email connector

Status: release approved on 2026-09-27; provider constraint applied and verified. Deployment is being prepared; Google account consent and live collection remain unverified. No real mailbox was accessed in development. Existing GitHub monitoring remains separate.

This collector polls Gmail message history and requests only From/Subject metadata for newly added messages. It recognizes a narrow set of English Google security-notice subjects and the claimed sender no-reply@accounts.google.com. Headers are untrusted: these events mean review a notice, not confirmed compromise. Raw subjects, bodies and attachments are not persisted. Metadata permission nevertheless covers the whole mailbox. Medium PEGASUS events do not trigger the existing high/critical email alarm policy. This is not dark-web coverage, a Google login audit or device protection.

## Activation prerequisites

1. Applied and read-back verified on 2026-09-27: migration `20260927160000_google_monitoring_provider.sql` through the established controlled migration process. It expands the provider constraint only; the preceding eight migration records remain historical. The live constraint now permits github and google.
2. In a Google Cloud project, enable Gmail API and configure the OAuth consent screen. Register a Web application OAuth client with exact redirect URI `https://osiris-web.sophia-stars.workers.dev/integrations/google/callback`.
3. Configure `openid`, `email` and `https://www.googleapis.com/auth/gmail.metadata`. Gmail metadata is a restricted scope; meet Google's applicable consent/verification requirements. For an External app in Testing, add each intended Gmail address as a test user. Testing refresh tokens for these scopes expire after seven days; this is not a durable production configuration.
4. Store `GOOGLE_CLIENT_SECRET` securely as a Worker secret. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_REDIRECT_URI`, and retain the existing secret `MONITORING_TOKEN_KEY`. Never put credentials in browser build variables, commits or chat. Enable `GOOGLE_MONITORING_ENABLED=true` only after migration and configuration are ready.
5. Deploy the reviewed branch through the existing release procedure. Sign into OSIRIS, choose Connect Google account and consent separately for each Gmail account. OAuth tokens stay encrypted on the server. The callback is bound to the OSIRIS owner, session state, PKCE and a ten-minute expiry.

Official references: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync).

## Coverage and recovery

Connection starts at the current mailbox history ID: no historic inbox import. Existing cron/manual runner polls active connections. Expired consent or expired Gmail history stops the connection with a visible reauthorization requirement. Reconnecting starts a fresh baseline and does not repair the prior coverage gap. Each attempt fetches at most one history page and ten message headers. Unprocessed message IDs and the next-page cursor are checkpointed so later runs drain the backlog before advancing the history baseline. A history page exceeding 1,000 unique messages fails explicitly. Polling can lag behind a busy inbox; runtime limits and backlog recovery still require controlled live validation.

Disconnect clears local tokens even when Google revocation fails; the UI then instructs the user to remove OSIRIS access in Google Account. Existing recorded observations remain in the owner-scoped ledger.

## Controlled validation after setup

Connect an owned test mailbox, verify its displayed identity and absence from another OSIRIS owner's connection list. Check manual and scheduled runs independently. A benign test fixture validates parsing in automated tests; do not manufacture a real account incident. Check ordinary incoming mail advances history without creating a security notice. Verify an authentic Google security email, when naturally available, creates only the review event and stores no body or raw subject. Revoke consent in Google Account and verify the visible reauthorization state. Test disconnect and confirm polling stops. No paid breach-data service or Proton/Outlook connector is included.
