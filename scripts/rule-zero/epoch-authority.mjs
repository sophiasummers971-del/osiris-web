// Synthetic external authority: separate private storage and signing identity.
// A real protected service/transport is a production dependency, not supplied here.
import {
  generateKeyPairSync,
  createPrivateKey,
  sign,
  randomUUID,
} from "node:crypto";
import { mkdir, readdir, realpath } from "node:fs/promises";
import { isAbsolute, resolve, join } from "node:path";
import {
  paths,
  privateDirectory,
  exclusiveFile,
  textFile,
  initializeLedger,
  transaction,
  append,
} from "./synthetic-ledger.mjs";
import {
  canonicalJSON,
  hashData,
  pinnedEd25519Key,
  publicKeyFingerprint,
  readSigned,
  verifyAgentContract,
  checkLifetime,
} from "./plan-y.mjs";
const need = (ok, reason) => {
  if (!ok) throw new Error(reason);
};
const id = x => typeof x === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(x);
const pem = key =>
  pinnedEd25519Key(key).export({ type: "spki", format: "pem" });
const signed = (body, key) => {
  const payload = canonicalJSON(body);
  return Object.freeze({
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  });
};
const head = records => ({
  seq: records.at(-1).seq,
  hash: records.at(-1).hash,
});
const same = (a, b) => {
  try {
    return canonicalJSON(a) === canonicalJSON(b);
  } catch {
    return false;
  }
};
const validHead = x =>
  x &&
  Object.keys(x).sort().join(",") === "hash,seq" &&
  Number.isSafeInteger(x.seq) &&
  x.seq >= 0 &&
  /^[a-f0-9]{64}$/.test(x.hash);
function ledger(config) {
  need(
    isAbsolute(config?.directory ?? "") && id(config?.authorityId),
    "EPOCH_AUTHORITY_CONFIGURATION_INVALID"
  );
  return paths({
    directory: join(config.directory, "records"),
    witnessDirectory: join(config.directory, "checkpoints"),
    storeId: config.authorityId,
    schema: "osiris.epoch-authority/v1",
  });
}
export async function separateEpochStorage(config, claim) {
  ledger(config);
  const epoch = await realpath(config.directory);
  for (const input of [claim.directory, claim.witnessDirectory]) {
    const path = await realpath(input);
    need(
      path !== epoch &&
        !path.startsWith(epoch + "/") &&
        !epoch.startsWith(path + "/"),
      "EXTERNAL_EPOCH_STORAGE_REQUIRED"
    );
  }
  return epoch;
}
async function signingKey(config) {
  await privateDirectory(config.directory);
  need(
    (await realpath(config.directory)) === resolve(config.directory),
    "EPOCH_AUTHORITY_PATH_CHANGED"
  );
  const key = createPrivateKey(
    await textFile(join(config.directory, "authority-key.pem"))
  );
  need(
    publicKeyFingerprint(key) === publicKeyFingerprint(config.publicKey),
    "EPOCH_AUTHORITY_KEY_MISMATCH"
  );
  return key;
}
async function record(p, records, body, key) {
  const envelope = signed(
    {
      ...body,
      authorityId: p.storeId,
      sequence: records.length,
      previousAuthorityHash: records.at(-1).hash,
    },
    key
  );
  return append(p, records, { event: body.event, envelope });
}
function stateOf(records, config) {
  const events = records.slice(1).map((r, i) => {
    const v = readSigned(r.envelope, config.publicKey);
    need(
      v.authorityId === config.authorityId &&
        v.sequence === i + 1 &&
        v.previousAuthorityHash === records[i].hash &&
        v.event === r.event,
      "AUTHORITY_RECORD_INVALID"
    );
    return v;
  });
  const init = events[0];
  need(init?.event === "INITIALIZED", "AUTHORITY_NOT_INITIALIZED");
  const state = {
    init,
    epoch: 1,
    storeId: init.storeId,
    claimHead: init.claimHead,
    fences: new Map(),
    claims: [],
    revoked: new Set(),
    effects: new Set(),
    events,
    authorityHead: head(records),
  };
  for (const e of events.slice(1)) {
    if (e.event === "FENCE_ISSUED") state.fences.set(e.supervisorId, e);
    else if (e.event === "CLAIM_RESERVED") {
      state.claims.push(e);
      state.claimHead = e.nextHead;
    } else if (e.event === "CLAIM_ADVANCED") {
      state.claimHead = e.nextHead;
      if (e.quarantine) state.revoked.add(e.claimToken);
    } else if (e.event === "EFFECT_INTENT")
      state.effects.add(canonicalJSON([e.claimToken, e.operationId]));
    else if (e.event === "RECOVERY_APPROVED") {
      state.epoch = e.toEpoch;
      state.storeId = e.targetStoreId;
      state.claimHead = e.targetHead;
      state.fences.clear();
    }
  }
  return state;
}
export async function initializeSyntheticEpochAuthority(config) {
  ledger(config);
  await privateDirectory(config.directory);
  need(
    !(await readdir(config.directory)).length &&
      validHead(config.claimHead) &&
      id(config.claimStoreId),
    "FRESH_EXTERNAL_AUTHORITY_REQUIRED"
  );
  const context = {
    tenantId: config.context?.tenantId,
    ownerId: config.context?.ownerId,
  };
  need(Object.values(context).every(id), "AUTHORITY_TENANT_REQUIRED");
  const supervisors = [...config.supervisorKeys].map(([name, key]) => {
    need(id(name), "INVALID_SUPERVISOR_ID");
    return [name, pem(key)];
  });
  need(
    supervisors.length > 0 &&
      new Set(supervisors.map(([name]) => name)).size === supervisors.length,
    "SUPERVISOR_REGISTRY_REQUIRED"
  );
  need(
    publicKeyFingerprint(config.ownerKey) !==
      publicKeyFingerprint(config.reconcilerKey),
    "INDEPENDENT_RECONCILER_REQUIRED"
  );
  const pair = generateKeyPairSync("ed25519");
  const descriptor = {
    directory: await realpath(config.directory),
    authorityId: config.authorityId,
    publicKey: pem(pair.publicKey),
  };
  await exclusiveFile(
    join(config.directory, "authority-key.pem"),
    pair.privateKey.export({ type: "pkcs8", format: "pem" })
  );
  await mkdir(join(config.directory, "records"), { mode: 0o700 });
  await mkdir(join(config.directory, "checkpoints"), { mode: 0o700 });
  const p = ledger(descriptor);
  await initializeLedger(p);
  await transaction(p, records =>
    record(
      p,
      records,
      {
        event: "INITIALIZED",
        context,
        storeId: config.claimStoreId,
        claimHead: config.claimHead,
        ownerKey: pem(config.ownerKey),
        contractKey: pem(config.contractKey),
        reconcilerKey: pem(config.reconcilerKey),
        supervisors,
      },
      pair.privateKey
    )
  );
  return Object.freeze(descriptor);
}
function scopeOf(v) {
  const c = v.contract,
    key = (kind, ...rest) => canonicalJSON([c.tenantId, kind, ...rest]);
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
function claimFor(s, r) {
  return s.claims.find(
    c =>
      c.claimToken === r.claimToken &&
      c.epoch === s.epoch &&
      c.fenceId === r.fenceId &&
      c.supervisorId === r.supervisorId &&
      !s.revoked.has(c.claimToken)
  );
}
// This host-only service function is not available over worker IPC.
async function request(config, envelope, effect) {
  const p = ledger(config),
    key = await signingKey(config);
  return transaction(p, async records => {
    const s = stateOf(records, config);
    let r;
    try {
      const unsigned = JSON.parse(envelope.payload);
      r = readSigned(
        envelope,
        new Map(s.init.supervisors).get(unsigned.supervisorId)
      );
    } catch {
      throw new Error("SUPERVISOR_PROOF_INVALID");
    }
    const respond = (ok, value) =>
      signed(
        {
          schema: "osiris.fencing-response/v1",
          authorityId: config.authorityId,
          nonce: r.nonce,
          action: r.action,
          epoch: s.epoch,
          ok,
          value,
        },
        key
      );
    const deny = reason => respond(false, { reason });
    if (
      r.authorityId !== config.authorityId ||
      !id(r.supervisorId) ||
      typeof r.nonce !== "string" ||
      s.events.some(e => e.requestNonce === r.nonce)
    )
      return deny("AUTHORITY_REQUEST_INVALID_OR_REPLAYED");
    if (
      r.storeId !== s.storeId ||
      !validHead(r.claimHead) ||
      !same(r.claimHead, s.claimHead)
    )
      return deny("CLAIM_GENERATION_OR_HEAD_STALE");
    if (r.action === "REGISTER") {
      const fenceId = randomUUID();
      await record(
        p,
        records,
        {
          event: "FENCE_ISSUED",
          requestNonce: r.nonce,
          epoch: s.epoch,
          supervisorId: r.supervisorId,
          fenceId,
          fencingCounter: records.length,
        },
        key
      );
      return respond(true, {
        epoch: s.epoch,
        fenceId,
        fencingCounter: records.length,
      });
    }
    const fence = s.fences.get(r.supervisorId);
    if (!fence || r.epoch !== s.epoch || r.fenceId !== fence.fenceId)
      return deny("SUPERVISOR_FENCED");
    if (r.action === "RESERVE") {
      let v;
      try {
        const c = JSON.parse(r.bundle.contractEnvelope.payload);
        v = verifyAgentContract({
          ...r.bundle,
          authorityKey: s.init.ownerKey,
          contractKey: s.init.contractKey,
          agentKeys: new Map([[c.agentId, r.agentPublicKey]]),
          context: { ...s.init.context, taskId: c.taskId },
          now: Date.now(),
        });
      } catch {
        return deny("EPOCH_APPROVAL_OR_CONTRACT_INVALID");
      }
      const scope = scopeOf(v);
      if (
        s.claims.some(
          c =>
            scope.exclusive.some(k => c.exclusive.includes(k)) ||
            scope.bindings.some(([k, value]) =>
              c.bindings.some(([other, old]) => k === other && value !== old)
            )
        )
      )
        return deny("EXTERNAL_IDENTITY_ALREADY_CONSUMED");
      const prior = s.claims.filter(
        c =>
          c.epoch < s.epoch &&
          c.tenantId === v.contract.tenantId &&
          c.taskId === v.contract.taskId
      );
      if (
        prior.some(
          c =>
            v.plan.version <= c.planVersion ||
            c.approvalId === v.approval.approvalId
        )
      )
        return deny("RECOVERY_REAPPROVAL_REQUIRED");
      if (
        !validHead(r.nextHead) ||
        r.nextHead.seq !== r.claimHead.seq + 1 ||
        typeof r.claimToken !== "string" ||
        !Number.isFinite(r.expiresAt) ||
        r.expiresAt > Date.parse(v.contract.expiresAt) ||
        r.expiresAt <= Date.now() ||
        r.expiresAt > Date.now() + 10000
      )
        return deny("EXTERNAL_CLAIM_INVALID");
      await record(
        p,
        records,
        {
          event: "CLAIM_RESERVED",
          requestNonce: r.nonce,
          epoch: s.epoch,
          fenceId: r.fenceId,
          supervisorId: r.supervisorId,
          claimToken: r.claimToken,
          tenantId: v.contract.tenantId,
          taskId: v.contract.taskId,
          planVersion: v.plan.version,
          approvalId: v.approval.approvalId,
          authorization: r.bundle,
          ...scope,
          nextHead: r.nextHead,
          expiresAt: r.expiresAt,
        },
        key
      );
      return respond(true, { reserved: true });
    }
    const claim = claimFor(s, r);
    if (!claim) return deny("EXTERNAL_CLAIM_NOT_ACTIVE");
    if (r.action === "ADVANCE") {
      if (!r.quarantine && claim.expiresAt <= Date.now())
        return deny("EXTERNAL_LEASE_EXPIRED");
      if (!validHead(r.nextHead) || r.nextHead.seq !== r.claimHead.seq + 1)
        return deny("CLAIM_ADVANCE_INVALID");
      await record(
        p,
        records,
        {
          event: "CLAIM_ADVANCED",
          requestNonce: r.nonce,
          epoch: s.epoch,
          claimToken: r.claimToken,
          nextHead: r.nextHead,
          quarantine: r.quarantine === true,
        },
        key
      );
      return respond(true, { advanced: true });
    }
    if (r.action !== "EFFECT" && r.action !== "CHECK")
      return deny("UNKNOWN_AUTHORITY_OPERATION");
    if (claim.expiresAt <= Date.now()) return deny("EXTERNAL_LEASE_EXPIRED");
    if (r.action === "CHECK") return respond(true, { current: true });
    const operation = canonicalJSON([r.claimToken, r.operationId]);
    if (
      typeof r.operationId !== "string" ||
      r.operationId.length > 96 ||
      s.effects.has(operation) ||
      typeof effect !== "function"
    )
      return deny("EFFECT_ALREADY_CONSUMED_OR_INVALID");
    const intent = await record(
      p,
      records,
      {
        event: "EFFECT_INTENT",
        requestNonce: r.nonce,
        epoch: s.epoch,
        fenceId: r.fenceId,
        supervisorId: r.supervisorId,
        claimToken: r.claimToken,
        operationId: r.operationId,
      },
      key
    );
    // The authority lock spans the actual fixed host adapter effect. Epoch
    // recovery/fence replacement cannot interleave between check and effect.
    const value = await effect();
    await record(
      p,
      [...records, intent],
      {
        event: "EFFECT_ACKNOWLEDGED",
        epoch: s.epoch,
        claimToken: r.claimToken,
        operationId: r.operationId,
        receiptId: value?.receiptId ?? null,
      },
      key
    );
    return respond(true, value);
  });
}
export async function createEpochClient(config, identity, claim) {
  // Copy host inputs and pin key bytes before the first asynchronous check.
  const key = createPrivateKey(config.supervisorPrivateKey),
    publicKey = pinnedEd25519Key(config.publicKey),
    authorityId = config.authorityId,
    directoryInput = config.directory,
    storeId = claim.storeId;
  const directory = await separateEpochStorage(
    { directory: directoryInput, authorityId },
    claim
  );
  const authority = { directory, authorityId, publicKey };
  let fence;
  async function call(action, claimHead, data = {}, effect) {
    const nonce = randomUUID();
    const envelope = signed(
      {
        authorityId: authority.authorityId,
        supervisorId: identity,
        storeId,
        action,
        nonce,
        claimHead,
        ...(fence ?? {}),
        ...data,
      },
      key
    );
    const response = readSigned(
      await request(authority, envelope, effect),
      publicKey
    );
    need(
      response.schema === "osiris.fencing-response/v1" &&
        response.authorityId === authority.authorityId &&
        response.nonce === nonce &&
        response.action === action,
      "FENCING_RESPONSE_INVALID"
    );
    need(
      response.ok === true,
      response.value?.reason ?? "EPOCH_AUTHORITY_DENIED"
    );
    if (action !== "REGISTER")
      need(response.epoch === fence.epoch, "FENCING_EPOCH_CHANGED");
    return response.value;
  }
  return Object.freeze({
    async register(claimHead) {
      need(!fence, "FENCE_ALREADY_REGISTERED");
      fence = Object.freeze(await call("REGISTER", claimHead));
      return fence;
    },
    reserve: (claimHead, data) => call("RESERVE", claimHead, data),
    advance: (claimHead, data) => call("ADVANCE", claimHead, data),
    check: (claimHead, claimToken) => call("CHECK", claimHead, { claimToken }),
    withEffect: (claimHead, claimToken, operationId, effect) =>
      call("EFFECT", claimHead, { claimToken, operationId }, effect),
    getFence: () => fence,
  });
}
export async function inspectSyntheticEpochAuthority(config) {
  return transaction(ledger(config), async records => {
    const s = stateOf(records, config);
    return Object.freeze({
      epoch: s.epoch,
      storeId: s.storeId,
      claimHead: Object.freeze({ ...s.claimHead }),
      authorityHead: Object.freeze({ ...s.authorityHead }),
      events: Object.freeze(s.events.map(e => Object.freeze(e))),
    });
  });
}
export async function recoverSyntheticEpoch(config, input) {
  // Copy envelopes before any asynchronous storage work.
  const envelopes = JSON.parse(JSON.stringify(input)),
    p = ledger(config),
    key = await signingKey(config);
  return transaction(p, async records => {
    const s = stateOf(records, config);
    let approval, reconciliation;
    try {
      approval = readSigned(envelopes.approvalEnvelope, s.init.ownerKey);
      reconciliation = readSigned(
        envelopes.reconciliationEnvelope,
        s.init.reconcilerKey
      );
      checkLifetime(approval, Date.now());
      checkLifetime(reconciliation, Date.now());
    } catch {
      return Object.freeze({
        recovered: false,
        reason: "RECOVERY_SIGNATURE_OR_LIFETIME_INVALID",
      });
    }
    const common = [
      "recoveryId",
      "authorityId",
      "tenantId",
      "ownerId",
      "fromEpoch",
      "toEpoch",
      "authorityHead",
      "targetStoreId",
      "targetHead",
    ];
    const valid =
      approval.schema === "osiris.epoch-recovery/v1" &&
      reconciliation.schema === "osiris.epoch-reconciliation/v1" &&
      common.every(k => same(approval[k], reconciliation[k])) &&
      approval.authorityId === config.authorityId &&
      approval.tenantId === s.init.context.tenantId &&
      approval.ownerId === s.init.context.ownerId &&
      approval.fromEpoch === s.epoch &&
      approval.toEpoch === s.epoch + 1 &&
      same(approval.authorityHead, s.authorityHead) &&
      validHead(approval.targetHead) &&
      id(approval.targetStoreId) &&
      id(approval.recoveryId) &&
      !s.events.some(
        e =>
          e.event === "RECOVERY_APPROVED" &&
          e.recoveryId === approval.recoveryId
      ) &&
      approval.reconciliationHash === hashData(reconciliation) &&
      reconciliation.allWorkersStopped === true &&
      reconciliation.uncertainExecutionQuarantined === true &&
      /^[a-f0-9]{64}$/.test(reconciliation.terminationEvidenceHash) &&
      /^[a-f0-9]{64}$/.test(reconciliation.effectsEvidenceHash);
    if (!valid)
      return Object.freeze({
        recovered: false,
        reason: "RECOVERY_BINDING_OR_RECONCILIATION_INVALID",
      });
    const entry = await record(
      p,
      records,
      {
        event: "RECOVERY_APPROVED",
        ...Object.fromEntries(common.map(k => [k, approval[k]])),
        approvalEnvelope: envelopes.approvalEnvelope,
        reconciliationEnvelope: envelopes.reconciliationEnvelope,
      },
      key
    );
    return Object.freeze({
      recovered: true,
      epoch: approval.toEpoch,
      evidenceHash: entry.hash,
    });
  });
}
export { head as claimJournalHead };
