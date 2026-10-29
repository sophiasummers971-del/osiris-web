// Fixed disposable worker. No eval, dynamic runner, tool implementation or broker.
import { sign, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createConnection } from "node:net";
let init;
const canonical = v =>
  v === null || typeof v !== "object"
    ? JSON.stringify(v)
    : Array.isArray(v)
      ? `[${v.map(canonical).join(",")}]`
      : `{${Object.keys(v)
          .sort()
          .map(k => `${JSON.stringify(k)}:${canonical(v[k])}`)
          .join(",")}}`;
const signed = v => {
  const payload = canonical(v);
  return {
    payload,
    signature: sign(null, Buffer.from(payload), init.agentPrivateKey).toString(
      "base64"
    ),
  };
};
const send = message => {
  if (process.connected) process.send(message);
};
process.on("message", async message => {
  if (message?.type === "INIT" && !init) {
    init = message;
    if (init.scenario === "ignore-term") process.on("SIGTERM", () => {});
    send({
      type: "READY",
      envelope: signed({
        schema: "osiris.worker-ready/v1",
        agentId: init.contract.agentId,
        pid: process.pid,
        challenge: init.challenge,
      }),
    });
    return;
  }
  if (!init) return;
  if (message?.type === "PROBE") {
    const results = {
      uid: process.getuid(),
      envKeys: Object.keys(process.env).sort(),
    };
    try {
      readFileSync("/etc/passwd");
      results.fs = "ALLOWED";
    } catch (e) {
      results.fs = e.code;
    }
    try {
      spawnSync("/bin/true");
      results.spawn = "ALLOWED";
    } catch (e) {
      results.spawn = e.code;
    }
    try {
      process.kill(process.ppid, 0);
      results.parentSignal = "ALLOWED";
    } catch (e) {
      results.parentSignal = e.code;
    }
    results.network = await new Promise(resolve => {
      const socket = createConnection({ host: "127.0.0.1", port: 9 });
      socket.on("error", e => {
        socket.destroy();
        resolve(e.code);
      });
      socket.on("connect", () => {
        socket.destroy();
        resolve("ALLOWED");
      });
    });
    send({
      type: "PROBE_RESULT",
      requestId: message.requestId,
      envelope: signed(results),
    });
    return;
  }
  if (message?.type !== "EXECUTE") return;
  if (message.behavior === "crash") process.exit(23);
  if (message.behavior === "timeout") return;
  const c = init.contract,
    time = Date.now();
  const request = {
    schema: "osiris.agent-action/v1",
    agentId: c.agentId,
    contractId: c.contractId,
    contractHash: init.contractHash,
    planHash: c.planHash,
    planVersion: c.planVersion,
    stepId: c.stepId,
    taskId: c.taskId,
    ownerId: c.ownerId,
    tenantId: c.tenantId,
    nonce: randomBytes(16).toString("hex"),
    issuedAt: new Date(time).toISOString(),
    expiresAt: new Date(
      Math.min(time + 1000, Date.parse(c.expiresAt))
    ).toISOString(),
    tool: message.tool,
    zone: message.declaredZone ?? c.zones[0],
    rulesetHash: c.rulesetHash,
    tokens: message.tokens ?? message.quote.tokens,
    costMicros: message.costMicros ?? message.quote.costMicros,
  };
  const operation = {
    schema: "osiris.worker-operation/v1",
    requestId: message.requestId,
    agentId: message.behavior === "forged-identity" ? "NR-99999" : c.agentId,
    contractId: c.contractId,
    resourceId: message.resourceId,
    actionEnvelope: signed(request),
  };
  const packet = signed(operation);
  if (message.behavior === "forged-signature")
    packet.signature = "A".repeat(86) + "==";
  send({ type: "OPERATION", envelope: packet });
});
process.on("disconnect", () => process.exit(0));
setInterval(() => {}, 1000);
send({ type: "HELLO" });
