import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, randomUUID } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  initializeOfflineBoundary,
  executeOfflineAppend,
  observeOfflineBoundary,
  completeOfflineEffect,
  freezeOfflineBoundary,
  recoverOfflineBoundary,
  openOfflineObserver,
  offlineRulesetHash,
} from "./offline-boundary.mjs";
import {
  canonicalJSON,
  createPlanY,
  hashData,
  readSigned,
  publicKeyFingerprint,
} from "./plan-y.mjs";
const BASE = "8840e61ad8a299be1062c3cc199f349d61aef7e0";
const script = fileURLToPath(
  new URL("./offline-boundary.mjs", import.meta.url)
);
const pem = k => k.export({ type: "spki", format: "pem" });
const signed = (body, key) => ({
  payload: canonicalJSON(body),
  signature: sign(null, Buffer.from(canonicalJSON(body)), key).toString(
    "base64"
  ),
});
function setup(t) {
  const owner = generateKeyPairSync("ed25519"),
    issuer = generateKeyPairSync("ed25519"),
    reconciler = generateKeyPairSync("ed25519"),
    agents = [generateKeyPairSync("ed25519"), generateKeyPairSync("ed25519")];
  const context = {
    tenantId: "offline_tenant",
    ownerId: "offline_owner",
    taskId: "offline_task",
  };
  const pins = {
    context,
    ownerKey: pem(owner.publicKey),
    contractKey: pem(issuer.publicKey),
    reconcilerKey: pem(reconciler.publicKey),
    agentKeys: {
      "NR-00001": pem(agents[0].publicKey),
      "NR-00002": pem(agents[1].publicKey),
    },
  };
  const root = initializeOfflineBoundary(pins);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, owner, issuer, reconciler, agents, context, pins };
}
function fixture(x, opt = {}) {
  const agent = opt.agent ?? 0,
    agentId = agent ? "NR-00002" : "NR-00001",
    version = opt.version ?? 1;
  const now = Date.now(),
    at = n => new Date(now + n).toISOString();
  const jobId = opt.jobId ?? "job_" + randomUUID(),
    operationId = "op_" + randomUUID();
  const args = {
    ...x.context,
    resourceId: "offline_resource",
    jobId,
    operationId,
    expectedVersion: opt.expectedVersion ?? 0,
    kind: "synthetic.marker.v1",
    marker: "disposable-marker",
  };
  delete args.ownerId;
  delete args.taskId;
  const scope = {
    target: "offline/db/synthetic_records",
    commit: BASE,
    tools: ["appendSynthetic"],
    zones: ["offline/synthetic/db"],
    rulesetHash: opt.rulesetHash ?? offlineRulesetHash,
    budgets: { maxCalls: 1, maxTokens: 0, maxCostMicros: 100000 },
  };
  const plan = {
    schema: "osiris.plan-y/v1",
    ...x.context,
    task: "Task X: append one disposable marker",
    version,
    steps: [
      {
        id: "step_one",
        description: "Append marker",
        purpose: "Test an offline boundary",
        justification: "No hosted access",
        dependencies: [],
        scope,
        risks: ["Unknown commit"],
        expectedEvidence: ["approved-arguments-sha256:" + hashData(args)],
      },
    ],
  };
  const approval = {
    schema: "osiris.plan-approval/v1",
    approvalId: opt.approvalId ?? "approval_" + randomUUID(),
    planHash: createPlanY(JSON.stringify(plan)).hash,
    planVersion: version,
    ...x.context,
    issuedAt: at(-100),
    expiresAt: at(60000),
  };
  const contract = {
    schema: "osiris.agent-contract/v1",
    contractId: opt.contractId ?? "contract_" + randomUUID(),
    approvalId: approval.approvalId,
    agentId,
    agentKeyHash: publicKeyFingerprint(x.agents[agent].publicKey),
    planHash: approval.planHash,
    planVersion: version,
    ...x.context,
    stepId: "step_one",
    jobId,
    ...scope,
    issuedAt: at(-100),
    expiresAt: at(30000),
  };
  const request = {
    schema: "osiris.offline-action/v1",
    tenantId: x.context.tenantId,
    agentId,
    jobId,
    operationId,
    argumentDigest: hashData(args),
    epoch: opt.epoch ?? 1,
    fence: opt.fence ?? 1,
    nonce: "nonce_" + randomUUID(),
    issuedAt: at(-50),
    expiresAt: at(10000),
  };
  const bundle = {
    planJson: JSON.stringify(plan),
    approvalEnvelope: signed(approval, x.owner.privateKey),
    contractEnvelope: signed(contract, x.issuer.privateKey),
    requestEnvelope: signed(request, x.agents[agent].privateKey),
    arguments: args,
  };
  return { bundle, plan, approval, contract, request };
}
function completion(x, operationId) {
  return signed(
    {
      schema: "osiris.offline-observation/v1",
      tenantId: x.context.tenantId,
      operationId,
      snapshotHash: hashData(observeOfflineBoundary(x.root)),
      nonce: "obs_" + randomUUID(),
    },
    x.reconciler.privateKey
  );
}
function done(x, f) {
  executeOfflineAppend(x.root, f.bundle);
  return completeOfflineEffect(x.root, completion(x, f.request.operationId));
}
function subprocess(root, request, extra = {}) {
  const child = spawn(process.execPath, [script, root], {
    env: { PATH: process.env.PATH, ...extra },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let out = "",
    err = "",
    readyResolve;
  const ready = new Promise(resolve => {
    readyResolve = resolve;
  });
  child.stdout.on("data", c => {
    out += c;
    if (out.includes("READY\n")) readyResolve();
  });
  child.stderr.on("data", c => {
    err += c;
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 6000);
  const result = once(child, "close").then(([code, signal]) => {
    clearTimeout(timeout);
    const line = out
      .trim()
      .split("\n")
      .filter(x => x !== "READY")
      .at(-1);
    return {
      code,
      signal,
      output: line ? JSON.parse(line) : null,
      stderr: err,
      pid: child.pid,
    };
  });
  child.stdin.end(JSON.stringify(request));
  return { ready, result, child };
}
async function waitPath(path) {
  const until = performance.now() + 4000;
  while (!existsSync(path)) {
    assert.ok(performance.now() < until, "barrier never reached");
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
test("offline fixture refuses live database options and identical reconciliation keys", t => {
  assert.throws(
    () => initializeOfflineBoundary({ url: "https://invalid.test" }),
    /INVALID_OFFLINE_PINS/
  );
  const x = setup(t);
  assert.throws(
    () =>
      initializeOfflineBoundary({ ...x.pins, reconcilerKey: x.pins.ownerKey }),
    /INDEPENDENT_RECONCILER/
  );
});
test("offline registry refuses shared agent keys and approval/issuer key substitution", t => {
  const x = setup(t);
  assert.throws(
    () =>
      initializeOfflineBoundary({
        ...x.pins,
        agentKeys: {
          "NR-00001": x.pins.agentKeys["NR-00001"],
          "NR-00002": x.pins.agentKeys["NR-00001"],
        },
      }),
    /KEY_REUSE/
  );
  assert.throws(
    () =>
      initializeOfflineBoundary({ ...x.pins, contractKey: x.pins.ownerKey }),
    /KEY_REUSE/
  );
});
test("offline: authorized append is atomic and completion requires a signed matching observation", t => {
  const x = setup(t),
    f = fixture(x);
  assert.equal(
    executeOfflineAppend(x.root, f.bundle).decision,
    "EFFECT_COMMITTED_COMPLETION_PENDING"
  );
  const s = observeOfflineBoundary(x.root);
  assert.equal(s.effects.length, 1);
  assert.equal(s.audit.length, 1);
  assert.equal(s.gate.version, 1);
  assert.equal(s.intents[0].status, "INTENT");
  assert.equal(s.intents[0].bodyHash, hashData(f.bundle));
  const bad = completion(x, f.request.operationId);
  const body = JSON.parse(bad.payload);
  body.snapshotHash = "0".repeat(64);
  assert.throws(
    () => completeOfflineEffect(x.root, signed(body, x.reconciler.privateKey)),
    /OBSERVATION_INVALID/
  );
  const observation = completion(x, f.request.operationId);
  const completed = completeOfflineEffect(x.root, observation);
  assert.equal(completed.decision, "VERIFIED_COMPLETE_SYNTHETIC_ONLY");
  assert.equal(observeOfflineBoundary(x.root).intents[0].status, "COMPLETE");
  assert.match(
    readFileSync(join(x.root, "checkpoint/events.jsonl"), "utf8"),
    /OBSERVED_COMPLETE/
  );
  if (process.env.OSIRIS_OFFLINE_EVIDENCE_PATH) {
    const blocked = [];
    for (const [name, mutate] of [
      [
        "missing-owner-approval",
        b => {
          b.approvalEnvelope = null;
        },
      ],
      [
        "stale-resource-fence",
        b => {
          const q = JSON.parse(b.requestEnvelope.payload);
          q.fence = 0;
          b.requestEnvelope = signed(q, x.agents[0].privateKey);
        },
      ],
    ]) {
      const b = JSON.parse(JSON.stringify(f.bundle));
      mutate(b);
      let reason;
      try {
        executeOfflineAppend(x.root, b);
      } catch (e) {
        reason = e.message;
      }
      assert.ok(reason);
      assert.equal(observeOfflineBoundary(x.root).effects.length, 1);
      blocked.push({ name, denied: true, effectDelta: 0, reason });
    }
    writeFileSync(
      process.env.OSIRIS_OFFLINE_EVIDENCE_PATH,
      JSON.stringify(
        {
          schema: "osiris.offline-evidence/v1",
          capturedAt: new Date().toISOString(),
          scope: "SELF_CONTAINED_SYNTHETIC_FIXTURE_NOT_INDEPENDENT_CUSTODY",
          referenceCommit: BASE,
          adapterRulesetHash: offlineRulesetHash,
          publicPins: x.pins,
          bundle: f.bundle,
          observation,
          completed,
          beforeCompletion: s,
          afterCompletion: observeOfflineBoundary(x.root),
          blocked,
          checkpoint: readFileSync(
            join(x.root, "checkpoint/events.jsonl"),
            "utf8"
          )
            .trim()
            .split("\n")
            .map(JSON.parse),
        },
        null,
        2
      ) + "\n"
    );
  }
});
for (const [name, mutate] of [
  [
    "missing approval",
    (x, f) => {
      f.bundle.approvalEnvelope = null;
    },
  ],
  [
    "forged approval key",
    (x, f) => {
      f.bundle.approvalEnvelope = signed(f.approval, x.issuer.privateKey);
    },
  ],
  [
    "changed plan",
    (x, f) => {
      f.plan.version++;
      f.bundle.planJson = JSON.stringify(f.plan);
    },
  ],
  [
    "wrong tenant",
    (x, f) => {
      f.request.tenantId = "wrong_tenant";
      f.bundle.requestEnvelope = signed(f.request, x.agents[0].privateKey);
    },
  ],
  [
    "forged agent",
    (x, f) => {
      f.bundle.requestEnvelope = signed(f.request, x.agents[1].privateKey);
    },
  ],
  [
    "expanded tool",
    (x, f) => {
      f.contract.tools = ["arbitraryShell"];
      f.bundle.contractEnvelope = signed(f.contract, x.issuer.privateKey);
    },
  ],
  [
    "changed authorized arguments",
    (x, f) => {
      f.bundle.arguments.marker = "changed";
      f.request.argumentDigest = hashData(f.bundle.arguments);
      f.bundle.requestEnvelope = signed(f.request, x.agents[0].privateKey);
    },
  ],
  [
    "expired approval",
    (x, f) => {
      f.approval.expiresAt = new Date(Date.now() - 1).toISOString();
      f.bundle.approvalEnvelope = signed(f.approval, x.owner.privateKey);
    },
  ],
  [
    "stale epoch",
    (x, f) => {
      f.request.epoch = 0;
      f.bundle.requestEnvelope = signed(f.request, x.agents[0].privateKey);
    },
  ],
  [
    "stale fence",
    (x, f) => {
      f.request.fence = 0;
      f.bundle.requestEnvelope = signed(f.request, x.agents[0].privateKey);
    },
  ],
  [
    "extra callback",
    (x, f) => {
      f.bundle.runner = "caller_runner";
    },
  ],
])
  test("offline denies " + name + " before durable intent/effect", t => {
    const x = setup(t),
      f = fixture(x);
    mutate(x, f);
    assert.throws(() => executeOfflineAppend(x.root, f.bundle));
    const s = observeOfflineBoundary(x.root);
    assert.equal(s.effects.length, 0);
    assert.equal(s.intents.length, 0);
  });
test("offline rejects an owner-signed unknown ruleset at the fixed adapter", t => {
  const x = setup(t),
    f = fixture(x, { rulesetHash: "c".repeat(64) });
  assert.throws(
    () => executeOfflineAppend(x.root, f.bundle),
    /APPROVED_SCOPE_INVALID/
  );
  assert.equal(observeOfflineBoundary(x.root).effects.length, 0);
});
test("offline observer connection denies direct DML, DDL, PRAGMA reset and ATTACH", t => {
  const x = setup(t),
    observer = openOfflineObserver(x.root);
  t.after(() => observer.close());
  assert.equal(observer.query("SELECT * FROM effects").length, 0);
  for (const sql of [
    "INSERT INTO effects VALUES('x','x','x','x')",
    "DELETE FROM effects",
    "CREATE TABLE bypass(x)",
    "PRAGMA query_only=OFF",
    "ATTACH DATABASE ':memory:' AS bypass",
  ])
    assert.throws(() => observer.query(sql), /authorized|readonly/);
  assert.equal(observeOfflineBoundary(x.root).effects.length, 0);
});
for (const identity of ["jobId", "contractId", "approvalId"])
  test(
    "offline consumed " + identity + " survives a valid new operation",
    t => {
      const x = setup(t),
        first = fixture(x);
      done(x, first);
      const second = fixture(x, {
        agent: 1,
        version: 2,
        expectedVersion: 1,
        [identity]:
          identity === "jobId"
            ? first.contract.jobId
            : first[identity === "contractId" ? "contract" : "approval"][
                identity
              ],
      });
      assert.throws(
        () => executeOfflineAppend(x.root, second.bundle),
        /UNIQUE/
      );
      assert.equal(observeOfflineBoundary(x.root).effects.length, 1);
    }
  );
test("offline: two independent processes race one job and only one effect commits", async t => {
  const x = setup(t),
    f = fixture(x),
    env = { OSIRIS_OFFLINE_START_BARRIER: "1" };
  const a = subprocess(x.root, { action: "append", bundle: f.bundle }, env);
  const b = subprocess(x.root, { action: "append", bundle: f.bundle }, env);
  await Promise.all([a.ready, b.ready]);
  writeFileSync(join(x.root, "start"), "1");
  const results = await Promise.all([a.result, b.result]);
  assert.notEqual(results[0].pid, results[1].pid);
  assert.equal(results.filter(x => x.output?.ok).length, 1);
  const s = observeOfflineBoundary(x.root);
  assert.equal(s.effects.length, 1);
  assert.equal(s.intents.length, 1);
});
test("offline freeze serializes after an already locked effect and denies later callbacks", async t => {
  const x = setup(t),
    f = fixture(x);
  const effect = subprocess(
    x.root,
    { action: "append", bundle: f.bundle },
    { OSIRIS_OFFLINE_FAULT: "resource-barrier" }
  );
  await waitPath(join(x.root, "resource-locked"));
  const freeze = subprocess(x.root, { action: "freeze" });
  writeFileSync(join(x.root, "release-resource"), "1");
  assert.equal((await effect.result).output.ok, true);
  assert.equal((await freeze.result).output.result.decision, "RESOURCE_FROZEN");
  assert.throws(() => executeOfflineAppend(x.root, f.bundle), /FROZEN/);
  assert.equal(observeOfflineBoundary(x.root).effects.length, 1);
});
test("offline freeze before resource lock prevents the effect", t => {
  const x = setup(t),
    f = fixture(x);
  freezeOfflineBoundary(x.root);
  assert.throws(() => executeOfflineAppend(x.root, f.bundle), /FROZEN/);
  assert.equal(observeOfflineBoundary(x.root).effects.length, 0);
});
for (const [point, rows] of [
  ["before-commit", 0],
  ["after-commit", 1],
  ["audit", 0],
  ["intent-checkpoint", 0],
])
  test(
    "offline interrupted " +
      point +
      " preserves intent, observed count and quarantine",
    async t => {
      const x = setup(t),
        f = fixture(x);
      const result = await subprocess(
        x.root,
        { action: "append", bundle: f.bundle },
        { OSIRIS_OFFLINE_FAULT: point }
      ).result;
      assert.notEqual(result.code, 0);
      const s = observeOfflineBoundary(x.root);
      assert.equal(s.effects.length, rows);
      assert.equal(s.audit.length, rows);
      assert.equal(s.intents.length, 1);
      assert.equal(s.intents[0].status, "INTENT");
      assert.throws(() => executeOfflineAppend(x.root, fixture(x).bundle));
      assert.equal(observeOfflineBoundary(x.root).effects.length, rows);
    }
  );
test("offline completion-checkpoint outage never reports success or retries an existing effect", async t => {
  const x = setup(t),
    f = fixture(x);
  executeOfflineAppend(x.root, f.bundle);
  const result = await subprocess(
    x.root,
    { action: "complete", envelope: completion(x, f.request.operationId) },
    { OSIRIS_OFFLINE_FAULT: "completion-checkpoint" }
  ).result;
  assert.equal(result.output.ok, false);
  assert.match(result.output.reason, /CHECKPOINT_UNAVAILABLE/);
  let s = observeOfflineBoundary(x.root);
  assert.equal(s.effects.length, 1);
  assert.equal(s.intents[0].status, "INTENT");
  assert.throws(() => executeOfflineAppend(x.root, f.bundle));
  completeOfflineEffect(x.root, completion(x, f.request.operationId));
  s = observeOfflineBoundary(x.root);
  assert.equal(s.effects.length, 1);
  assert.equal(s.intents[0].status, "COMPLETE");
});
test("offline signed recovery preserves burned IDs and demands fresh approved plan/version/agent", async t => {
  const x = setup(t),
    first = fixture(x);
  await subprocess(
    x.root,
    { action: "append", bundle: first.bundle },
    { OSIRIS_OFFLINE_FAULT: "before-commit" }
  ).result;
  freezeOfflineBoundary(x.root);
  const body = {
    schema: "osiris.offline-recovery/v1",
    tenantId: x.context.tenantId,
    fromEpoch: 1,
    toEpoch: 2,
    snapshotHash: hashData(observeOfflineBoundary(x.root)),
    nonce: "recovery_" + randomUUID(),
  };
  const owner = signed(body, x.owner.privateKey),
    reconciler = signed(body, x.reconciler.privateKey);
  assert.throws(() =>
    recoverOfflineBoundary(x.root, { owner, reconciler: owner })
  );
  assert.equal(recoverOfflineBoundary(x.root, { owner, reconciler }).epoch, 2);
  assert.throws(() => recoverOfflineBoundary(x.root, { owner, reconciler }));
  assert.throws(() => executeOfflineAppend(x.root, first.bundle));
  const oldPlan = fixture(x, { epoch: 2, fence: 2, agent: 1 });
  assert.throws(() => executeOfflineAppend(x.root, oldPlan.bundle), /SCOPE/);
  const fresh = fixture(x, { epoch: 2, fence: 2, agent: 1, version: 2 });
  done(x, fresh);
  const s = observeOfflineBoundary(x.root);
  assert.equal(s.effects.length, 1);
  assert.equal(s.intents.length, 2);
  assert.equal(
    s.intents.find(i => i.jobId === first.request.jobId).status,
    "RESOLVED"
  );
  assert.match(
    readFileSync(join(x.root, "checkpoint/events.jsonl"), "utf8"),
    /RECOVERED/
  );
});
test("offline resource and checkpoint rollback are denied against intact external authority", t => {
  const x = setup(t),
    db = join(x.root, "resource/state.db"),
    cp = join(x.root, "checkpoint/events.jsonl");
  const oldDb = readFileSync(db),
    oldCp = readFileSync(cp);
  done(x, fixture(x));
  const currentCp = readFileSync(cp);
  writeFileSync(db, oldDb);
  writeFileSync(cp, oldCp);
  assert.throws(
    () => executeOfflineAppend(x.root, fixture(x).bundle),
    /CHECKPOINT_ROLLBACK/
  );
  writeFileSync(cp, currentCp);
  assert.throws(
    () => executeOfflineAppend(x.root, fixture(x, { agent: 1 }).bundle),
    /RESOURCE_ROLLBACK/
  );
  assert.equal(observeOfflineBoundary(x.root).intents.length, 1);
});
test("offline missing store is never silently recreated", t => {
  const x = setup(t),
    path = join(x.root, "external/state.db");
  rmSync(path);
  assert.throws(() => executeOfflineAppend(x.root, fixture(x).bundle));
  assert.equal(existsSync(path), false);
});
test("offline existing Linux permission/seccomp profile denies DB read, network and parent signal", async t => {
  const x = setup(t),
    publicRoot = mkdtempSync(join(tmpdir(), "osiris-offline-probe-"));
  chmodSync(publicRoot, 0o755);
  t.after(() => rmSync(publicRoot, { recursive: true, force: true }));
  const worker = join(publicRoot, "probe.mjs");
  copyFileSync(
    fileURLToPath(new URL("./offline-permission-probe.mjs", import.meta.url)),
    worker
  );
  chmodSync(worker, 0o444);
  const bootstrap = fileURLToPath(
    new URL("./synthetic-worker-bootstrap.py", import.meta.url)
  );
  // Match the existing trusted supervisor's capability selection. uid=0 alone
  // is not evidence that this container may change group/user identities.
  const status = readFileSync("/proc/self/status", "utf8");
  const caps = BigInt("0x" + /^CapEff:\s*([a-f0-9]+)/im.exec(status)[1]);
  const mapped = readFileSync("/proc/self/uid_map", "utf8")
    .trim()
    .split("\n")
    .some(line => {
      const [inside, , count] = line.trim().split(/\s+/).map(Number);
      return 65534 >= inside && 65534 < inside + count;
    });
  const separateUid =
    process.getuid() === 0 && mapped && (caps & 193n) === 193n;
  assert.ok(
    separateUid || caps === 0n,
    "CAPABILITYLESS_WORKER_PROFILE_UNAVAILABLE"
  );
  t.diagnostic(
    "uidSeparationAvailable=" +
      separateUid +
      "; same-UID/root compromise remains AMBER"
  );
  const child = spawn(
    "python3",
    [
      bootstrap,
      process.execPath,
      worker,
      String(separateUid ? 65534 : process.getuid()),
    ],
    {
      env: {
        PATH: process.env.PATH,
        OSIRIS_OFFLINE_PROBE_PATH: join(x.root, "resource/state.db"),
      },
      stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
    }
  );
  let out = "",
    proof = "",
    err = "";
  child.stdout.on("data", c => {
    out += c;
  });
  child.stderr.on("data", c => {
    err += c;
  });
  child.stdio[4].on("data", c => {
    proof += c;
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  const [code, signal] = await once(child, "close");
  clearTimeout(timer);
  assert.equal(code, 0, err);
  assert.equal(signal, null);
  const evidence = JSON.parse(proof),
    result = JSON.parse(out);
  assert.equal(evidence.networkDenied, true);
  assert.equal(evidence.parentSignalDenied, true);
  assert.equal(evidence.NoNewPrivs, "1");
  assert.equal(evidence.Seccomp, "2");
  assert.equal(result.readDenied, true);
  assert.throws(() => process.kill(child.pid, 0), /ESRCH/);
});
