import { spawn } from "node:child_process";
import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  createHash,
} from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  chown,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createPlanYAdmission } from "./plan-y-admission.mjs";
import { createRuleZeroLauncher } from "./launcher.mjs";
import { createFileNonceStore } from "./nonce-store.mjs";
import {
  canonicalJSON,
  publicKeyFingerprint,
  readSigned,
  verifyAgentContract,
  pinnedEd25519Key,
} from "./plan-y.mjs";

const BASE = "da4a33ef14eebbe373568c61fd6c9ba428f25883";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const blocked = reason =>
  Object.freeze({
    light: "RED",
    decision: "PREFLIGHT_BLOCKED",
    reasons: Object.freeze([reason]),
  });
const signed = (body, key) => {
  const payload = canonicalJSON(body);
  return Object.freeze({
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  });
};
const env = input =>
  Object.freeze({ payload: input?.payload, signature: input?.signature });
const exact = (obj, keys) =>
  obj &&
  Object.keys(obj).length === keys.length &&
  keys.every(k => Object.hasOwn(obj, k));

/** Fixed Linux synthetic workers only. This host API is not exposed over worker
 * IPC. No caller-supplied runner, broker, registry or authorization callback.
 */
export async function createTrustedSupervisor(options) {
  const allowed = [
    "authorityKey",
    "contractKey",
    "context",
    "agentIds",
    "stateDirectory",
    "leaseMs",
    "operationMs",
    "scenario",
  ];
  if (
    !options ||
    Object.keys(options).some(k => !allowed.includes(k)) ||
    process.platform !== "linux" ||
    process.arch !== "x64"
  )
    throw new Error("SUPERVISOR_HOST_NOT_CONFIGURED");
  const {
    stateDirectory: root,
    leaseMs = 3000,
    operationMs = 500,
    scenario = "normal",
  } = options;
  if (
    !isAbsolute(root ?? "") ||
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 100 ||
    leaseMs > 10000 ||
    !Number.isSafeInteger(operationMs) ||
    operationMs < 20 ||
    operationMs > 3000 ||
    !["normal", "ignore-term"].includes(scenario)
  )
    throw new Error("INVALID_SUPERVISOR_LIMITS");
  const stat = await lstat(root);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.mode & 0o077 ||
    stat.uid !== process.getuid() ||
    (await readdir(root)).length
  )
    throw new Error("PRIVATE_EMPTY_STATE_DIRECTORY_REQUIRED");
  const parentStatus = await readFile("/proc/self/status", "utf8");
  const caps = BigInt("0x" + parentStatus.match(/^CapEff:\s+([0-9a-f]+)$/m)[1]);
  const uidMap = await readFile("/proc/self/uid_map", "utf8");
  const mapped = uidMap
    .trim()
    .split("\n")
    .some(line => {
      const [inside, , count] = line.trim().split(/\s+/).map(Number);
      return 65534 >= inside && 65534 < inside + count;
    });
  const separateUid =
    process.getuid() === 0 && mapped && (caps & 193n) === 193n;
  if (!separateUid && caps !== 0n)
    throw new Error("CAPABILITYLESS_WORKER_PROFILE_UNAVAILABLE");
  const workerUid = separateUid ? 65534 : process.getuid();
  const context = Object.freeze({
    taskId: options.context?.taskId,
    ownerId: options.context?.ownerId,
    tenantId: options.context?.tenantId,
  });
  const authorityKey = pinnedEd25519Key(options.authorityKey),
    contractKey = pinnedEd25519Key(options.contractKey);
  const ids = [...(options.agentIds ?? [])];
  if (
    !ids.length ||
    ids.length > 8 ||
    new Set(ids).size !== ids.length ||
    ids.some(id => typeof id !== "string" || !/^NR-[0-9]{5}$/.test(id))
  )
    throw new Error("INVALID_AGENT_REGISTRY");
  const keys = new Map(ids.map(id => [id, generateKeyPairSync("ed25519")]));
  const agentKeys = new Map(
    [...keys].map(([id, pair]) => [id, pair.publicKey])
  );
  const leases = new Map(),
    jobs = new Map();
  const metrics = {
    spawned: 0,
    adapterInvocations: 0,
    adapterPrepared: 0,
    deniedOperations: 0,
  };
  let unhealthy = false,
    closing = false;
  const auditPath = join(root, "events.jsonl");
  await mkdir(join(root, "claims"), { mode: 0o700 });
  await mkdir(join(root, "resources"), { mode: 0o700 });
  const resources = new Map();
  for (const [id, zone, value] of [
    ["fixture-a", "staging/fixtures", "synthetic fixture A"],
    ["fixture-b", "staging/restricted", "synthetic restricted fixture B"],
  ]) {
    const file = join(root, "resources", `${id}.txt`);
    await writeFile(file, value, { mode: 0o600, flag: "wx" });
    resources.set(
      id,
      Object.freeze({
        file,
        zone,
        tokens: Buffer.byteLength(value),
        costMicros: 5,
      })
    );
  }
  async function writeAudit(record) {
    let handle;
    try {
      handle = await open(
        auditPath,
        constants.O_WRONLY |
          constants.O_APPEND |
          constants.O_CREAT |
          constants.O_NOFOLLOW,
        0o600
      );
      await handle.writeFile(
        JSON.stringify({ ...record, observedAt: new Date().toISOString() }) +
          "\n"
      );
      await handle.sync();
      return true;
    } catch {
      unhealthy = true;
      return false;
    } finally {
      await handle?.close();
    }
  }
  async function audit(record) {
    let timer;
    const attempt = writeAudit(record).catch(() => {
      unhealthy = true;
      return false;
    });
    try {
      return await Promise.race([
        attempt,
        new Promise(resolve => {
          timer = setTimeout(() => {
            unhealthy = true;
            resolve(false);
          }, 200);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const consumeNonce = createFileNonceStore(join(root, "claims"));
  const validate = bundle =>
    verifyAgentContract({
      ...bundle,
      authorityKey,
      contractKey,
      agentKeys,
      context,
      now: Date.now(),
    });
  const settle = (lease, result) => {
    if (!lease.pending) return;
    clearTimeout(lease.pending.timer);
    const resolve = lease.pending.resolve;
    lease.pending = null;
    resolve(result);
  };
  async function stop(lease, reason) {
    if (lease.stopPromise) return lease.stopPromise;
    lease.revoked = true;
    lease.generation++;
    clearTimeout(lease.timer);
    settle(lease, blocked(reason));
    lease.stopPromise = (async () => {
      const revocationAttempt = audit({
        event: "LEASE_REVOKED",
        agentId: lease.agentId,
        contractId: lease.contract.contractId,
        pid: lease.child?.pid ?? null,
        reason,
      });
      if (!lease.child)
        return Object.freeze({
          observedExit: false,
          spawnNeverStarted: true,
          revocationPersisted: await revocationAttempt,
        });
      if (!lease.exited) {
        try {
          lease.child.kill("SIGTERM");
        } catch {
          /* Never equate kill return with exit. */
        }
        await Promise.race([lease.exitPromise, sleep(80)]);
      }
      if (!lease.exited) {
        try {
          lease.child.kill("SIGKILL");
        } catch {
          /* Evidence must still come from close. */
        }
        await Promise.race([lease.exitPromise, sleep(700)]);
      }
      if (!lease.exited) {
        unhealthy = true;
        lease.phase = "STOP_UNVERIFIED";
        return Object.freeze({
          observedExit: false,
          revocationPersisted: await revocationAttempt,
        });
      }
      await lease.exitPromise;
      return Object.freeze({
        ...lease.exitEvidence,
        revocationPersisted: await revocationAttempt,
      });
    })();
    return lease.stopPromise;
  }
  const failOperation = async (lease, reason) => {
    metrics.deniedOperations++;
    await stop(lease, reason);
    return blocked(reason);
  };
  async function executeAdapter(record) {
    const lease = leases.get(record.agentId),
      op = lease?.currentOperation;
    const generation = lease?.generation;
    const resource = resources.get(op?.resourceId);
    const permitted = () =>
      lease &&
      !unhealthy &&
      !closing &&
      lease.admitted &&
      !lease.revoked &&
      !lease.exited &&
      lease.phase === "RUNNING" &&
      lease.generation === generation &&
      record.contractId === lease.contract.contractId &&
      op &&
      record.tool === op.request.tool &&
      ["read_fixture", "hash_fixture", "delayed_read_fixture"].includes(
        record.tool
      ) &&
      resource &&
      lease.contract.tools.includes(record.tool) &&
      lease.contract.zones.includes(resource.zone) &&
      record.zone === resource.zone &&
      record.tokens === resource.tokens &&
      record.costMicros === resource.costMicros &&
      Date.parse(lease.contract.expiresAt) > Date.now();
    if (!permitted()) {
      await failOperation(lease, "ADAPTER_SCOPE_VIOLATION");
      throw new Error("ADAPTER_SCOPE_VIOLATION");
    }
    if (record.tool === "delayed_read_fixture") {
      metrics.adapterPrepared++;
      await audit({
        event: "ADAPTER_PREPARED",
        agentId: lease.agentId,
        contractId: record.contractId,
      });
      await sleep(60);
    }
    if (!permitted()) throw new Error("LEASE_REVOKED_BEFORE_EFFECT");
    let handle;
    try {
      handle = await open(
        resource.file,
        constants.O_RDONLY | constants.O_NOFOLLOW
      );
      const info = await handle.stat();
      if (
        !info.isFile() ||
        info.size > 64 ||
        info.size !== resource.tokens ||
        !permitted()
      )
        throw new Error("RESOURCE_BOUNDARY_VIOLATION");
      // This is the sole synthetic effect point; all guards run before it.
      metrics.adapterInvocations++;
      const buffer = Buffer.alloc(65);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 64 || bytesRead !== resource.tokens)
        throw new Error("RESOURCE_CHANGED_DURING_READ");
      const data = buffer.subarray(0, bytesRead);
      const receiptId = createHash("sha256")
        .update(data)
        .update(op.request.nonce)
        .digest("hex");
      if (!permitted()) throw new Error("LATE_ADAPTER_RESULT");
      return { receiptId };
    } catch {
      await failOperation(lease, "ADAPTER_RESOURCE_OR_LEASE_INVALID");
      throw new Error("ADAPTER_DENIED");
    } finally {
      await handle?.close();
    }
  }
  async function launch(job) {
    const lease = jobs.get(job.id);
    if (!lease || lease.revoked || unhealthy || closing)
      throw new Error("LEASE_NOT_ADMITTED");
    const directory = await mkdtemp(
      join(tmpdir(), "osiris-disposable-worker-")
    );
    lease.directory = directory;
    const worker = join(directory, "worker.mjs");
    await copyFile(
      fileURLToPath(
        new URL("./synthetic-supervised-worker.mjs", import.meta.url)
      ),
      worker
    );
    await chmod(worker, 0o400);
    if (separateUid) {
      await chown(directory, 65534, 65534);
      await chown(worker, 65534, 65534);
    }
    let readyResolve;
    const ready = new Promise(resolve => {
      readyResolve = resolve;
    });
    const challenge = randomBytes(24).toString("hex");
    const child = spawn(
      "/usr/bin/python3",
      [
        fileURLToPath(
          new URL("./synthetic-worker-bootstrap.py", import.meta.url)
        ),
        process.execPath,
        worker,
        String(workerUid),
      ],
      {
        cwd: directory,
        env: {},
        stdio: ["ignore", "pipe", "pipe", "ipc", "pipe"],
      }
    );
    lease.child = child;
    lease.phase = "STARTING";
    metrics.spawned++;
    const bootstrapEvidence = new Promise(resolve => {
      let text = "";
      child.stdio[4].on("data", chunk => {
        text += chunk;
        if (text.length > 2048) {
          child.stdio[4].destroy();
          resolve(null);
        }
      });
      child.stdio[4].on("end", () => {
        try {
          resolve(JSON.parse(text));
        } catch {
          resolve(null);
        }
      });
      child.stdio[4].on("error", () => resolve(null));
    });
    child.stdout.on("data", () => {});
    child.stderr.on("data", () => {});
    lease.exitPromise = new Promise(resolve => {
      child.once("error", () => {
        readyResolve(false);
      });
      child.once("close", async (exitCode, signal) => {
        lease.exited = true;
        lease.revoked = true;
        lease.generation++;
        lease.phase = "STOPPED";
        clearTimeout(lease.timer);
        readyResolve(false);
        settle(lease, blocked("WORKER_EXITED"));
        const record = {
          event: "PROCESS_EXIT_OBSERVED",
          agentId: lease.agentId,
          contractId: lease.contract.contractId,
          pid: child.pid ?? null,
          exitCode,
          signal,
          observedExit: true,
        };
        const auditPersisted = await audit(record);
        lease.exitEvidence = Object.freeze({ ...record, auditPersisted });
        resolve(lease.exitEvidence);
      });
    });
    child.on("message", async message => {
      if (lease.exited || lease.revoked) return;
      try {
        if (message?.type === "HELLO" && !lease.initialized) {
          lease.initialized = true;
          child.send({
            type: "INIT",
            contract: lease.contract,
            contractHash: lease.verified.contractHash,
            challenge,
            scenario,
            agentPrivateKey: keys
              .get(lease.agentId)
              .privateKey.export({ type: "pkcs8", format: "pem" }),
          });
        } else if (message?.type === "READY" && lease.phase === "STARTING") {
          const proof = readSigned(
            message.envelope,
            agentKeys.get(lease.agentId)
          );
          const status = await Promise.race([
            bootstrapEvidence,
            sleep(500).then(() => null),
          ]);
          const profile = {
            identity:
              proof.schema === "osiris.worker-ready/v1" &&
              proof.agentId === lease.agentId &&
              proof.pid === child.pid &&
              proof.challenge === challenge,
            bootstrapPid: status?.pid === child.pid,
            noNewPrivs: status?.NoNewPrivs === "1",
            seccomp: status?.Seccomp === "2",
            caps: /^0+$/.test(status?.CapEff ?? ""),
            uid:
              status?.Uid?.split(/\s+/).every(v => Number(v) === workerUid) ===
              true,
            networkDenied: status?.networkDenied === true,
            parentSignalDenied: status?.parentSignalDenied === true,
          };
          if (Object.values(profile).some(value => !value)) {
            await audit({ event: "ISOLATION_CHECK_FAILED", profile });
            throw new Error("ISOLATION_NOT_OBSERVED");
          }
          lease.bootstrapEvidence = Object.freeze(profile);
          lease.phase = "RUNNING";
          lease.isolationObserved = true;
          readyResolve(true);
        } else if (message?.type === "PROBE_RESULT") {
          if (
            lease.pending?.kind !== "PROBE" ||
            lease.pending.requestId !== message.requestId
          )
            throw new Error("UNKNOWN_PROBE");
          settle(
            lease,
            Object.freeze({
              light: "GREEN",
              evidence: readSigned(
                message.envelope,
                agentKeys.get(lease.agentId)
              ),
            })
          );
        } else if (message?.type === "OPERATION") {
          const operation = readSigned(
            message.envelope,
            agentKeys.get(lease.agentId)
          );
          if (
            !exact(operation, [
              "schema",
              "requestId",
              "agentId",
              "contractId",
              "resourceId",
              "actionEnvelope",
            ]) ||
            operation.schema !== "osiris.worker-operation/v1" ||
            operation.agentId !== lease.agentId ||
            operation.contractId !== lease.contract.contractId ||
            lease.pending?.kind !== "OPERATION" ||
            operation.requestId !== lease.pending.requestId ||
            lease.currentOperation
          )
            throw new Error("IPC_IDENTITY_OR_REQUEST_MISMATCH");
          const request = readSigned(
            operation.actionEnvelope,
            agentKeys.get(lease.agentId)
          );
          lease.currentOperation = Object.freeze({
            resourceId: operation.resourceId,
            request,
          });
          const generation = lease.generation;
          const result = await gate.requestAction({
            contractId: lease.contract.contractId,
            requestEnvelope: operation.actionEnvelope,
          });
          lease.currentOperation = null;
          if (result.light !== "GREEN") {
            await failOperation(lease, "PLAN_Y_OPERATION_DENIED");
            return;
          }
          if (
            lease.revoked ||
            lease.exited ||
            lease.generation !== generation
          ) {
            settle(lease, blocked("LATE_CALLBACK_REJECTED"));
            return;
          }
          settle(lease, result);
        } else throw new Error("UNEXPECTED_WORKER_MESSAGE");
      } catch (error) {
        await audit({
          event: "WORKER_PROTOCOL_REJECTED",
          code:
            typeof error?.code === "string"
              ? error.code
              : [
                    "INVALID_SIGNATURE",
                    "INVALID_SCHEMA",
                    "NONCANONICAL_SIGNED_DATA",
                    "ISOLATION_NOT_OBSERVED",
                  ].includes(error?.message)
                ? error.message
                : "PROTOCOL_INVALID",
        });
        readyResolve(false);
        await failOperation(lease, "WORKER_AUTHENTICATION_OR_PROTOCOL_FAILED");
      }
    });
    const admitted = await Promise.race([ready, sleep(1200).then(() => false)]);
    if (!admitted || lease.revoked) {
      await stop(lease, "WORKER_START_OR_ISOLATION_FAILED");
      throw new Error("WORKER_NOT_READY");
    }
    lease.timer = setTimeout(
      () => {
        void stop(lease, "LEASE_TIMEOUT");
      },
      Math.min(leaseMs, Date.parse(lease.contract.expiresAt) - Date.now())
    );
    await audit({
      event: "WORKER_READY_OBSERVED",
      agentId: lease.agentId,
      contractId: lease.contract.contractId,
      pid: child.pid,
      isolationObserved: true,
    });
    return {
      runId: `pid_${child.pid}`,
      jobId: job.id,
      target: job.target,
      commit: job.commit,
    };
  }
  const runnerKeys = generateKeyPairSync("ed25519");
  const core = createRuleZeroLauncher({
    signingKey: runnerKeys.privateKey,
    pinnedPublicKey: runnerKeys.publicKey,
    consumeNonce,
    probe: async job => ({
      jobId: job.id,
      target: job.target,
      commit: job.commit,
      checkedAt: new Date().toISOString(),
      credentialExpiry: new Date(Date.now() + 3600000).toISOString(),
      checks: {
        connectivity: "PASS",
        authentication: "PASS",
        authorization: jobs.has(job.id) ? "PASS" : "FAIL",
        providerStatus: "PASS",
        quota: "PASS",
        sourceBaseline: job.commit === BASE ? "PASS" : "FAIL",
      },
    }),
    verifyOwnerApproval: async job => {
      const lease = jobs.get(job.id);
      validate(lease.bundle);
      return {
        approved: !lease.revoked,
        approvalId: `supervisor_${job.id}`,
        jobId: job.id,
        target: job.target,
        commit: job.commit,
        expiresAt: lease.verified.approval.expiresAt,
      };
    },
    launch: async job => {
      try {
        return await launch(job);
      } catch (error) {
        await audit({
          event: "WORKER_LAUNCH_FAILED",
          jobId: job.id,
          code:
            typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code)
              ? error.code
              : "LAUNCH_FAILED",
        });
        throw new Error("OWNED_LAUNCH_FAILED");
      }
    },
  });
  const gate = createPlanYAdmission({
    authorityKey,
    contractKey,
    agentKeys,
    context,
    allowedTargets: new Set(["osiris-web/staging"]),
    requestLaunch: async job => {
      const result = await core(job);
      await audit({
        event: "RULE_ZERO_RESULT",
        jobId: job.id,
        decision: result.decision,
        reasons: result.reasons ?? [],
      });
      return result;
    },
    audit,
    consumeNonce,
    executeSyntheticAction: executeAdapter,
  });
  async function command(agentId, message, kind) {
    const lease = leases.get(agentId);
    if (
      !lease ||
      lease.phase !== "RUNNING" ||
      !lease.admitted ||
      lease.revoked ||
      lease.exited ||
      unhealthy ||
      closing
    )
      return blocked("LEASE_NOT_ACTIVE");
    if (lease.pending || lease.currentOperation) return blocked("WORKER_BUSY");
    const requestId = randomUUID();
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        void stop(lease, "OPERATION_TIMEOUT");
      }, operationMs);
      lease.pending = { kind, requestId, resolve, timer };
      try {
        lease.child.send({ ...message, requestId }, error => {
          if (error) void stop(lease, "IPC_UNAVAILABLE");
        });
      } catch {
        void stop(lease, "IPC_UNAVAILABLE");
      }
    });
  }
  return Object.freeze({
    getAgentDescriptor(agentId) {
      if (!keys.has(agentId)) throw new Error("UNKNOWN_AGENT");
      return Object.freeze({
        agentId,
        publicKey: keys
          .get(agentId)
          .publicKey.export({ type: "spki", format: "pem" }),
        keyHash: publicKeyFingerprint(keys.get(agentId).publicKey),
      });
    },
    getMetrics: () => Object.freeze({ ...metrics, unhealthy }),
    getStatus(agentId) {
      const l = leases.get(agentId);
      return l
        ? Object.freeze({
            agentId,
            pid: l.child?.pid ?? null,
            phase: l.phase,
            revoked: l.revoked,
            isolationObserved: l.isolationObserved === true,
            workerUid,
            uidSeparated: separateUid,
            exitEvidence: l.exitEvidence ?? null,
          })
        : null;
    },
    async start(input) {
      let lease;
      try {
        if (unhealthy || closing) return blocked("SUPERVISOR_UNAVAILABLE");
        if (!exact(input, ["planJson", "approvalEnvelope", "contractEnvelope"]))
          return blocked("UNSUPPORTED_EXECUTION_INPUT");
        const bundle = Object.freeze({
          planJson: input.planJson,
          approvalEnvelope: env(input.approvalEnvelope),
          contractEnvelope: env(input.contractEnvelope),
        });
        const verified = validate(bundle),
          c = verified.contract;
        if (leases.has(c.agentId) || jobs.has(c.jobId))
          return blocked("AGENT_OR_JOB_ALREADY_USED");
        if ([...leases.values()].filter(l => !l.exited).length >= 2)
          return blocked("SUPERVISOR_CONCURRENCY_LIMIT");
        lease = {
          agentId: c.agentId,
          contract: c,
          bundle,
          verified,
          phase: "PENDING",
          revoked: false,
          generation: 0,
          exited: false,
        };
        leases.set(c.agentId, lease);
        jobs.set(c.jobId, lease);
        const time = Date.now();
        const request = {
          schema: "osiris.agent-admission/v1",
          agentId: c.agentId,
          contractId: c.contractId,
          contractHash: verified.contractHash,
          planHash: verified.hash,
          planVersion: c.planVersion,
          stepId: c.stepId,
          taskId: c.taskId,
          ownerId: c.ownerId,
          tenantId: c.tenantId,
          nonce: randomBytes(16).toString("hex"),
          issuedAt: new Date(time).toISOString(),
          expiresAt: new Date(
            Math.min(time + 5000, Date.parse(c.expiresAt))
          ).toISOString(),
        };
        const result = await gate.submit({
          ...bundle,
          requestEnvelope: signed(request, keys.get(c.agentId).privateKey),
        });
        validate(bundle);
        if (result.light !== "GREEN" || lease.revoked || unhealthy) {
          await stop(lease, "ADMISSION_FAILED");
          return blocked("ADMISSION_FAILED");
        }
        lease.admitted = true;
        return result;
      } catch {
        if (lease) await stop(lease, "START_FAILED");
        return blocked("SUPERVISOR_START_DENIED");
      }
    },
    async dispatch(agentId, operation) {
      try {
        const fields = [
          "tool",
          "resourceId",
          "declaredZone",
          "tokens",
          "costMicros",
          "behavior",
        ];
        if (
          !operation ||
          Object.keys(operation).some(k => !fields.includes(k)) ||
          typeof operation.tool !== "string" ||
          typeof operation.resourceId !== "string" ||
          ![
            "normal",
            "crash",
            "timeout",
            "forged-identity",
            "forged-signature",
          ].includes(operation.behavior ?? "normal")
        )
          return blocked("INVALID_SYNTHETIC_OPERATION");
        const resource = resources.get(operation.resourceId);
        return command(
          agentId,
          {
            ...operation,
            type: "EXECUTE",
            quote: {
              tokens: resource?.tokens ?? 0,
              costMicros: resource?.costMicros ?? 0,
            },
          },
          "OPERATION"
        );
      } catch {
        return blocked("INVALID_SYNTHETIC_OPERATION");
      }
    },
    probeIsolation: agentId => command(agentId, { type: "PROBE" }, "PROBE"),
    async stopAgent(agentId) {
      const lease = leases.get(agentId);
      return lease
        ? stop(lease, "HOST_STOP")
        : Object.freeze({ observedExit: false });
    },
    async waitForExit(agentId) {
      const lease = leases.get(agentId);
      if (!lease?.exitPromise) return null;
      return lease.exitPromise;
    },
    async close() {
      closing = true;
      await Promise.all(
        [...leases.values()].map(l => stop(l, "SUPERVISOR_CLOSE"))
      );
      await Promise.all(
        [...leases.values()].map(l =>
          l.directory && l.exited
            ? rm(l.directory, { recursive: true, force: true })
            : undefined
        )
      );
    },
  });
}
