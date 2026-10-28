import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRuleZeroLauncher } from "./launcher.mjs";
import { createFileNonceStore } from "./nonce-store.mjs";
import { verifyProbeAttestation } from "./attestation.mjs";
import { evaluatePreflight } from "./preflight.mjs";
import { collectProviderProbe } from "./trusted-probes.mjs";

const keys = generateKeyPairSync("ed25519");
const now = Date.parse("2026-10-28T22:00:00Z");
const job = Object.freeze({
  id: "job_security_123",
  target: "osiris-web/staging",
  commit: "a".repeat(40),
});
const checks = Object.fromEntries(
  [
    "connectivity",
    "authentication",
    "authorization",
    "providerStatus",
    "quota",
    "sourceBaseline",
  ].map(name => [name, "PASS"])
);
const observation = j => ({
  jobId: j.id,
  target: j.target,
  commit: j.commit,
  checkedAt: new Date(now).toISOString(),
  credentialExpiry: new Date(now + 3600000).toISOString(),
  checks: { ...checks },
});
const approval = j => ({
  approved: true,
  approvalId: "approval_security_123",
  jobId: j.id,
  target: j.target,
  commit: j.commit,
  expiresAt: new Date(now + 120000).toISOString(),
});

async function harness(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "rule-zero-adversarial-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const launched = [];
  const deps = {
    signingKey: keys.privateKey,
    pinnedPublicKey: keys.publicKey,
    probe: async j => observation(j),
    clock: () => now,
    consumeNonce: createFileNonceStore(directory),
    verifyOwnerApproval: async j => approval(j),
    launch: async j => {
      launched.push({ ...j });
      return {
        runId: "synthetic_run",
        jobId: j.id,
        target: j.target,
        commit: j.commit,
      };
    },
    ...overrides,
  };
  return { run: createRuleZeroLauncher(deps), launched, deps, directory };
}

for (const [name, change] of [
  [
    "missing credentials",
    e => {
      delete e.credentialExpiry;
    },
  ],
  [
    "expired credentials",
    e => {
      e.credentialExpiry = new Date(now - 1).toISOString();
    },
  ],
  [
    "not-applicable expiry cannot exempt authenticated jobs",
    e => {
      e.credentialExpiry = "not-applicable";
    },
  ],
  [
    "revoked credentials",
    e => {
      e.checks.authentication = "FAIL";
    },
  ],
  [
    "unknown authentication",
    e => {
      e.checks.authentication = "UNKNOWN";
    },
  ],
  [
    "wrong account or tenant",
    e => {
      e.checks.authorization = "FAIL";
    },
  ],
  [
    "insufficient permissions",
    e => {
      e.checks.authorization = "UNKNOWN";
    },
  ],
  [
    "provider outage",
    e => {
      e.checks.providerStatus = "FAIL";
    },
  ],
  [
    "rate limited",
    e => {
      e.checks.quota = "FAIL";
    },
  ],
  [
    "unsupported quota is never silently passed",
    e => {
      e.checks.quota = "UNKNOWN";
    },
  ],
  [
    "missing checks",
    e => {
      delete e.checks;
    },
  ],
  [
    "wrong probe job",
    e => {
      e.jobId = "other_job_123";
    },
  ],
  [
    "wrong probe target",
    e => {
      e.target = "other/target";
    },
  ],
  [
    "wrong probe commit",
    e => {
      e.commit = "b".repeat(40);
    },
  ],
  [
    "missing probe commit",
    e => {
      delete e.commit;
    },
  ],
  [
    "stale probe cannot be freshly signed",
    e => {
      e.checkedAt = new Date(now - 3600000).toISOString();
    },
  ],
  [
    "missing observation timestamp",
    e => {
      delete e.checkedAt;
    },
  ],
  [
    "future observation",
    e => {
      e.checkedAt = new Date(now + 60000).toISOString();
    },
  ],
])
  test(`launcher blocks ${name}`, async t => {
    const h = await harness(t, {
      probe: async j => {
        const e = observation(j);
        change(e);
        return e;
      },
    });
    assert.equal((await h.run(job)).light, "RED");
    assert.equal(h.launched.length, 0);
  });

for (const [name, verify] of [
  ["missing approval", async () => null],
  ["forged boolean approval", async () => true],
  ["denied approval", async j => ({ ...approval(j), approved: false })],
  [
    "another job approval",
    async j => ({ ...approval(j), jobId: "other_job_123" }),
  ],
  [
    "another target approval",
    async j => ({ ...approval(j), target: "other/target" }),
  ],
  [
    "another commit approval",
    async j => ({ ...approval(j), commit: "b".repeat(40) }),
  ],
  [
    "expired approval",
    async j => ({ ...approval(j), expiresAt: new Date(now - 1).toISOString() }),
  ],
  [
    "missing approval identity",
    async j => ({ ...approval(j), approvalId: undefined }),
  ],
  [
    "unavailable approval service",
    async () => {
      throw Error("synthetic unavailable");
    },
  ],
])
  test(`launcher blocks ${name}`, async t => {
    const h = await harness(t, { verifyOwnerApproval: verify });
    assert.equal((await h.run(job)).light, "RED");
    assert.equal(h.launched.length, 0);
  });

test("authorized synthetic job returns a bound receipt once", async t => {
  const h = await harness(t);
  assert.deepEqual(await h.run(job), {
    light: "GREEN",
    decision: "LAUNCHED",
    runId: "synthetic_run",
  });
  assert.deepEqual(h.launched, [job]);
  assert.equal((await h.run(job)).light, "RED");
  assert.equal(h.launched.length, 1);
});
test("mutable caller target never changes approved execution", async t => {
  const input = { ...job };
  const h = await harness(t, {
    verifyOwnerApproval: async j => {
      input.target = "other/target";
      input.commit = "b".repeat(40);
      input.id = "other_job_123";
      return approval(j);
    },
  });
  assert.equal((await h.run(input)).light, "GREEN");
  assert.deepEqual(h.launched, [job]);
});
test("caller cannot replace host key, probes, approval callback, or launch callback", async t => {
  const h = await harness(t, { verifyOwnerApproval: async () => false });
  const result = await h.run({
    ...job,
    pinnedPublicKey: keys.publicKey,
    probe: async () => observation(job),
    ownerApproval: true,
    verifyOwnerApproval: async () => true,
    launch: () => {
      throw Error("caller function");
    },
  });
  assert.equal(result.light, "RED");
  assert.equal(h.launched.length, 0);
});
test("concurrent launcher instances cannot reuse an approval", async t => {
  const h = await harness(t);
  const other = createRuleZeroLauncher(h.deps);
  const results = await Promise.all([h.run(job), other(job)]);
  assert.equal(results.filter(r => r.light === "GREEN").length, 1);
  assert.equal(h.launched.length, 1);
});
test("an approval ID cannot be reused for a different job", async t => {
  const h = await harness(t);
  assert.equal((await h.run(job)).light, "GREEN");
  assert.equal((await h.run({ ...job, id: "other_job_123" })).light, "RED");
  assert.equal(h.launched.length, 1);
});
test("same job cannot relaunch using a fresh approval ID", async t => {
  const h = await harness(t, {
    verifyOwnerApproval: async j => ({
      ...approval(j),
      approvalId: `approval_${randomBytes(8).toString("hex")}`,
    }),
  });
  const results = await Promise.all([h.run(job), h.run(job)]);
  assert.equal(results.filter(r => r.light === "GREEN").length, 1);
  assert.equal(h.launched.length, 1);
});
for (const stage of ["approval", "persistence"])
  test(`expiry during ${stage} blocks execution`, async t => {
    let time = now;
    const h = await harness(t, { clock: () => time });
    let consumes = 0;
    const consume = h.deps.consumeNonce;
    h.deps.consumeNonce = async (...args) => {
      const result = await consume(...args);
      if (stage === "persistence" && ++consumes === 3) time += 7200000;
      return result;
    };
    h.deps.verifyOwnerApproval = async j => {
      if (stage === "approval") time += 7200000;
      return approval(j);
    };
    assert.equal((await createRuleZeroLauncher(h.deps)(job)).light, "RED");
    assert.equal(h.launched.length, 0);
  });
for (const clock of [
  () => NaN,
  () => {
    throw Error("clock failure");
  },
])
  test("invalid clock blocks before execution", async t => {
    const h = await harness(t, { clock });
    assert.equal((await h.run(job)).light, "RED");
    assert.equal(h.launched.length, 0);
  });
for (const [name, dependency] of [
  [
    "probe failure",
    {
      probe: async () => {
        throw Error("probe");
      },
    },
  ],
  ["failed nonce store", { consumeNonce: async () => false }],
  ["unknown nonce response", { consumeNonce: async () => "true" }],
  [
    "unavailable nonce store",
    {
      consumeNonce: async () => {
        throw Error("store");
      },
    },
  ],
  [
    "wrong signing key",
    { pinnedPublicKey: generateKeyPairSync("ed25519").publicKey },
  ],
  ["signer failure", { signingKey: "synthetic-invalid-key" }],
])
  test(`launcher blocks ${name}`, async t => {
    const h = await harness(t, dependency);
    assert.equal((await h.run(job)).light, "RED");
    assert.equal(h.launched.length, 0);
  });
for (const target of [
  "../production",
  "osiris-web/../production",
  "/osiris-web/staging",
  "osiris-web//staging",
])
  test(`noncanonical target ${target} is rejected`, async t => {
    const h = await harness(t);
    assert.equal((await h.run({ ...job, target })).light, "RED");
    assert.equal(h.launched.length, 0);
  });
for (const [name, launch] of [
  [
    "runner failure",
    async () => {
      throw Error("runner");
    },
  ],
  ["missing receipt", async () => undefined],
  [
    "wrong job receipt",
    async () => ({
      runId: "synthetic_run",
      jobId: "wrong_job",
      target: job.target,
      commit: job.commit,
    }),
  ],
  [
    "wrong target receipt",
    async () => ({
      runId: "synthetic_run",
      jobId: job.id,
      target: "other/target",
      commit: job.commit,
    }),
  ],
  [
    "wrong commit receipt",
    async () => ({
      runId: "synthetic_run",
      jobId: job.id,
      target: job.target,
      commit: "b".repeat(40),
    }),
  ],
])
  test(`${name} never reports GREEN and burns the claim`, async t => {
    let attempts = 0;
    const h = await harness(t, {
      launch: async j => {
        attempts++;
        return launch(j);
      },
    });
    assert.equal((await h.run(job)).light, "RED");
    assert.equal(attempts, 1);
    assert.equal((await h.run(job)).light, "RED");
    assert.equal(attempts, 1);
  });
test("missing trusted host dependencies cannot construct launcher", () => {
  assert.throws(
    () => createRuleZeroLauncher({}),
    /TRUSTED_HOST_NOT_CONFIGURED/
  );
});

function envelope(overrides = {}, key = keys.privateKey) {
  const payload = JSON.stringify({
    ...observation(job),
    source: "trusted-runner",
    nonce: randomBytes(24).toString("hex"),
    ...overrides,
  });
  return {
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  };
}
function verify(envelope, overrides = {}) {
  return verifyProbeAttestation({
    envelope,
    trustedPublicKey: keys.publicKey,
    expectedJobId: job.id,
    expectedTarget: job.target,
    expectedCommit: job.commit,
    consumeNonce: async () => true,
    now,
    ...overrides,
  });
}
for (const [name, make, options] of [
  [
    "wrong Ed25519 key",
    () => envelope({}, generateKeyPairSync("ed25519").privateKey),
    {},
  ],
  ["wrong target", () => envelope({ target: "other/target" }), {}],
  ["missing nonce", () => envelope({ nonce: undefined }), {}],
  [
    "wrong key type",
    () => envelope(),
    {
      trustedPublicKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
        .publicKey,
    },
  ],
  ["missing nonce store", () => envelope(), { consumeNonce: undefined }],
  [
    "nonce exception",
    () => envelope(),
    {
      consumeNonce: async () => {
        throw Error("store");
      },
    },
  ],
  ["invalid clock", () => envelope(), { now: NaN }],
  [
    "noncanonical signature",
    () => {
      const e = envelope();
      e.signature += "\n";
      return e;
    },
    {},
  ],
])
  test(`attestation rejects ${name}`, async () => {
    assert.equal((await verify(make(), options)).light, "RED");
  });
test("signed evidence nonce is consumed exactly once under concurrency", async t => {
  const h = await harness(t);
  const e = envelope();
  const results = await Promise.all([
    verify(e, { consumeNonce: h.deps.consumeNonce }),
    verify(e, { consumeNonce: h.deps.consumeNonce }),
  ]);
  assert.equal(
    results.filter(r => r.reasons.includes("REPLAY_OR_NONCE_STORE_UNAVAILABLE"))
      .length,
    1
  );
  assert.ok(results.every(r => r.light === "RED"));
});
test("signed non-JSON payload is blocked", async () => {
  const payload = "not JSON";
  assert.deepEqual(
    (
      await verify({
        payload,
        signature: sign(null, Buffer.from(payload), keys.privateKey).toString(
          "base64"
        ),
      })
    ).reasons,
    ["INVALID_PAYLOAD"]
  );
});
test("invalid clock cannot bypass raw evaluator expiry and freshness checks", () => {
  assert.equal(
    evaluatePreflight(
      { ...observation(job), source: "trusted-runner", ownerApproval: true },
      NaN
    ).light,
    "RED"
  );
});

test("filesystem replay claims are atomic across separate Node processes", async t => {
  const h = await harness(t);
  const url = new URL("./nonce-store.mjs", import.meta.url).href;
  const code = `import {createFileNonceStore} from ${JSON.stringify(url)};console.log(await createFileNonceStore(process.argv[1])('a'.repeat(32),'job_process_123'));`;
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      promisify(execFile)(process.execPath, [
        "--input-type=module",
        "-e",
        code,
        h.directory,
      ])
    )
  );
  assert.equal(results.filter(r => r.stdout.trim() === "true").length, 1);
});
test("filesystem storage failure blocks instead of falling back to memory", async t => {
  const h = await harness(t);
  const file = join(h.directory, "not-a-directory");
  await writeFile(file, "synthetic");
  const run = createRuleZeroLauncher({
    ...h.deps,
    consumeNonce: createFileNonceStore(file),
  });
  assert.equal((await run(job)).light, "RED");
  assert.equal(h.launched.length, 0);
});

const probeBase = {
  provider: "github",
  credential: "SYNTHETIC_ONLY",
  expectedIdentity: "synthetic-owner",
  jobId: job.id,
  target: job.target,
  now,
};
for (const [status, classification, remaining] of [
  [401, "AUTH_EXPIRED", null],
  [403, "API_ACCESS_BLOCKED", null],
  [429, "RATE_LIMITED", null],
  [403, "RATE_LIMITED", "0"],
  [503, "PROVIDER_ERROR", null],
])
  test(`provider HTTP ${status}/${remaining} is classified and blocked`, async () => {
    const result = await collectProviderProbe({
      ...probeBase,
      fetchImpl: async () => ({
        status,
        ok: false,
        headers: { get: () => remaining },
      }),
    });
    assert.equal(result.classification, classification);
    assert.equal(result.light, "RED");
  });
test("Cloudflare wrong account identity fails closed", async () => {
  const result = await collectProviderProbe({
    ...probeBase,
    provider: "cloudflare",
    fetchImpl: async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({ result: { email: "other@example.invalid" } }),
    }),
  });
  assert.equal(result.identityMatch, false);
  assert.equal(result.light, "RED");
});
test("malformed provider response fails closed", async () => {
  const result = await collectProviderProbe({
    ...probeBase,
    fetchImpl: async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => {
        throw Error("invalid JSON");
      },
    }),
  });
  assert.equal(result.light, "RED");
});
test("provider timeout aborts and blocks without a live request", async () => {
  const result = await collectProviderProbe({
    ...probeBase,
    fetchImpl: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(Error("synthetic timeout")),
          { once: true }
        );
      }),
  });
  assert.equal(result.classification, "PROVIDER_ERROR");
  assert.equal(result.light, "RED");
});

test("missing replay directory is not silently initialized", async t => {
  const h = await harness(t);
  const missing = join(h.directory, "missing-store");
  const run = createRuleZeroLauncher({
    ...h.deps,
    consumeNonce: createFileNonceStore(missing),
  });
  assert.equal((await run(job)).light, "RED");
  assert.equal(h.launched.length, 0);
});
test("deleted replay directory never resets replay protection", async t => {
  const h = await harness(t);
  const nonce = "a".repeat(32);
  assert.equal(await h.deps.consumeNonce(nonce, job.id), true);
  await rm(h.directory, { recursive: true });
  await assert.rejects(h.deps.consumeNonce(nonce, job.id));
});
test("unsafe replay directory permissions fail closed", async t => {
  const { chmod } = await import("node:fs/promises");
  const h = await harness(t);
  await chmod(h.directory, 0o777);
  assert.equal((await h.run(job)).light, "RED");
  assert.equal(h.launched.length, 0);
});
test("symlink replay directory fails closed", async t => {
  const { symlink } = await import("node:fs/promises");
  const h = await harness(t);
  const link = join(h.directory, "alias");
  await symlink(h.directory, link);
  const run = createRuleZeroLauncher({
    ...h.deps,
    consumeNonce: createFileNonceStore(link),
  });
  assert.equal((await run(job)).light, "RED");
  assert.equal(h.launched.length, 0);
});
