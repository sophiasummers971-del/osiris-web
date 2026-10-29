// Generated keys and disposable fixture material only; not a production API.
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, mkdir, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fork } from "node:child_process";
import {
  canonicalJSON,
  createPlanY,
  publicKeyFingerprint,
  hashData,
} from "./plan-y.mjs";
import {
  initializeSyntheticClaims,
  createSharedClaimClient,
} from "./shared-claims.mjs";
import {
  initializeSyntheticEpochAuthority,
  inspectSyntheticEpochAuthority,
  claimJournalHead,
} from "./epoch-authority.mjs";
import { read, paths } from "./synthetic-ledger.mjs";
import { createTrustedSupervisor } from "./trusted-supervisor.mjs";
export const owner = generateKeyPairSync("ed25519"),
  issuer = generateKeyPairSync("ed25519"),
  reconciler = generateKeyPairSync("ed25519");
export const agents = new Map(
  [1, 2, 3].map(n => [`NR-0000${n}`, generateKeyPairSync("ed25519")])
);
export const supervisors = new Map(
  ["host_a", "host_b", "host_c", "host_d"].map(id => [
    id,
    generateKeyPairSync("ed25519"),
  ])
);
export const context = {
  tenantId: "epoch_tenant",
  ownerId: "epoch_owner",
  taskId: "epoch_task",
};
export const pem = key =>
  key.export({
    type: key.type === "private" ? "pkcs8" : "spki",
    format: "pem",
  });
export const signed = (body, key) => {
  const payload = canonicalJSON(body);
  return {
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  };
};
export function bundle(descriptor, changes = {}) {
  const time = Date.now(),
    version = changes.version ?? 1;
  const scope = {
    target: "osiris-web/staging",
    commit: "da4a33ef14eebbe373568c61fd6c9ba428f25883",
    tools: ["read_fixture", "delayed_read_fixture"],
    zones: ["staging/fixtures"],
    rulesetHash: "b".repeat(64),
    budgets: { maxCalls: 4, maxTokens: 128, maxCostMicros: 100 },
  };
  const plan = {
    schema: "osiris.plan-y/v1",
    ...context,
    task: "Verify epoch fencing",
    version,
    steps: [1, 2, 3].map(n => ({
      id: `step_${n}`,
      description: "Read disposable fixture",
      purpose: "Test authority boundaries",
      justification: "Non-production evidence",
      dependencies: [],
      scope,
      risks: ["Duplicate work"],
      expectedEvidence: ["Observed denial"],
    })),
  };
  const hash = createPlanY(JSON.stringify(plan)).hash;
  const approval = {
    schema: "osiris.plan-approval/v1",
    ...context,
    approvalId: `epoch_approval_${version}`,
    planHash: hash,
    planVersion: version,
    issuedAt: new Date(time - 1000).toISOString(),
    expiresAt: new Date(time + 60000).toISOString(),
    ...changes.approval,
  };
  const id = descriptor?.agentId ?? "NR-00001";
  const contract = {
    schema: "osiris.agent-contract/v1",
    ...context,
    contractId: `epoch_contract_${version}`,
    approvalId: approval.approvalId,
    agentId: id,
    agentKeyHash:
      descriptor?.keyHash ?? publicKeyFingerprint(agents.get(id).publicKey),
    planHash: hash,
    planVersion: version,
    stepId: "step_1",
    jobId: `epoch_job_${version}`,
    ...scope,
    issuedAt: approval.issuedAt,
    expiresAt: new Date(time + 30000).toISOString(),
    ...changes.contract,
  };
  return {
    planJson: JSON.stringify(plan),
    approvalEnvelope: signed(approval, owner.privateKey),
    contractEnvelope: signed(contract, issuer.privateKey),
  };
}
export const verification = () => ({
  authorityKey: owner.publicKey,
  contractKey: issuer.publicKey,
  context,
  agentKeys: new Map([...agents].map(([id, pair]) => [id, pair.publicKey])),
});
export async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "osiris-epoch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const claim = {
    directory: join(root, "claims"),
    witnessDirectory: join(root, "witness"),
    storeId: "epoch_store",
  };
  for (const path of [
    claim.directory,
    claim.witnessDirectory,
    join(root, "external-authority"),
  ])
    await mkdir(path, { mode: 0o700 });
  await initializeSyntheticClaims(claim);
  const genesis = claimJournalHead(await read(paths(claim)));
  const authority = await initializeSyntheticEpochAuthority({
    directory: join(root, "external-authority"),
    authorityId: "synthetic_epoch_authority",
    claimStoreId: claim.storeId,
    claimHead: genesis,
    context,
    ownerKey: owner.publicKey,
    contractKey: issuer.publicKey,
    reconcilerKey: reconciler.publicKey,
    supervisorKeys: new Map(
      [...supervisors].map(([id, k]) => [id, k.publicKey])
    ),
  });
  const config = (id = "host_a", store = claim) => ({
    ...store,
    supervisorId: id,
    epochAuthority: {
      ...authority,
      supervisorPrivateKey: pem(supervisors.get(id).privateKey),
    },
  });
  const client = (id = "host_a", store = claim) =>
    createSharedClaimClient(config(id, store), verification());
  return { root, claim, authority, genesis, config, client };
}
export async function host(
  t,
  x,
  id = "host_a",
  store = x.claim,
  agentId = "NR-00001",
  external = false
) {
  const stateDirectory = await mkdtemp(join(x.root, `worker-state-${id}-`));
  const options = {
    authorityKey: pem(owner.publicKey),
    contractKey: pem(issuer.publicKey),
    context,
    agentIds: [agentId],
    stateDirectory,
    leaseMs: 5000,
    operationMs: 2500,
    sharedClaims: x.config(id, store),
  };
  if (external) {
    const p = subprocess(t);
    const descriptor = await p.call("supervisor", options);
    return { ...p, descriptor };
  }
  const supervisor = await createTrustedSupervisor(options);
  t.after(() => supervisor.close());
  return { supervisor, descriptor: supervisor.getAgentDescriptor(agentId) };
}
export function subprocess(t) {
  const child = fork(
    new URL("./shared-claims-fixture.mjs", import.meta.url),
    [],
    {
      env: {
        PATH: process.env.PATH,
        NODE_OPTIONS: process.env.NODE_OPTIONS ?? "",
      },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    }
  );
  child.stdout.resume();
  child.stderr.resume();
  const pending = new Map();
  let seq = 0;
  child.on("message", m => {
    const p = pending.get(m.requestId);
    if (p) {
      pending.delete(m.requestId);
      clearTimeout(p.timer);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m.value);
    }
  });
  child.on("exit", () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("FIXTURE_EXIT"));
    }
    pending.clear();
  });
  t.after(async () => {
    child.kill("SIGKILL");
    if (child.exitCode === null && child.signalCode === null)
      await new Promise(r => child.once("exit", r));
  });
  return {
    child,
    call: (action, data) =>
      new Promise((resolve, reject) => {
        const requestId = ++seq,
          timer = setTimeout(() => {
            pending.delete(requestId);
            reject(new Error("FIXTURE_TIMEOUT"));
          }, 6000);
        pending.set(requestId, { resolve, reject, timer });
        child.send({ requestId, action, data });
      }),
  };
}
export async function recovery(x, target = x.claim, changes = {}) {
  const state = await inspectSyntheticEpochAuthority(x.authority),
    now = Date.now();
  const common = {
    recoveryId: `recovery_${state.epoch}`,
    authorityId: x.authority.authorityId,
    ...context,
    fromEpoch: state.epoch,
    toEpoch: state.epoch + 1,
    authorityHead: state.authorityHead,
    targetStoreId: target.storeId,
    targetHead: claimJournalHead(await read(paths(target))),
    ...changes.common,
  };
  delete common.taskId;
  const reconciliation = {
    schema: "osiris.epoch-reconciliation/v1",
    ...common,
    allWorkersStopped: true,
    uncertainExecutionQuarantined: true,
    terminationEvidenceHash: "c".repeat(64),
    effectsEvidenceHash: "d".repeat(64),
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 30000).toISOString(),
    ...changes.reconciliation,
  };
  const approval = {
    schema: "osiris.epoch-recovery/v1",
    ...common,
    reconciliationHash: hashData(reconciliation),
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 30000).toISOString(),
    ...changes.approval,
  };
  return {
    approvalEnvelope: signed(approval, owner.privateKey),
    reconciliationEnvelope: signed(reconciliation, reconciler.privateKey),
  };
}
export async function freshStore(x, name = "recovered") {
  const store = {
    directory: join(x.root, `${name}-claims`),
    witnessDirectory: join(x.root, `${name}-witness`),
    storeId: `${name}_store`,
  };
  await mkdir(store.directory, { mode: 0o700 });
  await mkdir(store.witnessDirectory, { mode: 0o700 });
  await initializeSyntheticClaims(store);
  return store;
}
export async function snapshot(x) {
  await cp(x.claim.directory, join(x.root, "saved-claims"), {
    recursive: true,
  });
  await cp(x.claim.witnessDirectory, join(x.root, "saved-witness"), {
    recursive: true,
  });
}
export async function restore(x) {
  await rm(x.claim.directory, { recursive: true });
  await rm(x.claim.witnessDirectory, { recursive: true });
  await cp(join(x.root, "saved-claims"), x.claim.directory, {
    recursive: true,
  });
  await cp(join(x.root, "saved-witness"), x.claim.witnessDirectory, {
    recursive: true,
  });
}
