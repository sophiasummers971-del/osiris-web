# OSIRIS production authority design package

**Design proposal only — production readiness remains AMBER / NOT APPROVED.** No service connection, resource, migration, credential, agent, deployment or merge is introduced.

Source examined: `45b754eb02a034fd5c13462f6157a3b4685e27f5` (draft #53). The synthetic epoch tests are evidence for the prototype, not proof that existing application routes are mediated.

| Document                                                                          | Review purpose                                                                                  |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Architecture decision](../../adr/ADR-20261029-rule-zero-production-authority.md) | Conditional component selection, authority protocol, effect semantics and rejected alternatives |
| [Execution boundaries](EXECUTION-BOUNDARIES.md)                                   | Source-anchored entry points, credentialed sinks, bypasses and required closure                 |
| [Threat model](THREAT-MODEL.md)                                                   | Assets, attacker capabilities, trust boundaries and residual risk                               |
| [Implementation and acceptance](IMPLEMENTATION-AND-ACCEPTANCE.md)                 | Dependency-ordered stages, isolated tests and numerical acceptance criteria                     |
| [Readiness and evidence](READINESS-AND-EVIDENCE.md)                               | Current evidence versus required production evidence; review/approval gates                     |
| [Sources and cost](SOURCES-AND-COST.md)                                           | Primary documentation, feasibility limits and dated cost assumptions                            |
| [Source inventory](source-inventory.json)                                         | Literal runtime import graphs, source-file hashes and limitations                               |

The immediate blocker is complete mediation: current Worker HTTP/cron and Node HTTP paths do not import the supervisor. Existing authentication/ownership checks still apply; this statement is about missing Rule Zero integration, not a demonstrated authentication bypass.

The proposed staging design combines a Cloudflare Durable Object authority/actuator with separate retained checkpoints and Supabase transactional resource functions. No combination is claimed to make an arbitrary HTTP provider obey fencing. Unsupported effect classes stay disabled for autonomous execution.

Review sequence: confirm the execution inventory; accept or reject the ADR and root-of-trust assumptions; review the threat model; fund only separately authorized isolated staging; collect every required gate artifact; obtain independent security and owner approval. Creating this draft PR grants none of those later permissions.
