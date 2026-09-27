# Legacy architecture disposition

Import, route, script, test and documentation searches were performed against
canonical main and the completion checkout. Runtime reachability is separately
checked by `pnpm lint` from `worker/index.ts`.

| Component                                                             | Disposition                           | Evidence / reason                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| MySQL notification router                                             | Removed                               | Rejected Supabase id 0; unused hook/preferences UI. Current alert centre uses PEGASUS. Removes blank-recipient admin email and unfinished push registration. |
| Supporter API and page                                                | Removed                               | Static membership/content examples; not private-security product functionality. No current navigation link. Public MySQL queries retired.                    |
| Supabase identity                                                     | Active                                | Both Worker and local Express verify bearer tokens. Distinct IDs and owner mapping tested.                                                                   |
| Express/Vite                                                          | Retained — required                   | `pnpm dev`, build/start compatibility. No Manus or legacy storage route registration. Local AI/email bindings explicitly unavailable.                        |
| Vercel entrypoint/config                                              | Removed                               | Alternative unneeded production boundary exposed old OAuth/storage proxies; Cloudflare is canonical runtime.                                                 |
| Vercel analytics/speed insights dependencies                          | Removed                               | No imports; existing telemetry regression tests preserved.                                                                                                   |
| Manus OAuth SDK, callback, storage proxy, owner notification endpoint | Removed                               | No longer imported by production or local development. Browser login uses `/auth` only.                                                                      |
| Manus Vite runtime/debug collector and JSX locator                    | Removed                               | Template tooling, not needed for local Vite/React. Avoids recording browser logs/session replay.                                                             |
| MySQL schema, db helpers and drizzle config                           | Retained — compatibility/history      | Finance and ownership regression tests still use them; no active Worker import. Generic `db:push` removed. No claim they are production schema.              |
| Stripe/Coinbase helpers                                               | Retained — compatibility/history      | Unexposed and covered by existing provider-sanitization tests. Stripe rejects nonnumeric legacy identities; no new finance router.                           |
| Legacy SendGrid/Mailgun and queue helpers                             | Retained — compatibility/history      | Existing tests preserved; unreachable from Worker. Cloudflare Email is the active alarm sender.                                                              |
| Browser push client/preferences                                       | Removed                               | Unused, registration commented out and VAPID read through browser `process.env`. No replacement.                                                             |
| Component showcase / Manus login dialog                               | Removed                               | No route or import; template UI only.                                                                                                                        |
| Candidate OSINT registry                                              | Retained — content only               | Explicit example-only badges, sample output and illustrative command labels. GitHub monitoring section remains real.                                         |
| Generic Forge/map/storage/voice helper files                          | Retained — uncertain historical reuse | No Worker reachability; removal would broaden cleanup into unrelated template modules. Not configured or advertised as live functionality.                   |
| Historical finance/posture plans, template.json, references           | Retained — historical content         | README is authoritative for current operation. They are not build/deploy commands.                                                                           |

No database tables, historical data, production extensions or remote branches
were deleted. Runtime disconnection is not a database migration.
