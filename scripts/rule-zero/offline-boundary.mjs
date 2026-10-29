// Disposable offline SQLite model only. No application import, network or migration path.
// Host-only factory/controller APIs are NOT agent APIs or a production supervisor.
import { DatabaseSync, constants } from "node:sqlite";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  lstatSync,
  openSync,
  fsyncSync,
  closeSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  verifyAgentContract,
  readSigned,
  hashData,
  canonicalJSON,
  checkLifetime,
  publicKeyFingerprint,
} from "./plan-y.mjs";

const BASE = "8840e61ad8a299be1062c3cc199f349d61aef7e0";
// Bind the synthetic plan to the exact fixed adapter source, not a caller policy.
export const offlineRulesetHash = hashData({
  schema: "osiris.offline-fixed-ruleset/v1",
  source: readFileSync(fileURLToPath(import.meta.url), "utf8"),
});
const need = (ok, reason) => {
  if (!ok) throw new Error(reason);
};
const exact = (v, names) =>
  v && Object.keys(v).sort().join() === [...names].sort().join();
const id = x => typeof x === "string" && /^[a-zA-Z0-9_-]{8,96}$/.test(x);
const copy = x => JSON.parse(canonicalJSON(x));
const get = db => JSON.parse(db.prepare("SELECT body FROM meta").get().body);
const put = (db, v) =>
  db.prepare("UPDATE meta SET body=?").run(canonicalJSON(v));
const failAt = name => {
  if (process.env.OSIRIS_OFFLINE_FAULT !== name) return;
  if (name === "before-commit" || name === "after-commit") process.exit(92);
  throw new Error(
    name === "audit" ? "AUDIT_UNAVAILABLE" : "CHECKPOINT_UNAVAILABLE"
  );
};
const pause = () =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
function waitFile(path) {
  const until = performance.now() + 3000;
  while (!existsSync(path)) {
    need(performance.now() < until, "BARRIER_TIMEOUT");
    pause();
  }
}
function checkpoint(root, state, body) {
  const record = { previous: state.head, body };
  const hash = hashData(record);
  const fd = openSync(join(root, "checkpoint", "events.jsonl"), "a");
  try {
    writeFileSync(fd, canonicalJSON({ ...record, hash }) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  state.head = hash;
}
function checkHead(root, state) {
  let head = null;
  const lines = readFileSync(join(root, "checkpoint", "events.jsonl"), "utf8")
    .trim()
    .split("\n");
  for (const line of lines) {
    const r = JSON.parse(line);
    need(
      exact(r, ["previous", "body", "hash"]) &&
        r.previous === head &&
        r.hash === hashData({ previous: r.previous, body: r.body }),
      "CHECKPOINT_CORRUPT"
    );
    head = r.hash;
  }
  need(head === state.head, "CHECKPOINT_ROLLBACK_OR_GAP");
}
function files(root) {
  need(
    resolve(root).startsWith(join(tmpdir(), "osiris-offline-")),
    "OFFLINE_ROOT_REQUIRED"
  );
  for (const p of [
    root,
    join(root, "resource"),
    join(root, "external"),
    join(root, "checkpoint"),
  ])
    need(
      lstatSync(p).isDirectory() && !lstatSync(p).isSymbolicLink(),
      "PRIVATE_DIRECTORY_REQUIRED"
    );
  for (const p of [
    "pins.json",
    "resource/state.db",
    "external/state.db",
    "checkpoint/events.jsonl",
  ])
    need(
      lstatSync(join(root, p)).isFile() &&
        !lstatSync(join(root, p)).isSymbolicLink(),
      "MISSING_OR_SUBSTITUTED_STORE"
    );
}
function stores(root, fn) {
  files(root);
  const r = new DatabaseSync(join(root, "resource", "state.db"));
  const a = new DatabaseSync(join(root, "external", "state.db"));
  try {
    for (const db of [r, a])
      db.exec("PRAGMA busy_timeout=2500; PRAGMA synchronous=FULL;");
    // One lock order for execution, observation, freeze and recovery.
    r.exec("BEGIN IMMEDIATE");
    a.exec("BEGIN IMMEDIATE");
    const state = get(a);
    checkHead(root, state);
    return fn(
      r,
      a,
      state,
      JSON.parse(readFileSync(join(root, "pins.json"), "utf8"))
    );
  } finally {
    for (const db of [a, r]) {
      try {
        db.exec("ROLLBACK");
      } catch {}
      db.close();
    }
  }
}
export function initializeOfflineBoundary(input) {
  need(
    exact(input, [
      "context",
      "ownerKey",
      "contractKey",
      "reconcilerKey",
      "agentKeys",
    ]),
    "INVALID_OFFLINE_PINS"
  );
  const pins = copy(input);
  need(
    publicKeyFingerprint(pins.ownerKey) !==
      publicKeyFingerprint(pins.reconcilerKey),
    "INDEPENDENT_RECONCILER_REQUIRED"
  );
  const fingerprints = new Set(
    [pins.ownerKey, pins.contractKey, pins.reconcilerKey].map(
      publicKeyFingerprint
    )
  );
  need(fingerprints.size === 3, "TRUST_ROOT_KEY_REUSE");
  need(
    exact(pins.context, ["tenantId", "ownerId", "taskId"]) &&
      Object.values(pins.context).every(id),
    "INVALID_CONTEXT"
  );
  for (const [name, key] of Object.entries(pins.agentKeys)) {
    need(/^NR-[0-9]{5}$/.test(name), "INVALID_AGENT");
    const fingerprint = publicKeyFingerprint(key);
    need(!fingerprints.has(fingerprint), "AGENT_KEY_REUSE");
    fingerprints.add(fingerprint);
  }
  const root = mkdtempSync(join(tmpdir(), "osiris-offline-"));
  for (const d of ["resource", "external", "checkpoint"])
    mkdirSync(join(root, d), { mode: 0o700 });
  writeFileSync(join(root, "pins.json"), canonicalJSON(pins), { mode: 0o600 });
  writeFileSync(join(root, "checkpoint", "events.jsonl"), "", { mode: 0o600 });
  for (const kind of ["resource", "external"]) {
    const db = new DatabaseSync(join(root, kind, "state.db"));
    db.exec("PRAGMA synchronous=FULL; CREATE TABLE meta(body TEXT NOT NULL);");
    const state =
      kind === "resource"
        ? { epoch: 1, fence: 1, version: 0, active: true }
        : {
            epoch: 1,
            fence: 1,
            version: 0,
            active: true,
            minimumPlanVersion: 1,
            head: null,
          };
    if (kind === "external") {
      checkpoint(root, state, {
        event: "GENESIS",
        tenantId: pins.context.tenantId,
      });
      db.exec(
        "CREATE TABLE intents(operationId TEXT PRIMARY KEY, jobId TEXT UNIQUE, contractId TEXT UNIQUE, approvalId TEXT UNIQUE, agentId TEXT UNIQUE, nonce TEXT UNIQUE, body TEXT, status TEXT); CREATE TABLE observations(nonce TEXT PRIMARY KEY);"
      );
    } else
      db.exec(
        "CREATE TABLE effects(operationId TEXT PRIMARY KEY, jobId TEXT UNIQUE, digest TEXT, payload TEXT); CREATE TABLE audit(operationId TEXT PRIMARY KEY, version INTEGER UNIQUE, digest TEXT);"
      );
    db.prepare("INSERT INTO meta VALUES(?)").run(canonicalJSON(state));
    db.close();
  }
  return root;
}
function snapshot(r, a, state) {
  return {
    gate: get(r),
    authority: {
      epoch: state.epoch,
      fence: state.fence,
      version: state.version,
      active: state.active,
    },
    effects: r
      .prepare("SELECT * FROM effects ORDER BY operationId")
      .all()
      .map(x => ({ ...x })),
    audit: r
      .prepare("SELECT * FROM audit ORDER BY version")
      .all()
      .map(x => ({ ...x })),
    intents: a
      .prepare(
        "SELECT operationId,jobId,status,body FROM intents ORDER BY operationId"
      )
      .all()
      .map(x => ({
        operationId: x.operationId,
        jobId: x.jobId,
        status: x.status,
        bodyHash: hashData(JSON.parse(x.body)),
      })),
    checkpointHead: state.head,
  };
}
export const observeOfflineBoundary = root =>
  stores(root, (r, a, s) => snapshot(r, a, s));
export function openOfflineObserver(root) {
  files(root);
  const db = new DatabaseSync(join(root, "resource", "state.db"), {
    readOnly: true,
  });
  db.setAuthorizer(action =>
    [constants.SQLITE_SELECT, constants.SQLITE_READ].includes(action)
      ? constants.SQLITE_OK
      : constants.SQLITE_DENY
  );
  return Object.freeze({
    query: sql => db.prepare(sql).all(),
    close: () => db.close(),
  });
}
export function executeOfflineAppend(root, input) {
  const bundle = copy(input); // Snapshot before any external work.
  return stores(root, (r, a, state, pins) => {
    need(
      exact(bundle, [
        "planJson",
        "approvalEnvelope",
        "contractEnvelope",
        "requestEnvelope",
        "arguments",
      ]),
      "INVALID_REQUEST"
    );
    const v = verifyAgentContract({
      ...bundle,
      authorityKey: pins.ownerKey,
      contractKey: pins.contractKey,
      agentKeys: new Map(Object.entries(pins.agentKeys)),
      context: pins.context,
    });
    const c = v.contract,
      args = bundle.arguments;
    const q = readSigned(bundle.requestEnvelope, pins.agentKeys[c.agentId]);
    need(
      exact(q, [
        "schema",
        "tenantId",
        "agentId",
        "jobId",
        "operationId",
        "argumentDigest",
        "epoch",
        "fence",
        "nonce",
        "issuedAt",
        "expiresAt",
      ]) &&
        q.schema === "osiris.offline-action/v1" &&
        q.agentId === c.agentId &&
        q.tenantId === c.tenantId &&
        q.jobId === c.jobId &&
        id(q.operationId) &&
        id(q.nonce),
      "ACTION_BINDING_INVALID"
    );
    checkLifetime(q, Date.now(), Date.parse(c.expiresAt));
    need(
      exact(args, [
        "tenantId",
        "resourceId",
        "operationId",
        "jobId",
        "expectedVersion",
        "kind",
        "marker",
      ]) &&
        args.tenantId === c.tenantId &&
        args.resourceId === "offline_resource" &&
        args.operationId === q.operationId &&
        args.jobId === c.jobId &&
        args.kind === "synthetic.marker.v1" &&
        typeof args.marker === "string" &&
        Buffer.byteLength(args.marker) <= 1024 &&
        q.argumentDigest === hashData(args),
      "ARGUMENT_BINDING_INVALID"
    );
    need(
      v.plan.steps.length === 1 &&
        c.target === "offline/db/synthetic_records" &&
        c.commit === BASE &&
        c.rulesetHash === offlineRulesetHash &&
        c.tools.join() === "appendSynthetic" &&
        c.zones.join() === "offline/synthetic/db" &&
        c.budgets.maxCalls === 1 &&
        c.budgets.maxTokens === 0 &&
        c.budgets.maxCostMicros <= 100000 &&
        c.planVersion >= state.minimumPlanVersion &&
        v.plan.steps[0].expectedEvidence.filter(
          x => x === "approved-arguments-sha256:" + q.argumentDigest
        ).length === 1,
      "APPROVED_SCOPE_INVALID"
    );
    const gate = get(r);
    need(
      state.active &&
        gate.active &&
        gate.epoch === state.epoch &&
        gate.fence === state.fence &&
        q.epoch === state.epoch &&
        q.fence === state.fence,
      "STALE_FENCE_OR_FROZEN"
    );
    need(
      gate.version === state.version && args.expectedVersion === gate.version,
      "RESOURCE_ROLLBACK_OR_VERSION_MISMATCH"
    );
    need(
      a.prepare("SELECT 1 FROM intents WHERE status='INTENT' LIMIT 1").get() ===
        undefined,
      "UNKNOWN_EXECUTION_QUARANTINED"
    );
    a.prepare("INSERT INTO intents VALUES(?,?,?,?,?,?,?,'INTENT')").run(
      q.operationId,
      c.jobId,
      c.contractId,
      v.approval.approvalId,
      c.agentId,
      q.nonce,
      canonicalJSON(bundle)
    );
    // Burn intent independently before the resource transaction can commit.
    a.exec("COMMIT");
    a.exec("BEGIN IMMEDIATE");
    failAt("intent-checkpoint");
    checkpoint(root, state, {
      event: "INTENT",
      operationId: q.operationId,
      authorizationHash: hashData(bundle),
      epoch: state.epoch,
      fence: state.fence,
    });
    put(a, state);
    a.exec("COMMIT");
    a.exec("BEGIN IMMEDIATE");
    if (process.env.OSIRIS_OFFLINE_FAULT === "resource-barrier") {
      writeFileSync(join(root, "resource-locked"), "1");
      waitFile(join(root, "release-resource"));
    }
    r.prepare("INSERT INTO effects VALUES(?,?,?,?)").run(
      q.operationId,
      c.jobId,
      q.argumentDigest,
      canonicalJSON(args)
    );
    failAt("audit");
    r.prepare("INSERT INTO audit VALUES(?,?,?)").run(
      q.operationId,
      gate.version + 1,
      q.argumentDigest
    );
    put(r, { ...gate, version: gate.version + 1 });
    failAt("before-commit");
    r.exec("COMMIT");
    failAt("after-commit");
    return {
      decision: "EFFECT_COMMITTED_COMPLETION_PENDING",
      operationId: q.operationId,
    };
  });
}
export function completeOfflineEffect(root, envelope) {
  return stores(root, (r, a, state, pins) => {
    const receipt = readSigned(copy(envelope), pins.reconcilerKey);
    const observed = snapshot(r, a, state);
    need(
      exact(receipt, [
        "schema",
        "tenantId",
        "operationId",
        "snapshotHash",
        "nonce",
      ]) &&
        receipt.schema === "osiris.offline-observation/v1" &&
        receipt.tenantId === pins.context.tenantId &&
        receipt.snapshotHash === hashData(observed) &&
        id(receipt.nonce),
      "OBSERVATION_INVALID"
    );
    need(
      observed.effects.length === observed.audit.length &&
        observed.effects.some(
          x =>
            x.operationId === receipt.operationId &&
            observed.audit.some(
              y => y.operationId === x.operationId && y.digest === x.digest
            )
        ),
      "EFFECT_EVIDENCE_MISSING"
    );
    need(
      a
        .prepare("SELECT status FROM intents WHERE operationId=?")
        .get(receipt.operationId)?.status === "INTENT",
      "INTENT_NOT_PENDING"
    );
    a.prepare("INSERT INTO observations VALUES(?)").run(receipt.nonce);
    failAt("completion-checkpoint");
    checkpoint(root, state, {
      event: "OBSERVED_COMPLETE",
      receipt: copy(envelope),
    });
    a.prepare("UPDATE intents SET status='COMPLETE' WHERE operationId=?").run(
      receipt.operationId
    );
    state.version = observed.gate.version;
    put(a, state);
    a.exec("COMMIT");
    r.exec("COMMIT");
    return {
      decision: "VERIFIED_COMPLETE_SYNTHETIC_ONLY",
      operationId: receipt.operationId,
    };
  });
}
export function freezeOfflineBoundary(root) {
  return stores(root, (r, a, state) => {
    put(r, { ...get(r), active: false });
    state.active = false;
    checkpoint(root, state, { event: "FROZEN", epoch: state.epoch });
    put(a, state);
    r.exec("COMMIT");
    a.exec("COMMIT");
    return { decision: "RESOURCE_FROZEN", epoch: state.epoch };
  });
}
export function recoverOfflineBoundary(root, receipts) {
  return stores(root, (r, a, state, pins) => {
    const owner = readSigned(copy(receipts.owner), pins.ownerKey);
    const reconciler = readSigned(
      copy(receipts.reconciler),
      pins.reconcilerKey
    );
    need(
      canonicalJSON(owner) === canonicalJSON(reconciler) &&
        exact(owner, [
          "schema",
          "tenantId",
          "fromEpoch",
          "toEpoch",
          "snapshotHash",
          "nonce",
        ]) &&
        owner.schema === "osiris.offline-recovery/v1" &&
        owner.tenantId === pins.context.tenantId &&
        !state.active &&
        !get(r).active &&
        owner.fromEpoch === state.epoch &&
        owner.toEpoch === state.epoch + 1 &&
        Number.isSafeInteger(owner.toEpoch) &&
        owner.snapshotHash === hashData(snapshot(r, a, state)) &&
        id(owner.nonce),
      "RECOVERY_BINDING_INVALID"
    );
    a.prepare("INSERT INTO observations VALUES(?)").run(owner.nonce);
    // Never clear consumed records. Resolving uncertainty is a signed fixture reconciliation.
    a.prepare(
      "UPDATE intents SET status='RESOLVED' WHERE status='INTENT'"
    ).run();
    state.epoch++;
    state.fence++;
    state.minimumPlanVersion++;
    state.active = true;
    state.version = get(r).version;
    checkpoint(root, state, { event: "RECOVERED", receipts: copy(receipts) });
    put(r, {
      epoch: state.epoch,
      fence: state.fence,
      version: state.version,
      active: true,
    });
    put(a, state);
    r.exec("COMMIT");
    a.exec("COMMIT");
    return { decision: "RECOVERED_SYNTHETIC_ONLY", epoch: state.epoch };
  });
}
// Fixed offline subprocess seam for concurrency/crash tests; no arbitrary runner or SQL.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  try {
    const request = JSON.parse(Buffer.concat(chunks).toString());
    if (process.env.OSIRIS_OFFLINE_START_BARRIER) {
      console.log("READY");
      waitFile(join(process.argv[2], "start"));
    }
    const result =
      request.action === "append"
        ? executeOfflineAppend(process.argv[2], request.bundle)
        : request.action === "freeze"
          ? freezeOfflineBoundary(process.argv[2])
          : request.action === "complete"
            ? completeOfflineEffect(process.argv[2], request.envelope)
            : (() => {
                throw new Error("UNKNOWN_OPERATION");
              })();
    console.log(JSON.stringify({ ok: true, result }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, reason: e.message }));
    process.exitCode = 1;
  }
}
