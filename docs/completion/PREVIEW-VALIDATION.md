# Disconnected preview validation

Validated on 2026-09-27 from application commit
`92c46de4717a363ca8e66eac64eac16d728faf40`.

Preview: https://osiris-review-92c46de.sophia-stars.workers.dev/

Cloudflare Worker: `osiris-review-92c46de`.
Deployment ID: `e6bda8ff955647f9b27b1a3d5be2bf8c`.

The user authorized deployment. A separate public review Worker was deployed;
the existing production Worker and GitHub main were unchanged. The preview wraps
the compiled application Worker with embedded frontend assets and exports only
the fetch handler. Its Cloudflare settings were read back and contained no
bindings. No production credentials, database, authentication configuration,
email, AI, OAuth or scheduled handlers were connected. Responses carry a preview
marker and noindex/nofollow headers. This is a disconnected review build, not proof
of the production integrations.

## Browser observations

The supported hosted Chrome browser successfully loaded the HTTPS preview.
Localhost access had been blocked by that browser environment; no browser policy
was changed. A standalone Chromium download was unavailable in the execution
environment, so the supported hosted browser was used instead.

| Surface                            | Observed result                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Home                               | Application rendered; core service online, identity guest, controls locked                     |
| Security                           | Protected configuration remained restricted to authenticated users                             |
| Vault                              | Evidence Vault locked; operator authentication required                                        |
| Alerts                             | Sign-in required; no private alerts displayed                                                  |
| Intelligence                       | GitHub connection required sign-in; static tools labelled examples and commands not executable |
| Authentication                     | Missing Supabase configuration reported; credentials were not requested                        |
| About                              | Application doctrine page rendered                                                             |
| GitHub callback without parameters | Invalid authorization response reported safely                                                 |
| Removed supporters route           | Application 404 displayed                                                                      |

All nine manual browser observations passed. These supplement, rather than add to,
the previously completed automated suite of 170 tests across 31 files. Sampled
browser error logs contained extension metadata errors, with no application
errors observed. A screenshot of the rendered home page was captured.

The health endpoint returned HTTP 200 with Hyperdrive and Workers AI unbound.
Response security headers, the preview marker and no-store policy were observed.
A separate Python HTTP client received Cloudflare 403/1010; no client fingerprint
or access-policy bypass was attempted.

## Remaining live validation

Authenticated owner/cross-owner workflows, real evidence signed downloads,
GitHub authorization and monitoring, email delivery and Workers AI inference were
not exercised by this disconnected preview. Follow
`docs/POST-MERGE-VALIDATION.md` for controlled integration validation. Existing
Supabase account-setting and migration-baseline caveats remain unresolved by this
browser test. Do not interpret this preview as protection for unconnected
accounts, or as a guarantee of preventing attacks.
