// Fresh attack harness. These are disposable local processes, never live agents.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import childProcess, { spawn } from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, rm, readFile, open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJSON, createPlanY } from "./plan-y.mjs";
import { createTrustedSupervisor } from "./trusted-supervisor.mjs";

const owner = generateKeyPairSync("ed25519"),
  issuer = generateKeyPairSync("ed25519");
const BASE = "da4a33ef14eebbe373568c61fd6c9ba428f25883";
const ids = ["NR-00001", "NR-00002"];
const context = {
  taskId: "audit_task",
  ownerId: "audit_owner",
  tenantId: "audit_tenant",
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const signed = (body, key) => {
  const payload = canonicalJSON(body);
  return {
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  };
};
async function setup(t) {
  const root = await mkdtemp(join(tmpdir(), "independent-supervisor-audit-"));
  let supervisor;
  t.after(async () => {
    if (supervisor) {
      // Baseline startup-cancellation defect can orphan its own child. Clean up
      // only these known disposable PIDs; never claim that cleanup was a pass.
      for (const id of ids) {
        const status = supervisor.getStatus(id);
        if (
          status?.pid &&
          !["STOPPED", "SPAWN_FAILED"].includes(status.phase)
        ) {
          try {
            process.kill(status.pid, "SIGKILL");
          } catch (e) {
            if (e.code !== "ESRCH") throw e;
          }
          await Promise.race([supervisor.waitForExit(id), sleep(1000)]);
        }
      }
      await supervisor.close();
    }
    await rm(root, { recursive: true, force: true });
  });
  supervisor = await createTrustedSupervisor({
    authorityKey: owner.publicKey,
    contractKey: issuer.publicKey,
    context,
    agentIds: ids,
    stateDirectory: root,
    leaseMs: 5000,
    operationMs: 2500,
  });
  return { supervisor, root };
}
function fixture(supervisor, id = ids[0]) {
  const now = Date.now();
  const scope = {
    target: "osiris-web/staging",
    commit: BASE,
    tools: ["read_fixture", "delayed_read_fixture"],
    zones: ["staging/fixtures"],
    rulesetHash: "b".repeat(64),
    budgets: { maxCalls: 4, maxTokens: 128, maxCostMicros: 100 },
  };
  const plan = {
    schema: "osiris.plan-y/v1",
    ...context,
    task: "Audit a disposable supervisor",
    version: 1,
    steps: ids.map((_, i) => ({
      id: `step_${i + 1}`,
      description: "Inspect fixture",
      purpose: "Challenge enforcement boundaries",
      justification: "Produce independent reproductions",
      dependencies: [],
      scope,
      risks: ["Boundary bypass"],
      expectedEvidence: ["Observed denial or actual process exit"],
    })),
  };
  const hash = createPlanY(JSON.stringify(plan)).hash;
  const approval = {
    schema: "osiris.plan-approval/v1",
    approvalId: "audit_approval",
    planHash: hash,
    planVersion: 1,
    ...context,
    issuedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60000).toISOString(),
  };
  const contract = {
    schema: "osiris.agent-contract/v1",
    contractId: `audit_contract_${id}`,
    approvalId: approval.approvalId,
    agentId: id,
    agentKeyHash: supervisor.getAgentDescriptor(id).keyHash,
    planHash: hash,
    planVersion: 1,
    ...context,
    stepId: `step_${ids.indexOf(id) + 1}`,
    jobId: `audit_job_${id}`,
    ...scope,
    issuedAt: approval.issuedAt,
    expiresAt: new Date(now + 30000).toISOString(),
  };
  return {
    plan,
    approval,
    contract,
    input: {
      planJson: JSON.stringify(plan),
      approvalEnvelope: signed(approval, owner.privateKey),
      contractEnvelope: signed(contract, issuer.privateKey),
    },
  };
}
async function started(t) {
  const x = await setup(t);
  const f = fixture(x.supervisor);
  assert.equal((await x.supervisor.start(f.input)).light, "GREEN");
  return { ...x, f };
}
function gone(pid) {
  assert.throws(
    () => process.kill(pid, 0),
    e => e.code === "ESRCH"
  );
}

for (const cancellation of ["stop", "close"])
  test(`audit: ${cancellation} while worker copy is pending must prevent a late spawn`, async t => {
    const x = await setup(t),
      f = fixture(x.supervisor);
    const original = fs.promises.copyFile;
    let entered, release;
    const reached = new Promise(resolve => {
        entered = resolve;
      }),
      held = new Promise(resolve => {
        release = resolve;
      });
    let starting;
    try {
      fs.promises.copyFile = async (...args) => {
        if (String(args[0]).endsWith("synthetic-supervised-worker.mjs")) {
          entered();
          await held;
        }
        return original(...args);
      };
      syncBuiltinESMExports();
      starting = x.supervisor.start(f.input);
      await reached;
      if (cancellation === "stop") await x.supervisor.stopAgent(ids[0]);
      else await x.supervisor.close();
      release();
      const result = await starting;
      t.diagnostic(
        JSON.stringify({
          cancellation,
          result: result.light,
          spawned: x.supervisor.getMetrics().spawned,
          status: x.supervisor.getStatus(ids[0]),
        })
      );
      assert.equal(result.light, "RED");
      assert.equal(x.supervisor.getMetrics().spawned, 0);
    } finally {
      fs.promises.copyFile = original;
      syncBuiltinESMExports();
      release();
      await starting;
    }
  });

test("audit: signed action deadline must still hold after adapter filesystem delay", async t => {
  const x = await started(t);
  const probe = await open(join(x.root, "audit-prototype-probe"), "w");
  const prototype = Object.getPrototypeOf(probe),
    original = prototype.stat;
  await probe.close();
  try {
    prototype.stat = async function (...args) {
      const info = await original.apply(this, args);
      if (info.isFile()) await sleep(1150);
      return info;
    };
    const result = await x.supervisor.dispatch(ids[0], {
      tool: "read_fixture",
      resourceId: "fixture-a",
    });
    t.diagnostic(
      JSON.stringify({
        actionDeadlineDelayed: true,
        result: result.light,
        effects: x.supervisor.getMetrics().adapterInvocations,
      })
    );
    assert.equal(result.light, "RED");
    assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
  } finally {
    prototype.stat = original;
  }
});

test("audit: failed spawn must not manufacture process-exit evidence", async t => {
  const x = await setup(t),
    original = childProcess.spawn;
  try {
    childProcess.spawn = (_executable, args, options) =>
      original("/nonexistent-osiris-audit-executable", args, options);
    syncBuiltinESMExports();
    assert.equal(
      (await x.supervisor.start(fixture(x.supervisor).input)).light,
      "RED"
    );
    const result = await x.supervisor.waitForExit(ids[0]);
    t.diagnostic(JSON.stringify({ spawnFailureEvidence: result }));
    assert.equal(result.observedExit, false);
    assert.equal(result.pid, null);
    assert.equal(x.supervisor.getMetrics().spawned, 0);
  } finally {
    childProcess.spawn = original;
    syncBuiltinESMExports();
  }
});

// Kernel-profile-only probe, not an application-API escape: run the exact
// bootstrap prefix and then challenge its native process-creation policy.
async function nativeProbe(t, syscall) {
  const bootstrap = await readFile(
    new URL("./synthetic-worker-bootstrap.py", import.meta.url),
    "utf8"
  );
  const marker = "# A dedicated bootstrap-only evidence pipe";
  assert.ok(bootstrap.includes(marker));
  const prefix = bootstrap.split(marker)[0];
  const spawnCode =
    syscall === "fork" ? "os.fork()" : "libc.syscall(56, 17, 0, 0, 0, 0)";
  const script =
    `import sys\nsys.argv=['audit', ${JSON.stringify(process.execPath)}, 'unused', ${JSON.stringify(String(process.getuid()))}]\n` +
    prefix +
    `\nimport time\ntry:\n child=${spawnCode}\n if child == -1: raise OSError(ctypes.get_errno(), 'clone rejected')\nexcept OSError as error:\n print(json.dumps({'denied':error.errno}),flush=True)\n raise SystemExit(0)\nif child == 0:\n os.close(1)\n os.close(2)\n time.sleep(3)\n os._exit(0)\nprint(json.dumps({'childPid':child}),flush=True)\ntime.sleep(3)\n`;
  const worker = spawn("/usr/bin/python3", ["-u", "-c", script], {
    env: {},
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childPid;
  t.after(async () => {
    for (const pid of [childPid, worker.pid])
      if (pid) {
        try {
          process.kill(pid, "SIGKILL");
        } catch (e) {
          if (e.code !== "ESRCH") throw e;
        }
      }
    await Promise.race([
      new Promise(resolve => worker.once("close", resolve)),
      sleep(100),
    ]);
  });
  const packet = await new Promise((resolve, reject) => {
    let text = "";
    const timer = setTimeout(() => reject(Error("NATIVE_PROBE_TIMEOUT")), 1500);
    worker.stdout.on("data", data => {
      text += data;
      if (text.includes("\n")) {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(text.trim()));
        } catch (e) {
          reject(e);
        }
      }
    });
    worker.on("error", reject);
  });
  childPid = packet.childPid;
  if (childPid) {
    process.kill(worker.pid, "SIGKILL");
    await new Promise(resolve => worker.once("close", resolve));
    assert.doesNotThrow(() => process.kill(childPid, 0));
    t.diagnostic(
      JSON.stringify({
        syscall,
        parentTerminated: true,
        descendantStillAlive: true,
        childPid,
      })
    );
  } else t.diagnostic(JSON.stringify({ syscall, deniedErrno: packet.denied }));
  return packet;
}
for (const syscall of ["fork", "process-clone"])
  test(`audit: kernel profile must deny native ${syscall}`, async t => {
    const packet = await nativeProbe(t, syscall);
    assert.equal(packet.denied, 1);
  });

test("characterization: independent state directories do not provide tenant-global replay prevention", async t => {
  const a = await setup(t),
    b = await setup(t);
  const fa = fixture(a.supervisor),
    fb = fixture(b.supervisor);
  assert.equal(fa.approval.planHash, fb.approval.planHash);
  const results = await Promise.all([
    a.supervisor.start(fa.input),
    b.supervisor.start(fb.input),
  ]);
  assert.ok(results.every(r => r.light === "GREEN"));
  t.diagnostic(
    "UNIMPLEMENTED: tenant-global once-only admission across independent stores; this characterization is not a security PASS."
  );
});
test("audit: changed plan, wrong host authority and expanded resource zone cannot spawn", async t => {
  const x = await setup(t),
    f = fixture(x.supervisor);
  const changed = JSON.parse(f.input.planJson);
  changed.steps[0].purpose = "Changed plan";
  assert.equal(
    (
      await x.supervisor.start({
        ...f.input,
        planJson: JSON.stringify(changed),
      })
    ).light,
    "RED"
  );
  const foreign = generateKeyPairSync("ed25519");
  assert.equal(
    (
      await x.supervisor.start({
        ...f.input,
        approvalEnvelope: signed(f.approval, foreign.privateKey),
      })
    ).light,
    "RED"
  );
  const expanded = { ...f.contract, zones: ["staging/restricted"] };
  assert.equal(
    (
      await x.supervisor.start({
        ...f.input,
        contractEnvelope: signed(expanded, issuer.privateKey),
      })
    ).light,
    "RED"
  );
  assert.equal(x.supervisor.getMetrics().spawned, 0);
});

test("audit: preserved state cannot silently restart as a fresh replay store", async t => {
  const x = await started(t);
  await x.supervisor.close();
  await assert.rejects(
    createTrustedSupervisor({
      authorityKey: owner.publicKey,
      contractKey: issuer.publicKey,
      context,
      agentIds: ids,
      stateDirectory: x.root,
    }),
    /PRIVATE_EMPTY_STATE_DIRECTORY_REQUIRED/
  );
  const records = await readFile(join(x.root, "events.jsonl"), "utf8");
  assert.ok(records.includes("PROCESS_EXIT_OBSERVED"));
});
test("audit: lost replay persistence denies an admitted worker before tool effects", async t => {
  const x = await started(t);
  await rm(join(x.root, "claims"), { recursive: true });
  assert.equal(
    (
      await x.supervisor.dispatch(ids[0], {
        tool: "read_fixture",
        resourceId: "fixture-a",
      })
    ).light,
    "RED"
  );
  const exit = await x.supervisor.waitForExit(ids[0]);
  assert.equal(exit.observedExit, true);
  gone(exit.pid);
  assert.equal(x.supervisor.getMetrics().adapterInvocations, 0);
  await assert.rejects(
    readFile(join(x.root, "claims")),
    e => e.code === "ENOENT"
  );
});
