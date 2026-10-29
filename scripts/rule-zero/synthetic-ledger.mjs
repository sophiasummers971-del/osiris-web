// Local synthetic append-only persistence. No automatic repair or stale-lock takeover.
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rmdir } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { canonicalJSON, hashData } from "./plan-y.mjs";
import { join } from "node:path";
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
export async function privateDirectory(path) {
  const s = await lstat(path);
  requireValue(
    s.isDirectory() &&
      !s.isSymbolicLink() &&
      !(s.mode & 0o077) &&
      s.uid === process.getuid(),
    "CLAIM_DIRECTORY_UNSAFE"
  );
}
export function paths(config) {
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
  return {
    directory: a,
    witnessDirectory: b,
    storeId,
    schema: config.schema ?? "osiris.shared-claims/v1",
  };
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
export async function textFile(path) {
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
export async function exclusiveFile(path, text) {
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
export async function append(p, records, body) {
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
export async function read(p) {
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
    records[0].event === "GENESIS" && records[0].schema === p.schema,
    "CLAIM_GENESIS_INVALID"
  );
  return records;
}
export async function transaction(p, fn) {
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
export async function initializeLedger(config) {
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
  await append(p, [], { schema: p.schema, event: "GENESIS" });
  await syncDirectory(p.directory);
  await rmdir(join(p.directory, "exclusive.lock"));
  await syncDirectory(p.directory);
  return frozen({ ...p });
}
