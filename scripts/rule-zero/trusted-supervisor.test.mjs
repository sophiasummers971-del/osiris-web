import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import {
  mkdtemp,
  rm,
  readFile,
  mkdir,
  writeFile,
  symlink,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTrustedSupervisor } from "./trusted-supervisor.mjs";
import { canonicalJSON, createPlanY } from "./plan-y.mjs";

const authority = generateKeyPairSync("ed25519"),
  issuer = generateKeyPairSync("ed25519");
const BASE = "da4a33ef14eebbe373568c61fd6c9ba428f25883";
const context = {
  taskId: "synthetic_task",
  ownerId: "synthetic_owner",
  tenantId: "synthetic_tenant",
};
const agentIds = ["NR-00001", "NR-00002", "NR-00003"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const signed = (body, key) => {
  const payload = canonicalJSON(body);
  return {
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  };
};
async function setup(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "osiris-supervisor-test-"));
  let supervisor;
  t.after(async () => {
    if (supervisor) await supervisor.close();
    await rm(root, { recursive: true, force: true });
  });
  const config = {
    authorityKey: authority.publicKey,
    contractKey: issuer.publicKey,
    context,
    agentIds,
    stateDirectory: root,
    ...overrides,
  };
  supervisor = await createTrustedSupervisor(config);
  return { supervisor, root, config };
}
function fixture(supervisor, agentId = "NR-00001", changes = {}) {
  const version = changes.version ?? 1,
    time = Date.now();
  const scope = {
    target: "osiris-web/staging",
    commit: BASE,
    tools: ["read_fixture", "hash_fixture", "delayed_read_fixture"],
    zones: ["staging/fixtures"],
    rulesetHash: "b".repeat(64),
    budgets: { maxCalls: 6, maxTokens: 256, maxCostMicros: 100 },
  };
  const plan = {
    schema: "osiris.plan-y/v1",
    ...context,
    task: "Inspect disposable synthetic resources",
    version,
    steps: agentIds.map((_, i) => ({
      id: `step_${i + 1}`,
      description: "Read a fixture",
      purpose: "Prove mediated resource access",
      justification: "Verify supervisor boundaries",
      dependencies: [],
      scope,
      risks: ["Synthetic resource could be out of scope"],
      expectedEvidence: ["Observed receipt and process exit"],
    })),
  };
  if (changes.plan) changes.plan(plan);
  const hash = createPlanY(JSON.stringify(plan)).hash;
  const approval = {
    schema: "osiris.plan-approval/v1",
    approvalId: `approval_${version}`,
    planHash: hash,
    planVersion: version,
    ...context,
    issuedAt: new Date(time - 1000).toISOString(),
    expiresAt: new Date(time + 60000).toISOString(),
  };
  const descriptor = supervisor.getAgentDescriptor(agentId);
  const contract = {
    schema: "osiris.agent-contract/v1",
    contractId: `contract_${version}_${agentId}`,
    approvalId: approval.approvalId,
    agentId,
    agentKeyHash: descriptor.keyHash,
    planHash: hash,
    planVersion: version,
    ...context,
    stepId: changes.stepId ?? `step_${agentIds.indexOf(agentId) + 1}`,
    jobId: `job_${version}_${agentId}`,
    ...scope,
    issuedAt: approval.issuedAt,
    expiresAt: new Date(time + 30000).toISOString(),
  };
  if (changes.approval) changes.approval(approval);
  if (changes.contract) changes.contract(contract);
  return {
    plan,
    approval,
    contract,
    input: {
      planJson: JSON.stringify(plan),
      approvalEnvelope: signed(approval, authority.privateKey),
      contractEnvelope: signed(contract, issuer.privateKey),
    },
  };
}
async function started(t, options = {}) {
  const x = await setup(t, options),
    f = fixture(x.supervisor);
  const result = await x.supervisor.start(f.input);
  if (result.light !== "GREEN")
    t.diagnostic(await readFile(join(x.root, "events.jsonl"), "utf8"));
  assert.equal(
    result.light,
    "GREEN",
    JSON.stringify({
      result,
      status: x.supervisor.getStatus("NR-00001"),
      metrics: x.supervisor.getMetrics(),
    })
  );
  return { ...x, f };
}
function assertGone(pid) {
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.throws(
    () => process.kill(pid, 0),
    error => error.code === "ESRCH"
  );
}
async function evidence(x, id = "NR-00001") {
  const e = await x.supervisor.waitForExit(id);
  assert.equal(e.observedExit, true);
  assertGone(e.pid);
  return e;
}
async function until(check) {
  const deadline = Date.now() + 2000;
  while (!check()) {
    if (Date.now() > deadline) throw Error("CONDITION_NOT_OBSERVED");
    await sleep(5);
  }
}

test("valid signed admission starts an observed isolated worker and executes one mediated fixture tool", async t => {
  const x = await started(t);
  const status = x.supervisor.getStatus("NR-00001");
  assert.equal(status.isolationObserved, true);
  assert.equal(status.revoked, false);
  assert.doesNotThrow(() => process.kill(status.pid, 0));
  const result = await x.supervisor.dispatch("NR-00001", {
    tool: "read_fixture",
    resourceId: "fixture-a",
  });
  assert.equal(result.light, "GREEN");
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 1);
  const termination = await x.supervisor.stopAgent("NR-00001");
  assert.equal(termination.observedExit, true);
  assertGone(status.pid);
  const log = (await readFile(join(x.root, "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.ok(
    log.some(
      e =>
        e.event === "PROCESS_EXIT_OBSERVED" &&
        e.pid === status.pid &&
        e.observedExit
    )
  );
  t.diagnostic(
    JSON.stringify({
      agentId: status.agentId,
      pid: status.pid,
      toolInvocations: 1,
      exitCode: termination.exitCode,
      signal: termination.signal,
      independentlyObservedAbsent: true,
    })
  );
});
test("kernel/Node worker isolation denies sockets, filesystem, child spawn and signaling its supervisor", async t => {
  const x = await started(t);
  const result = await x.supervisor.probeIsolation("NR-00001");
  assert.equal(result.light, "GREEN");
  assert.equal(result.evidence.network, "EPERM");
  assert.equal(result.evidence.fs, "ERR_ACCESS_DENIED");
  assert.equal(result.evidence.spawn, "ERR_ACCESS_DENIED");
  assert.equal(result.evidence.parentSignal, "EPERM");
  assert.equal(
    result.evidence.uid,
    x.supervisor.getStatus("NR-00001").workerUid
  );
  assert.ok(
    result.evidence.envKeys.every(k =>
      [
        "LC_CTYPE",
        "NODE_CHANNEL_FD",
        "NODE_CHANNEL_SERIALIZATION_MODE",
      ].includes(k)
    )
  );
});
for (const [name, change] of [
  ["wrong tenant", { contract: c => (c.tenantId = "attacker") }],
  [
    "expired approval",
    { approval: a => (a.expiresAt = new Date(Date.now() - 1).toISOString()) },
  ],
  ["expanded tools", { contract: c => (c.tools = ["shell"]) }],
])
  test(`${name} blocks before worker creation`, async t => {
    const x = await setup(t),
      f = fixture(x.supervisor, "NR-00001", change);
    assert.equal((await x.supervisor.start(f.input)).light, "RED");
    assert.equal(x.supervisor.getMetrics().spawned, 0);
  });
test("invalid signature and caller-provided execution callbacks cannot enter the supervisor", async t => {
  const x = await setup(t),
    f = fixture(x.supervisor);
  const bad = {
    ...f.input,
    approvalEnvelope: {
      ...f.input.approvalEnvelope,
      signature: "A".repeat(86) + "==",
    },
  };
  assert.equal((await x.supervisor.start(bad)).light, "RED");
  for (const key of [
    "runner",
    "requestLaunch",
    "credentialBroker",
    "toolRegistry",
    "verifyOwnerApproval",
  ])
    assert.equal(
      (await x.supervisor.start({ ...f.input, [key]: () => true })).light,
      "RED"
    );
  assert.equal(x.supervisor.getMetrics().spawned, 0);
});
for (const behavior of ["forged-identity", "forged-signature"])
  test(`worker ${behavior} is denied and its real process terminated`, async t => {
    const x = await started(t),
      pid = x.supervisor.getStatus("NR-00001").pid;
    const result = await x.supervisor.dispatch("NR-00001", {
      tool: "read_fixture",
      resourceId: "fixture-a",
      behavior,
    });
    assert.equal(result.light, "RED");
    await evidence(x);
    assertGone(pid);
    assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
  });
test("claimed permitted zone cannot authorize an actually restricted resource", async t => {
  const x = await started(t),
    pid = x.supervisor.getStatus("NR-00001").pid;
  const result = await x.supervisor.dispatch("NR-00001", {
    tool: "read_fixture",
    resourceId: "fixture-b",
    declaredZone: "staging/fixtures",
  });
  assert.equal(result.light, "RED");
  await evidence(x);
  assertGone(pid);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
  assert.equal(
    (
      await x.supervisor.dispatch("NR-00001", {
        tool: "read_fixture",
        resourceId: "fixture-a",
      })
    ).light,
    "RED"
  );
  assert.equal(x.supervisor.getStatus("NR-00001").revoked, true);
});
test("explicit authenticated zone violation stops worker before any adapter effect", async t => {
  const x = await started(t);
  assert.equal(
    (
      await x.supervisor.dispatch("NR-00001", {
        tool: "read_fixture",
        resourceId: "fixture-b",
        declaredZone: "staging/restricted",
      })
    ).light,
    "RED"
  );
  await evidence(x);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
});
test("unauthorized tool never reaches the synthetic effect point", async t => {
  const x = await started(t);
  assert.equal(
    (
      await x.supervisor.dispatch("NR-00001", {
        tool: "shell",
        resourceId: "fixture-a",
      })
    ).light,
    "RED"
  );
  await evidence(x);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
});
test("even an authority-approved unknown tool is absent from the host-owned registry", async t => {
  const x = await setup(t);
  const f = fixture(x.supervisor, "NR-00001", {
    plan: p =>
      p.steps.forEach(s => {
        s.scope.tools = ["shell"];
      }),
    contract: c => (c.tools = ["shell"]),
  });
  assert.equal((await x.supervisor.start(f.input)).light, "GREEN");
  assert.equal(
    (
      await x.supervisor.dispatch("NR-00001", {
        tool: "shell",
        resourceId: "fixture-a",
      })
    ).light,
    "RED"
  );
  await evidence(x);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
});
for (const resourceId of ["../../etc/passwd", "unknown-resource"])
  test(`resource ${resourceId} is not a path capability`, async t => {
    const x = await started(t);
    assert.equal(
      (
        await x.supervisor.dispatch("NR-00001", {
          tool: "read_fixture",
          resourceId,
        })
      ).light,
      "RED"
    );
    await evidence(x);
    assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
  });
test("agent-declared free usage cannot bypass adapter-derived resource charges", async t => {
  const x = await started(t);
  assert.equal(
    (
      await x.supervisor.dispatch("NR-00001", {
        tool: "read_fixture",
        resourceId: "fixture-a",
        tokens: 0,
        costMicros: 0,
      })
    ).light,
    "RED"
  );
  await evidence(x);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
});
test("symlink replacement and oversized resource remain blocked at the adapter", async t => {
  for (const type of ["symlink", "oversize"]) {
    const x = await started(t),
      file = join(x.root, "resources", "fixture-a.txt");
    if (type === "symlink") {
      await unlink(file);
      await symlink("/etc/passwd", file);
    } else await writeFile(file, "x".repeat(100));
    assert.equal(
      (
        await x.supervisor.dispatch("NR-00001", {
          tool: "read_fixture",
          resourceId: "fixture-a",
        })
      ).light,
      "RED"
    );
    await evidence(x);
    assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
  }
});
test("stop escalation proves SIGKILL when worker ignores SIGTERM", async t => {
  const x = await started(t, { scenario: "ignore-term" });
  const e = await x.supervisor.stopAgent("NR-00001");
  assert.equal(e.observedExit, true);
  assert.equal(e.signal, "SIGKILL");
  assertGone(e.pid);
});
test("crash invalidates lease, records exit code, and never replaces worker", async t => {
  const x = await started(t);
  assert.equal(
    (
      await x.supervisor.dispatch("NR-00001", {
        tool: "read_fixture",
        resourceId: "fixture-a",
        behavior: "crash",
      })
    ).light,
    "RED"
  );
  const e = await evidence(x);
  assert.equal(e.exitCode, 23);
  await sleep(100);
  assert.equal(x.supervisor.getMetrics().spawned, 1);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
  assert.equal((await x.supervisor.start(x.f.input)).light, "RED");
});
test("operation timeout terminates unresponsive process rather than just logging", async t => {
  const x = await started(t, { operationMs: 40 });
  assert.equal(
    (
      await x.supervisor.dispatch("NR-00001", {
        tool: "read_fixture",
        resourceId: "fixture-a",
        behavior: "timeout",
      })
    ).light,
    "RED"
  );
  await evidence(x);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
});
test("lease timeout independently stops an idle worker", async t => {
  const x = await started(t, { leaseMs: 120 });
  await evidence(x);
  assert.equal(x.supervisor.getStatus("NR-00001").revoked, true);
});
test("late prepared callback cannot execute after host revocation", async t => {
  const x = await started(t);
  const pending = x.supervisor.dispatch("NR-00001", {
    tool: "delayed_read_fixture",
    resourceId: "fixture-a",
  });
  await until(() => x.supervisor.getMetrics().adapterPrepared === 1);
  const e = await x.supervisor.stopAgent("NR-00001");
  assertGone(e.pid);
  assert.equal((await pending).light, "RED");
  await sleep(100);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
});
test("concurrent duplicate starts create exactly one worker", async t => {
  const x = await setup(t),
    f = fixture(x.supervisor);
  const results = await Promise.all([
    x.supervisor.start(f.input),
    x.supervisor.start(f.input),
  ]);
  assert.equal(results.filter(r => r.light === "GREEN").length, 1);
  assert.equal(x.supervisor.getMetrics().spawned, 1);
});
test("two distinct workers run concurrently; a third cannot exceed live-worker cap", async t => {
  const x = await setup(t);
  const results = await Promise.all([
    x.supervisor.start(fixture(x.supervisor, "NR-00001").input),
    x.supervisor.start(fixture(x.supervisor, "NR-00002").input),
  ]);
  assert.ok(results.every(r => r.light === "GREEN"));
  assert.notEqual(
    x.supervisor.getStatus("NR-00001").pid,
    x.supervisor.getStatus("NR-00002").pid
  );
  assert.equal(
    (await x.supervisor.start(fixture(x.supervisor, "NR-00003").input)).light,
    "RED"
  );
  const actions = await Promise.all([
    x.supervisor.dispatch("NR-00001", {
      tool: "read_fixture",
      resourceId: "fixture-a",
    }),
    x.supervisor.dispatch("NR-00002", {
      tool: "hash_fixture",
      resourceId: "fixture-a",
    }),
  ]);
  assert.ok(actions.every(r => r.light === "GREEN"));
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 2);
});
test("concurrent same-worker requests cannot cross-wire adapter context", async t => {
  const x = await started(t);
  const first = x.supervisor.dispatch("NR-00001", {
    tool: "delayed_read_fixture",
    resourceId: "fixture-a",
  });
  const second = await x.supervisor.dispatch("NR-00001", {
    tool: "read_fixture",
    resourceId: "fixture-b",
  });
  assert.equal(second.light, "RED");
  assert.equal((await first).light, "GREEN");
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 1);
});
test("revocation persistence failure still kills child and blocks further admission", async t => {
  const x = await started(t);
  const file = join(x.root, "events.jsonl");
  await rm(file);
  await mkdir(file);
  assert.equal(
    (
      await x.supervisor.dispatch("NR-00001", {
        tool: "read_fixture",
        resourceId: "fixture-b",
      })
    ).light,
    "RED"
  );
  const e = await evidence(x);
  assert.equal(e.auditPersisted, false);
  assert.equal(x.supervisor.getStatus("NR-00001").revoked, true);
  assert.equal(x.supervisor.getMetrics().unhealthy, true);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
  assert.equal(
    (await x.supervisor.start(fixture(x.supervisor, "NR-00002").input)).light,
    "RED"
  );
});
test("replacement is manual, needs new approved version and contract, and preserves prior evidence", async t => {
  const x = await started(t);
  await x.supervisor.stopAgent("NR-00001");
  const before = await readFile(join(x.root, "events.jsonl"), "utf8");
  await sleep(100);
  assert.equal(x.supervisor.getMetrics().spawned, 1);
  assert.equal((await x.supervisor.start(x.f.input)).light, "RED");
  const f = fixture(x.supervisor, "NR-00002", { version: 2, stepId: "step_1" });
  assert.equal((await x.supervisor.start(f.input)).light, "GREEN");
  assert.equal(x.supervisor.getMetrics().spawned, 2);
  assert.ok(
    (await readFile(join(x.root, "events.jsonl"), "utf8")).startsWith(before)
  );
  assert.equal(
    x.supervisor.getStatus("NR-00001").exitEvidence.observedExit,
    true
  );
});
test("host factory rejects injected capability providers", async t => {
  const x = await setup(t);
  for (const key of [
    "runner",
    "credentialBroker",
    "toolRegistry",
    "verifyOwnerApproval",
  ])
    await assert.rejects(
      createTrustedSupervisor({ ...x.config, [key]: () => true }),
      /HOST_NOT_CONFIGURED/
    );
});

test("reported signal success is not termination evidence when signaling fails", async t => {
  const { ChildProcess } = await import("node:child_process");
  const x = await started(t);
  const pid = x.supervisor.getStatus("NR-00001").pid;
  const original = ChildProcess.prototype.kill;
  try {
    // Test-only transport fault: pretend delivery succeeded without a signal.
    // No injectable kill callback is added to the supervisor's public API.
    ChildProcess.prototype.kill = () => true;
    const result = await x.supervisor.stopAgent("NR-00001");
    assert.equal(result.observedExit, false);
    assert.doesNotThrow(() => process.kill(pid, 0));
    assert.equal(x.supervisor.getStatus("NR-00001").phase, "STOP_UNVERIFIED");
    assert.equal(x.supervisor.getStatus("NR-00001").revoked, true);
    assert.equal(x.supervisor.getMetrics().unhealthy, true);
    assert.equal(
      (await x.supervisor.start(fixture(x.supervisor, "NR-00002").input)).light,
      "RED"
    );
    const records = (await readFile(join(x.root, "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(JSON.parse);
    assert.equal(
      records.some(r => r.event === "PROCESS_EXIT_OBSERVED" && r.pid === pid),
      false
    );
  } finally {
    ChildProcess.prototype.kill = original;
    process.kill(pid, "SIGKILL");
    await evidence(x);
  }
});

test("global revocation-audit failure blocks an already-prepared adapter effect", async t => {
  const x = await started(t);
  assert.equal(
    (await x.supervisor.start(fixture(x.supervisor, "NR-00002").input)).light,
    "GREEN"
  );
  const pending = x.supervisor.dispatch("NR-00001", {
    tool: "delayed_read_fixture",
    resourceId: "fixture-a",
  });
  await until(() => x.supervisor.getMetrics().adapterPrepared === 1);
  const file = join(x.root, "events.jsonl");
  await rm(file);
  await mkdir(file);
  await x.supervisor.stopAgent("NR-00002");
  assert.equal((await pending).light, "RED");
  await evidence(x);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
});

test("hung revocation journal cannot delay process termination indefinitely", async t => {
  const x = await started(t);
  const { open } = await import("node:fs/promises");
  const handle = await open(join(x.root, "prototype-probe"), "w");
  const prototype = Object.getPrototypeOf(handle),
    original = prototype.sync;
  await handle.close();
  let release;
  const held = new Promise(resolve => {
    release = resolve;
  });
  let stopping;
  try {
    // Test-only durable journal fault; no storage callback is exposed to agents.
    prototype.sync = function () {
      return held.then(() => original.call(this));
    };
    stopping = x.supervisor.stopAgent("NR-00001");
    const result = await Promise.race([stopping, sleep(600).then(() => null)]);
    assert.notEqual(result, null);
    assert.equal(result.observedExit, true);
    assert.equal(result.revocationPersisted, false);
    assertGone(x.supervisor.getStatus("NR-00001").pid);
    assert.equal(x.supervisor.getMetrics().unhealthy, true);
  } finally {
    prototype.sync = original;
    release();
    await stopping;
    await sleep(20);
  }
});
