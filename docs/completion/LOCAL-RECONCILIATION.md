# Preserved local-work reconciliation

Compared against canonical main `9d9c33238eb2b6e9ec412347407cf2a2198392b9`.

All 35 modified/untracked files match canonical bytes exactly (category A). No local file was ported. Four local-only commits have patch-equivalent upstream changes according to `git cherry`.

| Commit  | Classification | Purpose                    |
| ------- | -------------- | -------------------------- |
| 22e9874 | A              | Monitoring schedule status |
| 08816e6 | A              | Lazy-loaded routes         |
| 41c4d81 | A              | Recent monitoring activity |
| 5fed889 | A              | Sanitized HTTP errors      |

| File                                                                         | Category             | SHA-256 of preserved content                                       |
| ---------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------ |
| `client/src/App.tsx`                                                         | A — already upstream | `6e4b3417bf8b6e1c523da3556cf3cc5e3e386b38e433e403de6e616c59ab5993` |
| `client/src/pages/EvidenceVault.tsx`                                         | A — already upstream | `e03d512b183945bd74117fc36a44411cd8f668d2868c108c801860c8bc85c338` |
| `client/src/pages/NotificationCenter.tsx`                                    | A — already upstream | `0d770464945185e5a63b7b8a24118c09570047fa91ad7fe8eac1994063ed2cdf` |
| `server/_core/context.ts`                                                    | A — already upstream | `9eb594ec4ad664b142f9f83e647bc660ac1b7aa57f21e6b4450b821cfa209391` |
| `server/cases.ts`                                                            | A — already upstream | `d64801d8e190590bbdfdb05674d90ad2715614452880fb42e6c619421c2a2de1` |
| `server/db.ts`                                                               | A — already upstream | `a665ae51e8023c4c21d2b41a5246da5441141392901ab936721b23dcb088afca` |
| `server/emailService.ts`                                                     | A — already upstream | `1ef37cc2e2eeed14838c6c0ee5cda21b0eef28c1432c8330d8ca77e631268c2f` |
| `server/emailServiceIntegration.ts`                                          | A — already upstream | `fa27e17505f312046ec23ce7bf17e75f952b865d5945656607b49af03ce3949c` |
| `server/monitoring/github-monitor.test.ts`                                   | A — already upstream | `de495f7a5c67d441ec91c8bb39937fbd0f660d54fac32e6e26edf3b135b911fb` |
| `server/monitoring/github-monitor.ts`                                        | A — already upstream | `15a149918c713f97e550313d116b063c7c87e7729be03fbfdee53f3187c66bac` |
| `server/notifications.ts`                                                    | A — already upstream | `0da0247a4acca3e2f9bea13bf2a4ffba6e50cf085283691c0ce5dd3e46f77c0d` |
| `server/pegasus-router.ts`                                                   | A — already upstream | `fb887e556289baa0c227a554ba8b29737c3188e829d8614d62c09d42669b1f7a` |
| `server/pegasus-store.ts`                                                    | A — already upstream | `1348627a17a6362ee3912c4f68815e9679a89b668e1135bffdb71647a6ff366e` |
| `worker/index.test.ts`                                                       | A — already upstream | `2e6cba675e3299bb2c85ec67753df2328084276fcf0ae59ce408f049c71f11d4` |
| `worker/index.ts`                                                            | A — already upstream | `526feb41a3a592439581b913deefc99b67e31d8ecd8d716424d15b6cec3ab802` |
| `wrangler.jsonc`                                                             | A — already upstream | `2950ef0a7a1fc8672c560d961c87def6c0ffd49f340d85b8b1b7a55bc767188f` |
| `docs/EMAIL-ALARMS.md`                                                       | A — already upstream | `0b111958b11bbd83254a697423ec67db515bfa3a0a2d65b46f609e6600cba646` |
| `docs/PRIVATE-EVIDENCE-FILES.md`                                             | A — already upstream | `94fecb541f8bb36b6891e5089b73e1d8f4e671aa9b4ce0c9fe3dec40a7292f17` |
| `drizzle/migrations/20260916115648_pegasus_private_email_outbox.sql`         | A — already upstream | `483716f7ce853c3cafb7335ef3b6a1941aa81dadd513481a0eb33084e3cf64c0` |
| `drizzle/migrations/20260916170726_disable_unrestricted_storage_uploads.sql` | A — already upstream | `56367cee5faacfe3f6c5f4d2b3d15ae8ae4496155ec0fac99ef64f0aa8e0f338` |
| `drizzle/tests/pegasus_email_outbox.sql`                                     | A — already upstream | `e00e88ca5700cd784660942e6552e6a6c28e1e0e836babe11629ee56a72e4880` |
| `server/alert-center.test.ts`                                                | A — already upstream | `5fa91a58087005b64b7bd2ebef356b2945357c57d973d7cd5491da2f90e4ee35` |
| `server/cases.test.ts`                                                       | A — already upstream | `a2d25ac07c000dc123a2b554b43d9e256800f17137ef29bb02149f02b52c3c2a` |
| `server/cloudflare-telemetry.test.ts`                                        | A — already upstream | `4588a75809bf765b82ebe762627916beec3e5d81d05e8982eabf39b2b91eec20` |
| `server/email-outbox.test.ts`                                                | A — already upstream | `0a0028557d8ea02979d7f2292957dc7dfc37c29663f1e6850cb957c5b03779b7` |
| `server/email-outbox.ts`                                                     | A — already upstream | `4f4f3830dd4af03a5f3ff7d315d60e36a8a43aef4316288ae12b96804486da2d` |
| `server/email-test.test.ts`                                                  | A — already upstream | `505e66258347563bab699a64bae731a2670e2864a13b6ce2bb61a6c4f86bb94b` |
| `server/email-test.ts`                                                       | A — already upstream | `75f9273f2bbf93921f27a29501e647aefa7bbd8a14c071dcc7b66e61bc76077f` |
| `server/emailServiceIntegration.test.ts`                                     | A — already upstream | `cde5776b6dcf216946b1b979d84c917ab56cbb80d6a8fada55650a14a7d0f4be` |
| `server/evidence-storage.test.ts`                                            | A — already upstream | `9f919882ed680d3c77b78686f6249a55a1c4ca44c4003406a25f41e540d1f62d` |
| `server/evidence-storage.ts`                                                 | A — already upstream | `38b213d7e372b252a366aa9d5a01ae030fca583b30d2f44bc1398832e92c97ee` |
| `server/notification-ownership.test.ts`                                      | A — already upstream | `f83b0d61ea051d2394fd4b7b64c701d7d8e14ccd5005c05947ccd8fbf8cc5db3` |
| `server/pegasus-alert-store.test.ts`                                         | A — already upstream | `6fdfe861a7535ce9cdb001359b7d525b564a9920ccb15964097d8902abc0c24f` |
| `server/pegasus-alerts.test.ts`                                              | A — already upstream | `d434e1f4889183a2424d5aabd8532d7a2f330ff5fe7cec9edbde00fb4cc44d2a` |
| `worker/email-alarms.test.ts`                                                | A — already upstream | `56614b406b8b917ec0e36b06507cb0384628242c65031526268e1bc0da6df4fd` |

Source files and Git state were not edited. Before receiving the detailed prompt, the first preliminary test/typecheck reused the old node_modules through a temporary symlink; TypeScript may have refreshed its ignored incremental cache. That symlink was removed immediately when detected. All subsequent verification uses a fresh installation in this completion checkout. Therefore strict byte-for-byte preservation of ignored dependency caches cannot be attested, although source/Git preservation is verified.
