import test from "node:test";
import assert from "node:assert/strict";
import { fork, ChildProcess } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  mkdir,
  cp,
  readdir,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canonicalJSON, createPlanY } from "./plan-y.mjs";
import {
  initializeSyntheticClaims,
  createSharedClaimClient,
} from "./shared-claims.mjs";
import { createTrustedSupervisor } from "./trusted-supervisor.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const owner = generateKeyPairSync("ed25519"),
  issuer = generateKeyPairSync("ed25519"),
  agent = generateKeyPairSync("ed25519");
const context = {
  tenantId: "synthetic_tenant",
  ownerId: "synthetic_owner",
  taskId: "shared_task",
};
const pem = key => key.export({ type: "spki", format: "pem" });
const signed = (body, key) => {
  const payload = canonicalJSON(body);
  return {
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  };
};
const verification = () => ({
  authorityKey: owner.publicKey,
  contractKey: issuer.publicKey,
  context,
  agentKeys: new Map([
    ["NR-00001", agent.publicKey],
    ["NR-00002", agent.publicKey],
  ]),
});
function bundle(descriptor, changes = {}) {
  const now = Date.now(),
    identity = { ...context, ...changes.context };
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
    ...identity,
    task: "Test shared exclusion",
    version: 1,
    steps: [1, 2].map(n => ({
      id: `step_${n}`,
      description: "Read synthetic fixture",
      purpose: "Prove exclusive claims",
      justification: "Non-production test",
      dependencies: [],
      scope,
      risks: ["Duplicate execution"],
      expectedEvidence: ["One winner"],
    })),
    ...changes.plan,
  };
  const hash = createPlanY(JSON.stringify(plan)).hash;
  const approval = {
    schema: "osiris.plan-approval/v1",
    ...identity,
    approvalId: "shared_approval",
    planHash: hash,
    planVersion: plan.version,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(),
    ...changes.approval,
  };
  const contract = {
    schema: "osiris.agent-contract/v1",
    ...identity,
    contractId: "shared_contract",
    approvalId: approval.approvalId,
    agentId: descriptor?.agentId ?? "NR-00001",
    agentKeyHash: descriptor?.keyHash ?? awaitHashAgent(),
    planHash: hash,
    planVersion: plan.version,
    stepId: "step_1",
    jobId: "shared_job",
    ...scope,
    issuedAt: approval.issuedAt,
    expiresAt: new Date(now + 30000).toISOString(),
    ...changes.contract,
  };
  return {
    planJson: JSON.stringify(plan),
    approvalEnvelope: signed(approval, owner.privateKey),
    contractEnvelope: signed(contract, issuer.privateKey),
  };
}
import { publicKeyFingerprint } from "./plan-y.mjs";
const awaitHashAgent = () => publicKeyFingerprint(agent.publicKey);
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "osiris-shared-claims-"));
  await mkdir(join(root, "store"), { mode: 0o700 });
  await mkdir(join(root, "witness"), { mode: 0o700 });
  const config = {
    directory: join(root, "store"),
    witnessDirectory: join(root, "witness"),
    storeId: "synthetic_store",
  };
  await initializeSyntheticClaims(config);
  t.after(() => rm(root, { recursive: true, force: true }));
  const client = async (supervisorId = "host_a", v = verification()) =>
    createSharedClaimClient({ ...config, supervisorId }, v);
  return { root, config, client };
}
function subprocess(t) {
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
  const pending = new Map();
  let seq = 0;
  child.stdout.resume();
  child.stderr.resume();
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
        const requestId = ++seq;
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error("FIXTURE_TIMEOUT"));
        }, 6000);
        pending.set(requestId, { resolve, reject, timer });
        child.send({ requestId, action, data });
      }),
  };
}
async function host(t, x, name, external = false) {
  const stateDirectory = join(x.root, name);
  await mkdir(stateDirectory, { mode: 0o700 });
  const opts = {
    authorityKey: pem(owner.publicKey),
    contractKey: pem(issuer.publicKey),
    context,
    agentIds: ["NR-00001"],
    stateDirectory,
    leaseMs: 5000,
    operationMs: 2500,
    sharedClaims: { ...x.config, supervisorId: name },
  };
  if (external) {
    const p = subprocess(t),
      descriptor = await p.call("supervisor", opts);
    return { ...p, descriptor };
  }
  const supervisor = await createTrustedSupervisor(opts);
  t.after(() => supervisor.close());
  return { supervisor, descriptor: supervisor.getAgentDescriptor("NR-00001") };
}
test("shared: two independent supervisor processes race one tenant job; one worker/effect only", async t => {
  const x = await setup(t),
    a = await host(t, x, "host_a", true),
    b = await host(t, x, "host_b", true);
  const one = bundle(a.descriptor),
    two = bundle(b.descriptor);
  // Same approval bytes; issuer binds independent keys in each contract.
  two.approvalEnvelope = one.approvalEnvelope;
  const results = await Promise.all([
    a.call("start", one),
    b.call("start", two),
  ]);
  assert.equal(results.filter(r => r.light === "GREEN").length, 1);
  const winner = results[0].light === "GREEN" ? a : b,
    loser = winner === a ? b : a;
  assert.equal(
    (
      await loser.call("dispatch", {
        tool: "read_fixture",
        resourceId: "fixture-a",
      })
    ).light,
    "RED"
  );
  assert.equal(
    (
      await winner.call("dispatch", {
        tool: "read_fixture",
        resourceId: "fixture-a",
      })
    ).light,
    "GREEN"
  );
  const metrics = await Promise.all([a.call("metrics"), b.call("metrics")]);
  assert.ok(metrics.every(m => m.claimMode === "SHARED_SYNTHETIC"));
  assert.equal(
    metrics.reduce((n, m) => n + m.spawned, 0),
    1
  );
  assert.equal(
    metrics.reduce((n, m) => n + m.adapterInvocations, 0),
    1
  );
  const exit = await winner.call("stop");
  assert.equal(exit.observedExit, true);
  assert.equal(exit.sharedQuarantinePersisted, true);
  assert.throws(
    () => process.kill(exit.pid, 0),
    e => e.code === "ESRCH"
  );
  await loser.call("stop");
  t.diagnostic(
    JSON.stringify({
      winners: 1,
      spawned: 1,
      effects: 1,
      pid: exit.pid,
      observedExit: exit.observedExit,
      sharedQuarantinePersisted: exit.sharedQuarantinePersisted,
    })
  );
});
test("shared: distinct Node clients contend through atomic filesystem exclusion", async t => {
  const x = await setup(t),
    processes = [];
  for (let n = 0; n < 6; n++) {
    const p = subprocess(t);
    await p.call("client", {
      config: { ...x.config, supervisorId: `host_${n}` },
      verification: {
        authorityKey: pem(owner.publicKey),
        contractKey: pem(issuer.publicKey),
        context,
        agentKeys: [["NR-00001", pem(agent.publicKey)]],
      },
    });
    processes.push(p);
  }
  const input = bundle();
  const outcomes = await Promise.allSettled(
    processes.map(p => p.call("acquire", { bundle: input, leaseMs: 5000 }))
  );
  assert.equal(
    outcomes.filter(r => r.status === "fulfilled" && r.value.acquired).length,
    1
  );
  const records = await (await x.client()).inspect();
  assert.equal(records.filter(r => r.event === "ACQUIRED").length, 1);
});
for (const conflict of ["jobId", "contractId", "agentId", "stepId"])
  test(`shared: ${conflict} remains exclusive even with other fresh identities`, async t => {
    const x = await setup(t),
      a = await x.client(),
      b = await x.client("host_b");
    const input = bundle();
    assert.equal((await a.acquire(input, 5000)).acquired, true);
    const contract = {
      jobId: "new_job_id",
      contractId: "new_contract",
      agentId: "NR-00002",
      stepId: "step_2",
    };
    contract[conflict] = JSON.parse(input.contractEnvelope.payload)[conflict];
    const other = bundle(null, { contract });
    other.approvalEnvelope = input.approvalEnvelope;
    assert.equal((await b.acquire(other, 5000)).acquired, false);
  });
test("shared: approval may authorize distinct steps but cannot be rebound to another plan/version", async t => {
  const x = await setup(t),
    a = await x.client();
  const input = bundle();
  await a.acquire(input, 5000);
  const other = bundle(null, {
    contract: {
      jobId: "new_job_id",
      contractId: "new_contract",
      agentId: "NR-00002",
      stepId: "step_2",
    },
  });
  other.approvalEnvelope = input.approvalEnvelope;
  assert.equal((await a.acquire(other, 5000)).acquired, true);
  const changed = bundle(null, {
    plan: { version: 2 },
    contract: {
      jobId: "third_job_id",
      contractId: "third",
      agentId: "NR-00002",
      stepId: "step_2",
    },
  });
  assert.equal((await a.acquire(changed, 5000)).acquired, false);
});
test("shared: tenant scoped identities do not collide across authenticated tenant namespaces", async t => {
  const x = await setup(t);
  await (await x.client()).acquire(bundle(), 5000);
  const v = verification();
  v.context = { ...context, tenantId: "another_tenant" };
  const b = await x.client("host_b", v);
  assert.equal(
    (await b.acquire(bundle(null, { context: v.context }), 5000)).acquired,
    true
  );
});
for (const invalid of ["signature", "tenant", "expired", "future"])
  test(`shared: ${invalid} authority cannot create any claim`, async t => {
    const x = await setup(t),
      a = await x.client();
    let input = bundle();
    if (invalid === "signature")
      input.contractEnvelope.signature = "A".repeat(88);
    if (invalid === "tenant")
      input = bundle(null, { context: { tenantId: "wrong_tenant" } });
    if (invalid === "expired")
      input = bundle(null, {
        contract: { expiresAt: new Date(Date.now() - 1).toISOString() },
      });
    if (invalid === "future")
      input = bundle(null, {
        approval: { issuedAt: new Date(Date.now() + 60000).toISOString() },
      });
    await assert.rejects(a.acquire(input, 5000));
    assert.equal((await a.inspect()).length, 1);
  });
test("shared: mutable bundle inputs are snapshotted before storage awaits", async t => {
  const x = await setup(t),
    a = await x.client();
  const input = bundle();
  const pending = a.acquire(input, 5000);
  input.contractEnvelope.payload = "{}";
  input.planJson = "{}";
  assert.equal((await pending).acquired, true);
});
test("shared: stale lease is not reclaimed and old token cannot begin/effect", async t => {
  const x = await setup(t),
    a = await x.client(),
    b = await x.client("host_b");
  const input = bundle();
  const claim = await a.acquire(input, 100);
  await sleep(130);
  await assert.rejects(a.begin(claim.token), /CLAIM_NOT_STARTABLE/);
  // Failed transition preserves lock as quarantine; no takeover.
  await assert.rejects(b.acquire(input, 5000));
});
test("shared: restart cannot adopt prior token or reuse a burned job", async t => {
  const x = await setup(t),
    a = await x.client();
  const input = bundle(),
    claim = await a.acquire(input, 5000);
  await a.begin(claim.token);
  await a.quarantine(claim.token, "STOP_OR_UNCERTAIN");
  const restarted = await x.client();
  assert.equal((await restarted.acquire(input, 5000)).acquired, false);
  await assert.rejects(restarted.assertActive(claim.token), /CLAIM_NOT_OWNED/);
});
test("shared: client death after claim leaves identities burned without automatic retry", async t => {
  const x = await setup(t),
    p = subprocess(t);
  await p.call("client", {
    config: { ...x.config, supervisorId: "crashed_host" },
    verification: {
      authorityKey: pem(owner.publicKey),
      contractKey: pem(issuer.publicKey),
      context,
      agentKeys: [["NR-00001", pem(agent.publicKey)]],
    },
  });
  const input = bundle();
  assert.equal(
    (await p.call("acquire", { bundle: input, leaseMs: 5000 })).acquired,
    true
  );
  p.child.kill("SIGKILL");
  await new Promise(r => p.child.once("exit", r));
  assert.equal((await (await x.client()).acquire(input, 5000)).acquired, false);
});
for (const lost of ["store", "witness"])
  test(`shared: lost ${lost} storage blocks worker effect and still observes process stop`, async t => {
    const x = await setup(t),
      h = await host(t, x, "host_a"),
      input = bundle(h.descriptor);
    assert.equal((await h.supervisor.start(input)).light, "GREEN");
    await rename(join(x.root, lost), join(x.root, `${lost}-offline`));
    assert.equal(
      (
        await h.supervisor.dispatch("NR-00001", {
          tool: "read_fixture",
          resourceId: "fixture-a",
        })
      ).light,
      "RED"
    );
    const exit = await h.supervisor.waitForExit("NR-00001");
    assert.equal(exit.observedExit, true);
    assert.equal(h.supervisor.getMetrics().adapterInvocations, 0);
    assert.throws(
      () => process.kill(exit.pid, 0),
      e => e.code === "ESRCH"
    );
  });
for (const snapshot of ["journal", "witness", "both"])
  test(`shared: restored ${snapshot} snapshot boundaries are explicit`, async t => {
    const x = await setup(t),
      a = await x.client(),
      input = bundle();
    await cp(x.config.directory, join(x.root, "store-snapshot"), {
      recursive: true,
    });
    await cp(x.config.witnessDirectory, join(x.root, "witness-snapshot"), {
      recursive: true,
    });
    await a.acquire(input, 5000);
    if (snapshot !== "witness") {
      await rm(x.config.directory, { recursive: true });
      await cp(join(x.root, "store-snapshot"), x.config.directory, {
        recursive: true,
      });
    }
    if (snapshot !== "journal") {
      await rm(x.config.witnessDirectory, { recursive: true });
      await cp(join(x.root, "witness-snapshot"), x.config.witnessDirectory, {
        recursive: true,
      });
    }
    if (snapshot === "both") {
      // Characterization: coherent rollback of BOTH trusted persistence domains
      // cannot be detected without an external monotonic epoch authority.
      const restored = await x.client("restored_host");
      assert.equal((await restored.acquire(input, 5000)).acquired, true);
      t.diagnostic(
        "AMBER: coherent journal+witness rollback is undetectable without external epoch custody; offline restore must never admit work"
      );
    } else
      await assert.rejects(
        x.client("restored_host"),
        /SNAPSHOT_OR_WITNESS_MISMATCH/
      );
  });
test("shared: tampered evidence or preexisting crash lock fails closed without repair", async t => {
  const x = await setup(t);
  const path = join(x.config.directory, "journal.jsonl");
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace("GENESIS", "TAMPERED")
  );
  await assert.rejects(x.client(), /CLAIM_CHAIN_INVALID/);
  assert.ok((await readdir(x.config.directory)).includes("exclusive.lock"));
});
test("shared: missing initialization is never recreated by client open", async t => {
  const x = await setup(t);
  await rm(join(x.config.directory, "journal.jsonl"));
  await assert.rejects(x.client());
  await assert.rejects(
    readFile(join(x.config.directory, "journal.jsonl")),
    e => e.code === "ENOENT"
  );
});
test("shared: lost durable witness acknowledgment burns claim and never returns acquired", async t => {
  const x = await setup(t),
    a = await x.client(),
    input = bundle();
  const original = fs.promises.open;
  fs.promises.open = async function (path, ...args) {
    const h = await original.call(this, path, ...args);
    if (String(path).includes("witness/000000000001.json")) {
      h.sync = async () => {
        throw new Error("SYNTHETIC_ACK_LOST");
      };
    }
    return h;
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(a.acquire(input, 5000), /SYNTHETIC_ACK_LOST/);
  } finally {
    fs.promises.open = original;
    syncBuiltinESMExports();
  }
  assert.ok((await readdir(x.config.directory)).includes("exclusive.lock"));
  await assert.rejects(x.client("restart"));
  assert.match(
    await readFile(join(x.config.directory, "journal.jsonl"), "utf8"),
    /ACQUIRED/
  );
});

test("shared: same task/version cannot acquire a different plan hash under a fresh approval", async t => {
  const x = await setup(t),
    a = await x.client(),
    input = bundle();
  await a.acquire(input, 5000);
  const changed = bundle(null, {
    plan: { task: "Different approved bytes" },
    approval: { approvalId: "different_approval" },
    contract: {
      agentId: "NR-00002",
      contractId: "different_contract",
      jobId: "different_job",
    },
  });
  assert.equal((await a.acquire(changed, 5000)).acquired, false);
});
test("shared: explicit reapproval requires new plan, approval, contract, agent and job; old evidence survives", async t => {
  const x = await setup(t),
    a = await x.client(),
    input = bundle(),
    claim = await a.acquire(input, 5000);
  await a.begin(claim.token);
  await a.quarantine(claim.token, "STOP_OR_UNCERTAIN");
  const before = await a.inspect();
  const replacement = bundle(null, {
    plan: { version: 2 },
    approval: { approvalId: "replacement_approval" },
    contract: {
      agentId: "NR-00002",
      contractId: "replacement_contract",
      jobId: "replacement_job",
    },
  });
  assert.equal((await a.acquire(replacement, 5000)).acquired, true);
  assert.deepEqual((await a.inspect()).slice(0, before.length), before);
  assert.equal((await a.acquire(input, 5000)).acquired, false);
});
test("shared: a crash while holding the writer lock blocks every restarted client", async t => {
  const x = await setup(t),
    p = subprocess(t);
  // SIGKILL a separate real process after it atomically creates the same lock.
  const { spawn } = await import("node:child_process");
  const holder = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {mkdir} from 'node:fs/promises';await mkdir(process.argv[1]);console.log('LOCKED');setInterval(()=>{},1000)`,
      join(x.config.directory, "exclusive.lock"),
    ],
    { env: {}, stdio: ["ignore", "pipe", "pipe"] }
  );
  t.after(() => holder.kill("SIGKILL"));
  await new Promise((resolve, reject) => {
    holder.stdout.once("data", resolve);
    holder.once("error", reject);
  });
  holder.kill("SIGKILL");
  await new Promise(r => holder.once("exit", r));
  await assert.rejects(x.client("restart"), e => e.code === "EEXIST");
  assert.equal(
    (await readdir(x.config.directory)).filter(n => n === "exclusive.lock")
      .length,
    1
  );
});
test("shared: hung revocation storage cannot delay observed worker termination or reopen claims", async t => {
  const x = await setup(t),
    h = await host(t, x, "host_a"),
    input = bundle(h.descriptor);
  assert.equal((await h.supervisor.start(input)).light, "GREEN");
  const original = fs.promises.open;
  let reached, release;
  const entered = new Promise(r => (reached = r)),
    held = new Promise(r => (release = r));
  fs.promises.open = async function (path, ...args) {
    const handle = await original.call(this, path, ...args);
    if (
      String(path) === join(x.config.directory, "journal.jsonl") &&
      args[0] === (fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
    ) {
      const read = handle.readFile.bind(handle);
      handle.readFile = async (...a) => {
        reached();
        await held;
        return read(...a);
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    const stopping = h.supervisor.stopAgent("NR-00001");
    await entered;
    const exit = await h.supervisor.waitForExit("NR-00001");
    assert.equal(exit.observedExit, true);
    assert.throws(
      () => process.kill(exit.pid, 0),
      e => e.code === "ESRCH"
    );
    const result = await stopping;
    assert.equal(result.sharedQuarantinePersisted, false);
    assert.equal(h.supervisor.getMetrics().unhealthy, true);
    assert.equal(
      (
        await h.supervisor.dispatch("NR-00001", {
          tool: "read_fixture",
          resourceId: "fixture-a",
        })
      ).light,
      "RED"
    );
  } finally {
    release();
    fs.promises.open = original;
    syncBuiltinESMExports();
    await sleep(30);
  }
});
test("shared: durable begin acknowledged after lease expiry cannot spawn a worker", async t => {
  const x = await setup(t),
    h = await host(t, x, "host_a"),
    input = bundle(h.descriptor, {
      contract: { expiresAt: new Date(Date.now() + 400).toISOString() },
    });
  const original = fs.promises.open;
  fs.promises.open = async function (path, ...args) {
    const handle = await original.call(this, path, ...args);
    if (String(path).includes("witness/000000000002.json")) {
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        await sleep(430);
        return sync();
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    assert.equal((await h.supervisor.start(input)).light, "RED");
    assert.equal(h.supervisor.getMetrics().spawned, 0);
  } finally {
    fs.promises.open = original;
    syncBuiltinESMExports();
  }
});
test("shared: expired worker lease stops execution without giving another supervisor the job", async t => {
  const x = await setup(t),
    h = await host(t, x, "host_a"),
    input = bundle(h.descriptor, {
      contract: { expiresAt: new Date(Date.now() + 650).toISOString() },
    });
  assert.equal((await h.supervisor.start(input)).light, "GREEN");
  const exit = await h.supervisor.waitForExit("NR-00001");
  assert.equal(exit.observedExit, true);
  assert.equal(
    (
      await h.supervisor.dispatch("NR-00001", {
        tool: "read_fixture",
        resourceId: "fixture-a",
      })
    ).light,
    "RED"
  );
  const other = await host(t, x, "host_b");
  const renewed = bundle(other.descriptor);
  assert.equal((await other.supervisor.start(renewed)).light, "RED");
  assert.equal(other.supervisor.getMetrics().spawned, 0);
});
test("shared: malformed configured storage never falls back to local-only admission", async t => {
  const x = await setup(t);
  const stateDirectory = join(x.root, "bad_host");
  await mkdir(stateDirectory, { mode: 0o700 });
  await assert.rejects(
    createTrustedSupervisor({
      authorityKey: owner.publicKey,
      contractKey: issuer.publicKey,
      context,
      agentIds: ["NR-00001"],
      stateDirectory,
      sharedClaims: null,
    })
  );
});
for (const behavior of ["crash", "timeout"])
  test(`shared: worker ${behavior} burns job and requires fresh reapproval`, async t => {
    const x = await setup(t),
      h = await host(t, x, "host_a"),
      input = bundle(h.descriptor);
    assert.equal((await h.supervisor.start(input)).light, "GREEN");
    assert.equal(
      (
        await h.supervisor.dispatch("NR-00001", {
          tool: "read_fixture",
          resourceId: "fixture-a",
          behavior,
        })
      ).light,
      "RED"
    );
    const exit = await h.supervisor.waitForExit("NR-00001");
    assert.equal(exit.observedExit, true);
    await h.supervisor.stopAgent("NR-00001");
    const other = await host(t, x, "host_b");
    assert.equal(
      (await other.supervisor.start(bundle(other.descriptor))).light,
      "RED"
    );
    assert.equal(other.supervisor.getMetrics().spawned, 0);
  });
test("shared: unconfirmed shutdown cannot release a job or permit a second worker", async t => {
  const x = await setup(t),
    h = await host(t, x, "host_a"),
    input = bundle(h.descriptor);
  assert.equal((await h.supervisor.start(input)).light, "GREEN");
  const pid = h.supervisor.getStatus("NR-00001").pid,
    original = ChildProcess.prototype.kill;
  try {
    ChildProcess.prototype.kill = () => true;
    const stop = await h.supervisor.stopAgent("NR-00001");
    assert.equal(stop.observedExit, false);
    assert.equal(stop.sharedQuarantinePersisted, true);
    assert.doesNotThrow(() => process.kill(pid, 0));
    assert.equal(
      (
        await h.supervisor.dispatch("NR-00001", {
          tool: "read_fixture",
          resourceId: "fixture-a",
        })
      ).light,
      "RED"
    );
    const other = await host(t, x, "host_b");
    assert.equal(
      (await other.supervisor.start(bundle(other.descriptor))).light,
      "RED"
    );
    assert.equal(other.supervisor.getMetrics().spawned, 0);
  } finally {
    ChildProcess.prototype.kill = original;
    process.kill(pid, "SIGKILL");
    await h.supervisor.waitForExit("NR-00001");
  }
});
test("shared: another client cannot substitute a disclosed claim token even with the same host name", async t => {
  const x = await setup(t),
    a = await x.client(),
    b = await x.client();
  const claim = await a.acquire(bundle(), 5000);
  await assert.rejects(b.begin(claim.token), /CLAIM_NOT_OWNED/);
});
test("shared: persisted authorization evidence retains exact signed receipts and frozen hash chain", async t => {
  const x = await setup(t),
    a = await x.client(),
    input = bundle();
  const claim = await a.acquire(input, 5000),
    records = await a.inspect();
  assert.deepEqual(records[1].authorization, input);
  assert.equal(records[1].hash, claim.evidenceHash);
  assert.ok(Object.isFrozen(records[1].authorization.approvalEnvelope));
  assert.throws(() => {
    records[1].authorization.planJson = "{}";
  }, TypeError);
  await assert.rejects(
    initializeSyntheticClaims(x.config),
    /FRESH_CLAIM_DIRECTORIES_REQUIRED/
  );
});
test("shared: lost begin acknowledgment returns RED with zero workers and a permanently burned claim", async t => {
  const x = await setup(t),
    h = await host(t, x, "host_a"),
    input = bundle(h.descriptor),
    original = fs.promises.open;
  fs.promises.open = async function (path, ...args) {
    const handle = await original.call(this, path, ...args);
    if (String(path).includes("witness/000000000002.json")) {
      handle.sync = async () => {
        throw new Error("SYNTHETIC_BEGIN_ACK_LOST");
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    assert.equal((await h.supervisor.start(input)).light, "RED");
    assert.equal(h.supervisor.getMetrics().spawned, 0);
  } finally {
    fs.promises.open = original;
    syncBuiltinESMExports();
  }
  assert.ok((await readdir(x.config.directory)).includes("exclusive.lock"));
  await assert.rejects(x.client("restart"));
});
