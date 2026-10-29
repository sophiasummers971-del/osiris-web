// Disposable synthetic test subprocess only. Never imported by the supervisor.
import { createSharedClaimClient } from "./shared-claims.mjs";
import { createTrustedSupervisor } from "./trusted-supervisor.mjs";
let host, client, agentId;
process.on("message", async message => {
  const { requestId, action, data } = message;
  try {
    let value;
    if (action === "supervisor") {
      host = await createTrustedSupervisor(data);
      agentId = data.agentIds[0];
      value = host.getAgentDescriptor(agentId);
    } else if (action === "client") {
      client = await createSharedClaimClient(data.config, {
        ...data.verification,
        agentKeys: new Map(data.verification.agentKeys),
      });
      value = true;
    } else if (action === "start") value = await host.start(data);
    else if (action === "dispatch") value = await host.dispatch(agentId, data);
    else if (action === "stop") {
      value = await host.stopAgent(agentId);
      await host.close();
    } else if (action === "acquire")
      value = await client.acquire(data.bundle, data.leaseMs);
    else if (action === "metrics") value = host.getMetrics();
    else throw new Error("UNKNOWN_FIXTURE_COMMAND");
    process.send({ requestId, value });
  } catch (e) {
    process.send({ requestId, error: e.message });
  }
});
