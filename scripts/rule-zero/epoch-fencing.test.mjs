import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, rename, cp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { ChildProcess } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import {
  createEpochClient,
  inspectSyntheticEpochAuthority,
  recoverSyntheticEpoch,
  claimJournalHead,
} from "./epoch-authority.mjs";
import { read, paths } from "./synthetic-ledger.mjs";
import { hashData } from "./plan-y.mjs";
import {
  fixture,
  host,
  bundle,
  recovery,
  freshStore,
  snapshot,
  restore,
  verification,
  pem,
  signed,
  owner,
  reconciler,
  supervisors,
} from "./epoch-fixtures.mjs";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gone = pid =>
  assert.throws(
    () => process.kill(pid, 0),
    e => e.code === "ESRCH"
  );
const operation = { tool: "read_fixture", resourceId: "fixture-a" };
test("epoch: valid mediated execution has distinct external intent, acknowledgment and observed stop", async t => {
  const x = await fixture(t),
    h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  assert.equal(
    (await h.supervisor.dispatch("NR-00001", operation)).light,
    "GREEN"
  );
  const stopped = await h.supervisor.stopAgent("NR-00001");
  assert.equal(stopped.observedExit, true);
  gone(stopped.pid);
  assert.equal(h.supervisor.getMetrics().claimMode, "EPOCH_FENCED_SYNTHETIC");
  const state = await inspectSyntheticEpochAuthority(x.authority);
  assert.equal(state.events.filter(e => e.event === "EFFECT_INTENT").length, 1);
  assert.equal(
    state.events.filter(e => e.event === "EFFECT_ACKNOWLEDGED").length,
    1
  );
  t.diagnostic(
    JSON.stringify({
      epoch: state.epoch,
      effects: 1,
      pid: stopped.pid,
      observedExit: true,
      authorityEvents: state.events.length,
    })
  );
});
test("epoch: coherent rollback of BOTH claim copies cannot issue a new supervisor fence", async t => {
  const x = await fixture(t);
  await snapshot(x);
  const a = await x.client();
  await a.acquire(bundle(), 5000);
  const before = await inspectSyntheticEpochAuthority(x.authority);
  await restore(x);
  await assert.rejects(x.client("host_b"), /CLAIM_GENERATION_OR_HEAD_STALE/);
  const after = await inspectSyntheticEpochAuthority(x.authority);
  assert.equal(after.epoch, 1);
  assert.equal(
    after.events.filter(e => e.event === "CLAIM_RESERVED").length,
    1
  );
  assert.deepEqual(after.authorityHead, before.authorityHead);
});
test("epoch: rollback with an already running worker blocks its adapter effect and observed process stops", async t => {
  const x = await fixture(t);
  await snapshot(x);
  const h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  await restore(x);
  assert.equal(
    (await h.supervisor.dispatch("NR-00001", operation)).light,
    "RED"
  );
  const exit = await h.supervisor.waitForExit("NR-00001");
  assert.equal(exit.observedExit, true);
  gone(exit.pid);
  assert.equal(h.supervisor.getMetrics().adapterInvocations, 0);
});
test("epoch: two independent supervisor processes racing one job spawn and execute at most once", async t => {
  const x = await fixture(t),
    a = await host(t, x, "host_a", x.claim, "NR-00001", true),
    b = await host(t, x, "host_b", x.claim, "NR-00001", true);
  const one = bundle(a.descriptor),
    two = bundle(b.descriptor);
  two.approvalEnvelope = one.approvalEnvelope;
  const results = await Promise.all([
    a.call("start", one),
    b.call("start", two),
  ]);
  assert.equal(results.filter(r => r.light === "GREEN").length, 1);
  const win = results[0].light === "GREEN" ? a : b,
    lose = win === a ? b : a;
  assert.equal((await lose.call("dispatch", operation)).light, "RED");
  assert.equal((await win.call("dispatch", operation)).light, "GREEN");
  const metrics = await Promise.all([a.call("metrics"), b.call("metrics")]);
  assert.equal(
    metrics.reduce((n, m) => n + m.spawned, 0),
    1
  );
  assert.equal(
    metrics.reduce((n, m) => n + m.adapterInvocations, 0),
    1
  );
  const exit = await win.call("stop");
  assert.equal(exit.observedExit, true);
  gone(exit.pid);
  await lose.call("stop");
  t.diagnostic(
    JSON.stringify({
      independentSupervisors: 2,
      winners: 1,
      spawned: 1,
      effects: 1,
      pid: exit.pid,
      observedExit: true,
    })
  );
});
test("epoch: a newer fence for the same supervisor identity denies the old worker before effects", async t => {
  const x = await fixture(t),
    a = await host(t, x);
  assert.equal((await a.supervisor.start(bundle(a.descriptor))).light, "GREEN");
  const newer = await x.client();
  assert.ok(newer.getFence().fencingCounter > 1);
  assert.equal(
    (await a.supervisor.dispatch("NR-00001", operation)).light,
    "RED"
  );
  const exit = await a.supervisor.waitForExit("NR-00001");
  assert.equal(exit.observedExit, true);
  gone(exit.pid);
  assert.equal(a.supervisor.getMetrics().adapterInvocations, 0);
});
test("epoch: copied split-brain store cannot launch an externally consumed identity", async t => {
  const x = await fixture(t);
  await snapshot(x);
  const a = await x.client();
  await a.acquire(bundle(), 5000);
  const copy = {
    ...x.claim,
    directory: join(x.root, "saved-claims"),
    witnessDirectory: join(x.root, "saved-witness"),
  };
  await assert.rejects(
    x.client("host_b", copy),
    /CLAIM_GENERATION_OR_HEAD_STALE/
  );
});
for (const phase of ["admission", "effect"])
  test(`epoch: external authority outage at ${phase} fails closed with no new effects`, async t => {
    const x = await fixture(t),
      h = await host(t, x),
      input = bundle(h.descriptor);
    if (phase === "effect")
      assert.equal((await h.supervisor.start(input)).light, "GREEN");
    await rename(x.authority.directory, x.authority.directory + "-offline");
    const result =
      phase === "effect"
        ? await h.supervisor.dispatch("NR-00001", operation)
        : await h.supervisor.start(input);
    assert.equal(result.light, "RED");
    assert.equal(h.supervisor.getMetrics().adapterInvocations, 0);
    if (phase === "admission")
      assert.equal(h.supervisor.getMetrics().spawned, 0);
    else {
      const exit = await h.supervisor.waitForExit("NR-00001");
      assert.equal(exit.observedExit, true);
      gone(exit.pid);
    }
  });
test("epoch: signed recovery plus reconciliation advances exactly one epoch and retains consumed identities", async t => {
  const x = await fixture(t),
    a = await x.client(),
    input = bundle();
  const claim = await a.acquire(input, 5000);
  await a.begin(claim.token);
  await a.quarantine(claim.token, "STOP_OR_UNCERTAIN");
  const old = await inspectSyntheticEpochAuthority(x.authority);
  const target = await freshStore(x),
    proof = await recovery(x, target);
  const result = await recoverSyntheticEpoch(x.authority, proof);
  assert.equal(result.recovered, true);
  assert.equal(result.epoch, 2);
  const after = await inspectSyntheticEpochAuthority(x.authority);
  assert.deepEqual(after.events.slice(0, old.events.length), old.events);
  const h = await host(t, x, "host_b", target, "NR-00002");
  const replacement = bundle(h.descriptor, { version: 2 });
  assert.equal((await h.supervisor.start(replacement)).light, "GREEN");
  assert.equal(
    (await h.supervisor.dispatch("NR-00002", operation)).light,
    "GREEN"
  );
  await h.supervisor.stopAgent("NR-00002");
  assert.equal(
    (await recoverSyntheticEpoch(x.authority, proof)).recovered,
    false
  );
});
for (const wrong of [
  "owner",
  "reconciler",
  "hash",
  "tenant",
  "target",
  "epoch",
  "unconfirmed",
  "expiry",
  "authority_head",
])
  test(`epoch: ${wrong} recovery evidence cannot advance authority`, async t => {
    const x = await fixture(t);
    let proof = await recovery(x);
    let a = JSON.parse(proof.approvalEnvelope.payload),
      r = JSON.parse(proof.reconciliationEnvelope.payload);
    if (wrong === "owner")
      proof.approvalEnvelope = signed(
        a,
        generateKeyPairSync("ed25519").privateKey
      );
    if (wrong === "reconciler")
      proof.reconciliationEnvelope = signed(r, owner.privateKey);
    if (wrong === "hash") {
      a.reconciliationHash = "a".repeat(64);
      proof.approvalEnvelope = signed(a, owner.privateKey);
    }
    if (wrong === "tenant") {
      a.tenantId = "wrong_tenant";
      proof.approvalEnvelope = signed(a, owner.privateKey);
    }
    if (wrong === "target") {
      a.targetStoreId = "wrong_target";
      proof.approvalEnvelope = signed(a, owner.privateKey);
    }
    if (wrong === "epoch") {
      a.toEpoch = 4;
      proof.approvalEnvelope = signed(a, owner.privateKey);
    }
    if (wrong === "unconfirmed") {
      r.allWorkersStopped = false;
      a.reconciliationHash = hashData(r);
      proof.approvalEnvelope = signed(a, owner.privateKey);
      proof.reconciliationEnvelope = signed(r, reconciler.privateKey);
    }
    if (wrong === "expiry") {
      a.expiresAt = new Date(Date.now() - 1000).toISOString();
      proof.approvalEnvelope = signed(a, owner.privateKey);
    }
    if (wrong === "authority_head") {
      await x.client();
    }
    assert.equal(
      (await recoverSyntheticEpoch(x.authority, proof)).recovered,
      false
    );
    assert.equal((await inspectSyntheticEpochAuthority(x.authority)).epoch, 1);
  });
test("epoch: stale epoch cannot authorize even when journal head matches after approved restore", async t => {
  const x = await fixture(t),
    a = await x.client(),
    proof = await recovery(x);
  assert.equal(
    (await recoverSyntheticEpoch(x.authority, proof)).recovered,
    true
  );
  await assert.rejects(a.acquire(bundle(), 5000), /SUPERVISOR_FENCED/);
});
test("epoch: recovery never permits old job, contract or agent identities to be reused", async t => {
  const x = await fixture(t),
    a = await x.client();
  await a.acquire(bundle(), 5000);
  const target = await freshStore(x);
  assert.equal(
    (await recoverSyntheticEpoch(x.authority, await recovery(x, target)))
      .recovered,
    true
  );
  const b = await x.client("host_b", target);
  await assert.rejects(
    b.acquire(bundle(null, { version: 2 }), 5000),
    /EXTERNAL_IDENTITY_ALREADY_CONSUMED/
  );
});
test("epoch: recovery requires a fresh plan approval even for a previously unassigned step", async t => {
  const x = await fixture(t),
    a = await x.client(),
    input = bundle();
  await a.acquire(input, 5000);
  const target = await freshStore(x);
  await recoverSyntheticEpoch(x.authority, await recovery(x, target));
  const b = await x.client("host_b", target);
  const fresh = bundle(
    {
      agentId: "NR-00002",
      keyHash: (await import("./plan-y.mjs")).publicKeyFingerprint(
        verification().agentKeys.get("NR-00002")
      ),
    },
    {
      contract: {
        jobId: "unused_job_id",
        contractId: "unused_contract",
        stepId: "step_2",
      },
    }
  );
  fresh.approvalEnvelope = input.approvalEnvelope;
  await assert.rejects(b.acquire(fresh, 5000), /RECOVERY_REAPPROVAL_REQUIRED/);
});
for (const change of ["backward", "forward"])
  test(`epoch: ${change} wall-clock change cannot revive a fenced generation`, async t => {
    const x = await fixture(t),
      c = await createEpochClient(x.config().epochAuthority, "host_a", x.claim);
    await c.register(x.genesis);
    await recoverSyntheticEpoch(x.authority, await recovery(x));
    const original = Date.now;
    try {
      Date.now = () =>
        original() + (change === "backward" ? -86400000 : 86400000);
      await assert.rejects(c.check(x.genesis, "no_claim"), /SUPERVISOR_FENCED/);
      assert.equal(
        (await inspectSyntheticEpochAuthority(x.authority)).epoch,
        2
      );
    } finally {
      Date.now = original;
    }
  });
for (const identity of ["jobId", "contractId", "agentId"])
  test(`epoch: old ${identity} alone stays consumed across explicit recovery`, async t => {
    const x = await fixture(t),
      a = await x.client(),
      input = bundle();
    await a.acquire(input, 5000);
    const target = await freshStore(x);
    await recoverSyntheticEpoch(x.authority, await recovery(x, target));
    const b = await x.client("host_b", target);
    const old = JSON.parse(input.contractEnvelope.payload),
      contract = {
        jobId: "fresh_job_id",
        contractId: "fresh_contract",
        agentId: "NR-00002",
      };
    contract[identity] = old[identity];
    const descriptor = {
      agentId: contract.agentId,
      keyHash: (await import("./plan-y.mjs")).publicKeyFingerprint(
        verification().agentKeys.get(contract.agentId)
      ),
    };
    await assert.rejects(
      b.acquire(bundle(descriptor, { version: 2, contract }), 5000),
      /EXTERNAL_IDENTITY_ALREADY_CONSUMED/
    );
  });
for (const behavior of ["crash", "timeout"])
  test(`epoch: worker ${behavior} preserves consumed authority records and blocks reuse`, async t => {
    const x = await fixture(t),
      h = await host(t, x);
    assert.equal(
      (await h.supervisor.start(bundle(h.descriptor))).light,
      "GREEN"
    );
    assert.equal(
      (await h.supervisor.dispatch("NR-00001", { ...operation, behavior }))
        .light,
      "RED"
    );
    const exit = await h.supervisor.waitForExit("NR-00001");
    assert.equal(exit.observedExit, true);
    gone(exit.pid);
    await h.supervisor.stopAgent("NR-00001");
    const state = await inspectSyntheticEpochAuthority(x.authority);
    assert.equal(
      state.events.filter(e => e.event === "CLAIM_RESERVED").length,
      1
    );
    const other = await host(t, x, "host_b");
    assert.equal(
      (await other.supervisor.start(bundle(other.descriptor))).light,
      "RED"
    );
    assert.equal(other.supervisor.getMetrics().spawned, 0);
  });
test("epoch: uncertain live worker shutdown does not release identities or validate false reconciliation", async t => {
  const x = await fixture(t),
    h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  const pid = h.supervisor.getStatus("NR-00001").pid,
    original = ChildProcess.prototype.kill;
  try {
    ChildProcess.prototype.kill = () => true;
    const result = await h.supervisor.stopAgent("NR-00001");
    assert.equal(result.observedExit, false);
    assert.doesNotThrow(() => process.kill(pid, 0));
    const proof = await recovery(x, x.claim, {
      reconciliation: { allWorkersStopped: false },
    });
    assert.equal(
      (await recoverSyntheticEpoch(x.authority, proof)).recovered,
      false
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
test("epoch: acknowledged reservation lost before claim append cannot spawn or silently recover", async t => {
  const x = await fixture(t),
    h = await host(t, x),
    original = fs.promises.open;
  fs.promises.open = async function (path, ...args) {
    const handle = await original.call(this, path, ...args);
    if (
      String(path).includes("external-authority/checkpoints/000000000003.json")
    )
      handle.sync = async () => {
        throw new Error("SYNTHETIC_EXTERNAL_ACK_LOST");
      };
    return handle;
  };
  syncBuiltinESMExports();
  try {
    assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "RED");
    assert.equal(h.supervisor.getMetrics().spawned, 0);
  } finally {
    fs.promises.open = original;
    syncBuiltinESMExports();
  }
  assert.match(
    await readFile(
      join(x.authority.directory, "records/journal.jsonl"),
      "utf8"
    ),
    /CLAIM_RESERVED/
  );
  assert.doesNotMatch(
    await readFile(join(x.claim.directory, "journal.jsonl"), "utf8"),
    /ACQUIRED/
  );
  await assert.rejects(x.client("host_b"));
});
test("epoch: lost effect acknowledgment is quarantined, never retried as if nothing happened", async t => {
  const x = await fixture(t),
    h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  const original = fs.promises.open;
  fs.promises.open = async function (path, ...args) {
    const handle = await original.call(this, path, ...args);
    if (
      String(path).includes("external-authority/checkpoints/000000000006.json")
    )
      handle.sync = async () => {
        throw new Error("SYNTHETIC_EFFECT_ACK_LOST");
      };
    return handle;
  };
  syncBuiltinESMExports();
  try {
    assert.equal(
      (await h.supervisor.dispatch("NR-00001", operation)).light,
      "RED"
    );
  } finally {
    fs.promises.open = original;
    syncBuiltinESMExports();
  }
  const exit = await h.supervisor.waitForExit("NR-00001");
  assert.equal(exit.observedExit, true);
  gone(exit.pid);
  assert.equal(h.supervisor.getMetrics().adapterInvocations, 1);
  assert.equal(
    (await h.supervisor.dispatch("NR-00001", operation)).light,
    "RED"
  );
  assert.equal(h.supervisor.getMetrics().adapterInvocations, 1);
  assert.match(
    await readFile(
      join(x.authority.directory, "records/journal.jsonl"),
      "utf8"
    ),
    /EFFECT_INTENT/
  );
  await assert.rejects(x.client("host_b"));
});
test("epoch: authority hang denies before effects and cannot delay actual worker stop", async t => {
  const x = await fixture(t),
    h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  const original = fs.promises.open;
  let entered, release;
  const reached = new Promise(r => (entered = r)),
    held = new Promise(r => (release = r));
  fs.promises.open = async function (path, ...args) {
    const handle = await original.call(this, path, ...args);
    if (String(path).endsWith("external-authority/authority-key.pem")) {
      const read = handle.readFile.bind(handle);
      handle.readFile = async (...a) => {
        entered();
        await held;
        return read(...a);
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    const pending = h.supervisor.dispatch("NR-00001", operation);
    await reached;
    assert.equal((await pending).light, "RED");
    const exit = await h.supervisor.waitForExit("NR-00001");
    assert.equal(exit.observedExit, true);
    gone(exit.pid);
    assert.equal(h.supervisor.getMetrics().adapterInvocations, 0);
  } finally {
    release();
    fs.promises.open = original;
    syncBuiltinESMExports();
    await sleep(80);
  }
  assert.equal(h.supervisor.getMetrics().adapterInvocations, 0);
});
test("epoch: fencing loss during resource preparation denies the later callback before effects", async t => {
  const x = await fixture(t),
    h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  const original = fs.promises.open;
  let entered, release;
  const reached = new Promise(r => (entered = r)),
    held = new Promise(r => (release = r));
  fs.promises.open = async function (path, ...args) {
    const handle = await original.call(this, path, ...args);
    if (String(path).endsWith("resources/fixture-a.txt")) {
      const stat = handle.stat.bind(handle);
      handle.stat = async (...a) => {
        entered();
        await held;
        return stat(...a);
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    const pending = h.supervisor.dispatch("NR-00001", operation);
    await reached;
    await x.client();
    release();
    assert.equal((await pending).light, "RED");
    const exit = await h.supervisor.waitForExit("NR-00001");
    assert.equal(exit.observedExit, true);
    gone(exit.pid);
    assert.equal(h.supervisor.getMetrics().adapterInvocations, 0);
  } finally {
    release();
    fs.promises.open = original;
    syncBuiltinESMExports();
  }
});
test("epoch: recovery cannot interleave while a protected adapter effect owns the authority lock", async t => {
  const x = await fixture(t),
    h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  const proof = await recovery(x),
    original = fs.promises.open;
  let entered, release;
  const reached = new Promise(r => (entered = r)),
    held = new Promise(r => (release = r));
  fs.promises.open = async function (path, ...args) {
    const handle = await original.call(this, path, ...args);
    if (String(path).endsWith("resources/fixture-a.txt")) {
      const read = handle.read.bind(handle);
      handle.read = async (...a) => {
        entered();
        await held;
        return read(...a);
      };
    }
    return handle;
  };
  syncBuiltinESMExports();
  try {
    const pending = h.supervisor.dispatch("NR-00001", operation);
    await reached;
    await assert.rejects(
      recoverSyntheticEpoch(x.authority, proof),
      e => e.code === "EEXIST"
    );
    release();
    assert.equal((await pending).light, "GREEN");
    assert.equal((await inspectSyntheticEpochAuthority(x.authority)).epoch, 1);
  } finally {
    release();
    fs.promises.open = original;
    syncBuiltinESMExports();
  }
});
test("epoch: authority response key substitution and overlapping storage are rejected", async t => {
  const x = await fixture(t),
    config = x.config();
  config.epochAuthority.publicKey = pem(
    generateKeyPairSync("ed25519").publicKey
  );
  await assert.rejects(
    (await import("./shared-claims.mjs")).createSharedClaimClient(
      config,
      verification()
    ),
    /EPOCH_AUTHORITY_KEY_MISMATCH/
  );
  const overlap = x.config("host_b");
  overlap.epochAuthority.directory = x.claim.directory;
  await assert.rejects(
    (await import("./shared-claims.mjs")).createSharedClaimClient(
      overlap,
      verification()
    ),
    /EXTERNAL_EPOCH_STORAGE_REQUIRED/
  );
});
test("epoch: external authority corruption never rebuilds a new generation from claims", async t => {
  const x = await fixture(t),
    path = join(x.authority.directory, "records/journal.jsonl");
  await writeFile(
    path,
    (await readFile(path, "utf8")).replace("INITIALIZED", "FORGED")
  );
  await assert.rejects(x.client());
  assert.match(await readFile(path, "utf8"), /FORGED/);
});
test("epoch: explicit recovery receipts bind actual independently observed synthetic termination evidence", async t => {
  const x = await fixture(t),
    h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  const exit = await h.supervisor.stopAgent("NR-00001");
  assert.equal(exit.observedExit, true);
  gone(exit.pid);
  const target = await freshStore(x),
    proof = await recovery(x, target, {
      reconciliation: {
        terminationEvidenceHash: hashData(exit),
        effectsEvidenceHash: hashData({
          effects: h.supervisor.getMetrics().adapterInvocations,
        }),
      },
    });
  assert.equal(
    (await recoverSyntheticEpoch(x.authority, proof)).recovered,
    true
  );
  const state = await inspectSyntheticEpochAuthority(x.authority),
    r = state.events.at(-1);
  assert.equal(
    JSON.parse(r.reconciliationEnvelope.payload).terminationEvidenceHash,
    hashData(exit)
  );
});
test("epoch: symlink aliases cannot hide the authority inside the restored claim snapshot", async t => {
  const x = await fixture(t),
    inside = join(x.claim.directory, "hidden-authority"),
    alias = join(x.root, "authority-alias");
  await rename(x.authority.directory, inside);
  await (await import("node:fs/promises")).symlink(inside, alias, "dir");
  const config = x.config();
  config.epochAuthority.directory = alias;
  await assert.rejects(
    (await import("./shared-claims.mjs")).createSharedClaimClient(
      config,
      verification()
    ),
    /EXTERNAL_EPOCH_STORAGE_REQUIRED/
  );
});
test("epoch: restored claim bytes regain only new-work authority after a verified recovery transition", async t => {
  const x = await fixture(t);
  await snapshot(x);
  const a = await x.client();
  await a.acquire(bundle(), 5000);
  await restore(x);
  const transition = await recovery(x);
  assert.equal(
    (await recoverSyntheticEpoch(x.authority, transition)).recovered,
    true
  );
  const h = await host(t, x, "host_b", x.claim, "NR-00002");
  assert.equal(
    (await h.supervisor.start(bundle(h.descriptor, { version: 2 }))).light,
    "GREEN"
  );
  assert.equal(
    (await h.supervisor.dispatch("NR-00002", operation)).light,
    "GREEN"
  );
  const exit = await h.supervisor.stopAgent("NR-00002");
  assert.equal(exit.observedExit, true);
  gone(exit.pid);
  const b = await x.client("host_c");
  await assert.rejects(
    b.acquire(bundle(null, { version: 3 }), 5000),
    /EXTERNAL_IDENTITY_ALREADY_CONSUMED/
  );
  const state = await inspectSyntheticEpochAuthority(x.authority);
  assert.equal(state.epoch, 2);
  assert.equal(
    state.events.filter(e => e.event === "CLAIM_RESERVED").length,
    2
  );
});
test("epoch: authority path substitution after registration cannot authorize an adapter effect", async t => {
  const x = await fixture(t),
    h = await host(t, x);
  assert.equal((await h.supervisor.start(bundle(h.descriptor))).light, "GREEN");
  const hidden = join(x.claim.directory, "authority-moved");
  await rename(x.authority.directory, hidden);
  await (
    await import("node:fs/promises")
  ).symlink(hidden, x.authority.directory, "dir");
  assert.equal(
    (await h.supervisor.dispatch("NR-00001", operation)).light,
    "RED"
  );
  const exit = await h.supervisor.waitForExit("NR-00001");
  assert.equal(exit.observedExit, true);
  gone(exit.pid);
  assert.equal(h.supervisor.getMetrics().adapterInvocations, 0);
});
test("epoch: unregistered supervisor keys cannot obtain a fencing receipt", async t => {
  const x = await fixture(t),
    config = x.config();
  config.epochAuthority.supervisorPrivateKey = pem(
    generateKeyPairSync("ed25519").privateKey
  );
  await assert.rejects(
    (await import("./shared-claims.mjs")).createSharedClaimClient(
      config,
      verification()
    ),
    /SUPERVISOR_PROOF_INVALID/
  );
});
