// Synthetic single-filesystem coordinator. Host configuration only.
import { randomUUID } from "node:crypto";
import {
  canonicalJSON,
  hashData,
  verifyAgentContract,
  pinnedEd25519Key,
} from "./plan-y.mjs";
import { paths, transaction, append } from "./synthetic-ledger.mjs";
import { createEpochClient, claimJournalHead } from "./epoch-authority.mjs";
export { initializeLedger as initializeSyntheticClaims } from "./synthetic-ledger.mjs";
const requireValue = (ok, reason) => {
  if (!ok) throw new Error(reason);
};
const id = value =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(value);
const frozen = value => {
  if (value && typeof value === "object") {
    Object.values(value).forEach(frozen);
    Object.freeze(value);
  }
  return value;
};
// Approval is a plan-wide grant, not a once-only job. Bind its ID to exact
// signed bytes while exclusive job/contract/agent/step claims burn permanently.
function identities(v) {
  const c = v.contract,
    tenant = c.tenantId;
  const key = (kind, ...values) => canonicalJSON([tenant, kind, ...values]);
  return {
    bindings: [
      [key("plan", c.taskId, c.planVersion), v.hash],
      [key("approval", c.approvalId), hashData(v.approval)],
    ],
    exclusive: [
      key("job", c.jobId),
      key("contract", c.contractId),
      key("agent", c.agentId),
      key("step", v.hash, c.stepId),
    ],
  };
}
export async function createSharedClaimClient(config, verification) {
  const p = paths(config);
  requireValue(id(config.supervisorId), "SUPERVISOR_ID_REQUIRED");
  const supervisorId = config.supervisorId;
  const pins = {
    authorityKey: pinnedEd25519Key(verification.authorityKey),
    contractKey: pinnedEd25519Key(verification.contractKey),
    agentKeys: new Map(
      [...verification.agentKeys].map(([name, key]) => [
        name,
        pinnedEd25519Key(key),
      ])
    ),
    context: frozen({ ...verification.context }),
  };
  const epoch = Object.hasOwn(config, "epochAuthority")
    ? await createEpochClient(config.epochAuthority, supervisorId, p)
    : null;
  // Open never initializes, repairs, deletes, or adopts an existing lock.
  await transaction(p, async records => {
    if (epoch) await epoch.register(claimJournalHead(records));
    return true;
  });
  const nextHead = (records, body) => ({
    seq: records.length,
    hash: hashData({
      ...body,
      storeId: p.storeId,
      seq: records.length,
      previous: records.at(-1).hash,
    }),
  });
  async function advance(records, body, token, quarantine = false) {
    if (epoch)
      await epoch.advance(claimJournalHead(records), {
        claimToken: token,
        nextHead: nextHead(records, body),
        quarantine,
      });
    return append(p, records, body);
  }
  const tokens = new Set();
  async function active(records, token) {
    requireValue(tokens.has(token), "CLAIM_NOT_OWNED");
    const acquisition = records.find(
      r =>
        r.event === "ACQUIRED" &&
        r.token === token &&
        r.supervisorId === supervisorId
    );
    requireValue(acquisition, "CLAIM_NOT_FOUND");
    const state = records.findLast(r => r.token === token);
    return {
      acquisition,
      state,
      live: acquisition.expiresAt > Date.now() && state.event !== "QUARANTINED",
    };
  }
  return Object.freeze({
    async acquire(bundle, leaseMs) {
      requireValue(
        Number.isSafeInteger(leaseMs) && leaseMs >= 100 && leaseMs <= 10000,
        "INVALID_CLAIM_LEASE"
      );
      // Snapshot before the first await; store independently verifies authority.
      bundle = frozen({
        planJson: bundle?.planJson,
        approvalEnvelope: {
          payload: bundle?.approvalEnvelope?.payload,
          signature: bundle?.approvalEnvelope?.signature,
        },
        contractEnvelope: {
          payload: bundle?.contractEnvelope?.payload,
          signature: bundle?.contractEnvelope?.signature,
        },
      });
      const v = verifyAgentContract({ ...bundle, ...pins, now: Date.now() });
      const scope = identities(v);
      return transaction(p, async records => {
        // Revalidate after lock/read work, with no unverified caller authority.
        verifyAgentContract({ ...bundle, ...pins, now: Date.now() });
        const acquired = records.filter(r => r.event === "ACQUIRED");
        const conflict = acquired.some(
          r =>
            scope.exclusive.some(k => r.exclusive.includes(k)) ||
            scope.bindings.some(([k, value]) =>
              r.bindings.some(([rk, rv]) => rk === k && rv !== value)
            )
        );
        if (conflict)
          return frozen({ acquired: false, reason: "SHARED_CLAIM_CONFLICT" });
        const token = randomUUID();
        const expiresAt = Math.min(
          Date.now() + leaseMs,
          Date.parse(v.contract.expiresAt),
          Date.parse(v.approval.expiresAt)
        );
        const body = {
          event: "ACQUIRED",
          token,
          supervisorId,
          ...scope,
          tenantId: v.contract.tenantId,
          jobId: v.contract.jobId,
          contractHash: v.contractHash,
          authorization: bundle,
          expiresAt,
          observedAt: new Date().toISOString(),
          ...(epoch ? { epochFence: epoch.getFence() } : {}),
        };
        if (epoch)
          await epoch.reserve(claimJournalHead(records), {
            claimToken: token,
            bundle,
            expiresAt,
            nextHead: nextHead(records, body),
            agentPublicKey: pins.agentKeys
              .get(v.contract.agentId)
              .export({ type: "spki", format: "pem" }),
          });
        const record = await append(p, records, body);
        tokens.add(token);
        return frozen({
          acquired: true,
          token,
          expiresAt,
          evidenceHash: record.hash,
        });
      });
    },
    async begin(token) {
      return transaction(p, async records => {
        const a = await active(records, token);
        requireValue(
          a.live && a.state.event === "ACQUIRED",
          "CLAIM_NOT_STARTABLE"
        );
        await advance(
          records,
          {
            event: "EXECUTING",
            token,
            supervisorId,
            observedAt: new Date().toISOString(),
          },
          token
        );
        return true;
      });
    },
    async assertActive(token) {
      return transaction(p, async records => {
        const a = await active(records, token);
        requireValue(
          a.live && a.state.event === "EXECUTING",
          "CLAIM_NOT_ACTIVE"
        );
        if (epoch) await epoch.check(claimJournalHead(records), token);
        return true;
      });
    },
    async withEffect(token, operationId, effect) {
      return transaction(p, async records => {
        const a = await active(records, token);
        requireValue(
          a.live && a.state.event === "EXECUTING",
          "CLAIM_NOT_ACTIVE"
        );
        return epoch
          ? epoch.withEffect(
              claimJournalHead(records),
              token,
              operationId,
              effect
            )
          : effect();
      });
    },
    getFence: () => epoch?.getFence() ?? null,
    async quarantine(token, reason) {
      requireValue(
        ["STOP_OR_UNCERTAIN", "WORKER_EXIT"].includes(reason),
        "INVALID_QUARANTINE_REASON"
      );
      return transaction(p, async records => {
        const a = await active(records, token);
        if (a.state.event !== "QUARANTINED")
          await advance(
            records,
            {
              event: "QUARANTINED",
              token,
              supervisorId,
              reason,
              observedAt: new Date().toISOString(),
            },
            token,
            true
          );
        return true;
      });
    },
    async inspect() {
      return transaction(p, async records => frozen(records));
    },
  });
}
