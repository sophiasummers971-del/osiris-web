// Synthetic single-filesystem coordinator. Not a network/distributed database.
// Host-owned configuration only; agents never receive these paths or methods.
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rmdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  canonicalJSON,
  hashData,
  verifyAgentContract,
  pinnedEd25519Key,
} from "./plan-y.mjs";

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
async function privateDirectory(path) {
  const s = await lstat(path);
  requireValue(
    s.isDirectory() &&
      !s.isSymbolicLink() &&
      !(s.mode & 0o077) &&
      s.uid === process.getuid(),
    "CLAIM_DIRECTORY_UNSAFE"
  );
}
function paths(config) {
  const { directory, witnessDirectory, storeId } = config;
  requireValue(
    isAbsolute(directory ?? "") &&
      isAbsolute(witnessDirectory ?? "") &&
      id(storeId),
    "CLAIM_CONFIGURATION_INVALID"
  );
  const a = resolve(directory),
    b = resolve(witnessDirectory);
  requireValue(
    a !== b && !a.startsWith(b + "/") && !b.startsWith(a + "/"),
    "SEPARATE_WITNESS_REQUIRED"
  );
  return { directory: a, witnessDirectory: b, storeId };
}
async function syncDirectory(path) {
  const h = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  );
  try {
    await h.sync();
  } finally {
    await h.close();
  }
}
async function textFile(path) {
  const h = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const s = await h.stat();
    requireValue(
      s.isFile() &&
        s.size <= 8 * 1024 * 1024 &&
        !(s.mode & 0o077) &&
        s.uid === process.getuid(),
      "CLAIM_FILE_UNSAFE"
    );
    return await h.readFile("utf8");
  } finally {
    await h.close();
  }
}
async function exclusiveFile(path, text) {
  const h = await open(
    path,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600
  );
  try {
    await h.writeFile(text);
    await h.sync();
  } finally {
    await h.close();
  }
}
const witnessName = seq => String(seq).padStart(12, "0") + ".json";
async function append(p, records, body) {
  requireValue(records.length < 10000, "CLAIM_CAPACITY_REQUIRES_REVIEW");
  const event = {
    ...body,
    storeId: p.storeId,
    seq: records.length,
    previous: records.at(-1)?.hash ?? "0".repeat(64),
  };
  const entry = { ...event, hash: hashData(event) };
  const h = await open(
    join(p.directory, "journal.jsonl"),
    constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW
  );
  try {
    await h.writeFile(canonicalJSON(entry) + "\n");
    await h.sync();
  } finally {
    await h.close();
  }
  // A crash/uncertain acknowledgment anywhere leaves the lock in place.
  await exclusiveFile(
    join(p.witnessDirectory, witnessName(entry.seq)),
    canonicalJSON(entry) + "\n"
  );
  await syncDirectory(p.witnessDirectory);
  return entry;
}
async function read(p) {
  await privateDirectory(p.directory);
  await privateDirectory(p.witnessDirectory);
  const raw = await textFile(join(p.directory, "journal.jsonl"));
  requireValue(raw.endsWith("\n"), "CLAIM_JOURNAL_INCOMPLETE");
  const lines = raw.slice(0, -1).split("\n");
  requireValue(
    lines.length > 0 && lines.length <= 10000,
    "CLAIM_JOURNAL_INVALID"
  );
  const records = [];
  const names = (await readdir(p.witnessDirectory)).sort();
  requireValue(names.length === lines.length, "SNAPSHOT_OR_WITNESS_MISMATCH");
  for (const [seq, line] of lines.entries()) {
    const entry = JSON.parse(line),
      { hash, ...body } = entry;
    requireValue(
      canonicalJSON(entry) === line &&
        entry.storeId === p.storeId &&
        entry.seq === seq &&
        entry.previous === (records.at(-1)?.hash ?? "0".repeat(64)) &&
        hashData(body) === hash,
      "CLAIM_CHAIN_INVALID"
    );
    requireValue(
      names[seq] === witnessName(seq) &&
        (await textFile(join(p.witnessDirectory, names[seq]))) === line + "\n",
      "SNAPSHOT_OR_WITNESS_MISMATCH"
    );
    records.push(entry);
  }
  requireValue(
    records[0].event === "GENESIS" &&
      records[0].schema === "osiris.shared-claims/v1",
    "CLAIM_GENESIS_INVALID"
  );
  return records;
}
async function transaction(p, fn) {
  await privateDirectory(p.directory);
  await privateDirectory(p.witnessDirectory);
  // Atomic POSIX mkdir. Contention denies immediately; no lock stealing/TTL.
  const lock = join(p.directory, "exclusive.lock");
  await mkdir(lock, { mode: 0o700 });
  await syncDirectory(p.directory);
  try {
    const records = await read(p);
    const result = await fn(records);
    await rmdir(lock);
    await syncDirectory(p.directory);
    return result;
  } catch (e) {
    // Preserve evidence and uncertainty. Even a no-write error needs review.
    throw e;
  }
}
export async function initializeSyntheticClaims(config) {
  const p = paths(config);
  await privateDirectory(p.directory);
  await privateDirectory(p.witnessDirectory);
  requireValue(
    !(await readdir(p.directory)).length &&
      !(await readdir(p.witnessDirectory)).length,
    "FRESH_CLAIM_DIRECTORIES_REQUIRED"
  );
  await mkdir(join(p.directory, "exclusive.lock"), { mode: 0o700 });
  await exclusiveFile(join(p.directory, "journal.jsonl"), "");
  await append(p, [], { schema: "osiris.shared-claims/v1", event: "GENESIS" });
  await syncDirectory(p.directory);
  await rmdir(join(p.directory, "exclusive.lock"));
  await syncDirectory(p.directory);
  return frozen({ ...p });
}
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
  // Open never initializes, repairs, deletes, or adopts an existing lock.
  await transaction(p, async () => true);
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
        const record = await append(p, records, {
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
        });
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
        await append(p, records, {
          event: "EXECUTING",
          token,
          supervisorId,
          observedAt: new Date().toISOString(),
        });
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
        return true;
      });
    },
    async quarantine(token, reason) {
      requireValue(
        ["STOP_OR_UNCERTAIN", "WORKER_EXIT"].includes(reason),
        "INVALID_QUARANTINE_REASON"
      );
      return transaction(p, async records => {
        const a = await active(records, token);
        if (a.state.event !== "QUARANTINED")
          await append(p, records, {
            event: "QUARANTINED",
            token,
            supervisorId,
            reason,
            observedAt: new Date().toISOString(),
          });
        return true;
      });
    },
    async inspect() {
      return transaction(p, async records => frozen(records));
    },
  });
}
