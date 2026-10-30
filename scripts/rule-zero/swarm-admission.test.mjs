import test from "node:test";
import assert from "node:assert/strict";
import { createSwarmAdmission } from "./swarm-admission.mjs";

const job = Object.freeze({
  id: "swarm_job_1234",
  target: "osiris-web/staging",
  commit: "a".repeat(40),
});
const setup = overrides => {
  let calls = 0;
  const gate = createSwarmAdmission({
    requestLaunch: async candidate => {
      calls++;
      return {
        decision: "LAUNCHED",
        light: "GREEN",
        runId: "run_123",
        jobId: candidate.id,
      };
    },
    allowedTargets: new Set(["osiris-web/staging"]),
    audit: async () => true,
    ...overrides,
  });
  return { gate, calls: () => calls };
};

test("scoped approved job delegates once through Rule Zero launcher", async () => {
  const x = setup();
  assert.equal((await x.gate.submit(job)).decision, "LAUNCHED");
  assert.equal(x.calls(), 1);
  assert.equal((await x.gate.submit(job)).light, "RED");
  assert.equal(x.calls(), 1);
});
test("unapproved target never reaches launcher", async () => {
  const x = setup();
  assert.equal(
    (await x.gate.submit({ ...job, target: "production" })).light,
    "RED"
  );
  assert.equal(x.calls(), 0);
});
test("missing audit blocks before launch", async () => {
  const x = setup({
    audit: async () => {
      throw Error("offline");
    },
  });
  assert.equal((await x.gate.submit(job)).light, "RED");
  assert.equal(x.calls(), 0);
});
test("malformed green receipt is rejected", async () => {
  const x = setup({
    requestLaunch: async () => ({ light: "GREEN", decision: "LAUNCHED" }),
  });
  assert.equal((await x.gate.submit(job)).light, "RED");
});
test("concurrent submissions enforce host-local limit", async () => {
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const x = setup({
    maxConcurrent: 1,
    requestLaunch: async () => {
      await pending;
      return { light: "RED", decision: "PREFLIGHT_BLOCKED" };
    },
  });
  const first = x.gate.submit(job);
  await Promise.resolve();
  const second = await x.gate.submit({
    ...job,
    id: "swarm_job_5678",
  });
  assert.deepEqual(second.reasons, ["SWARM_CONCURRENCY_LIMIT"]);
  release();
  assert.equal((await first).decision, "PREFLIGHT_BLOCKED");
  assert.equal(x.gate.getActiveCount(), 0);
});
test("no direct worker capability appears on facade", () => {
  const x = setup();
  assert.deepEqual(Object.keys(x.gate).sort(), ["getActiveCount", "submit"]);
});

for (const acknowledgment of [false, undefined]) {
  test(`unacknowledged admission audit (${acknowledgment}) never reaches launcher`, async () => {
    const x = setup({ audit: async () => acknowledgment });
    assert.equal((await x.gate.submit(job)).light, "RED");
    assert.equal(x.calls(), 0);
    assert.equal(x.gate.getActiveCount(), 0);
    assert.equal((await x.gate.submit(job)).light, "RED");
    assert.equal(x.calls(), 0);
  });
  test(`unacknowledged completion audit (${acknowledgment}) cannot report GREEN or retry`, async () => {
    const x = setup({
      audit: async event =>
        event.event === "ADMISSION_ATTEMPT" ? true : acknowledgment,
    });
    assert.equal((await x.gate.submit(job)).light, "RED");
    assert.equal((await x.gate.submit(job)).decision, "EFFECT_UNKNOWN_RECONCILE");
    assert.equal(x.calls(), 1); // Launch already happened; audit failure cannot undo it.
    assert.equal((await x.gate.submit(job)).light, "RED");
    assert.equal(x.calls(), 1);
    assert.equal(x.gate.getActiveCount(), 0);
  });
}
test("launcher result cannot turn RED into GREEN while completion audit awaits", async () => {
  const result = {
    light: "RED",
    decision: "PREFLIGHT_BLOCKED",
    reasons: ["OWNER_APPROVAL_MISSING"],
  };
  const x = setup({
    requestLaunch: async () => result,
    audit: async event => {
      if (event.event === "PREFLIGHT_BLOCKED") {
        result.decision = "LAUNCHED";
        result.light = "GREEN";
        result.runId = "forged";
        result.reasons[0] = "FORGED";
      }
      return true;
    },
  });
  const returned = await x.gate.submit(job);
  assert.equal(returned.light, "RED");
  assert.equal(returned.decision, "PREFLIGHT_BLOCKED");
  assert.deepEqual(returned.reasons, ["OWNER_APPROVAL_MISSING"]);
  assert.ok(Object.isFrozen(returned));
  assert.ok(Object.isFrozen(returned.reasons));
});
test("result does not expose extra runner capabilities", async () => {
  const x = setup({
    requestLaunch: async () => ({
      light: "GREEN",
      decision: "LAUNCHED",
      runId: "synthetic_run",
      launch: () => {
        throw Error("privileged host capability");
      },
    }),
  });
  assert.deepEqual(Object.keys(await x.gate.submit(job)).sort(), [
    "decision",
    "light",
    "runId",
  ]);
});
test("throwing input getter returns RED without launcher or capacity leak", async () => {
  const x = setup();
  const result = await x.gate.submit({
    get id() {
      throw Error("untrusted getter");
    },
  });
  assert.equal(result.light, "RED");
  assert.equal(x.calls(), 0);
  assert.equal(x.gate.getActiveCount(), 0);
});
test("caller mutations during admission audit cannot change launch context", async () => {
  const input = { ...job };
  let launched;
  const x = setup({
    audit: async event => {
      if (event.event === "ADMISSION_ATTEMPT") {
        input.id = "other_job_5678";
        input.target = "production";
        input.commit = "b".repeat(40);
      }
      return true;
    },
    requestLaunch: async candidate => {
      launched = candidate;
      return { light: "GREEN", decision: "LAUNCHED", runId: "synthetic_run" };
    },
  });
  assert.equal((await x.gate.submit(input)).light, "GREEN");
  assert.deepEqual(launched, job);
  assert.ok(Object.isFrozen(launched));
});
test("mutating original target allowlist cannot admit another target", async () => {
  const targets = new Set([job.target]);
  const x = setup({ allowedTargets: targets });
  targets.add("production");
  assert.equal(
    (await x.gate.submit({ ...job, target: "production" })).light,
    "RED"
  );
  assert.equal(x.calls(), 0);
});
test("concurrent duplicate ID is denied even when commit differs and audit is pending", async () => {
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const x = setup({
    audit: async () => {
      await pending;
      return true;
    },
  });
  const first = x.gate.submit(job);
  assert.equal(x.gate.getActiveCount(), 1);
  const duplicate = await x.gate.submit({ ...job, commit: "b".repeat(40) });
  assert.deepEqual(duplicate.reasons, ["SWARM_JOB_ALREADY_ADMITTED"]);
  assert.equal(x.calls(), 0);
  release();
  assert.equal((await first).light, "GREEN");
  assert.equal(x.calls(), 1);
  assert.equal(x.gate.getActiveCount(), 0);
});
test("capacity is reserved during audit, then released after completion", async () => {
  let release;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const x = setup({
    maxConcurrent: 1,
    audit: async () => {
      await pending;
      return true;
    },
  });
  const secondJob = { ...job, id: "swarm_job_5678" };
  const first = x.gate.submit(job);
  assert.deepEqual((await x.gate.submit(secondJob)).reasons, [
    "SWARM_CONCURRENCY_LIMIT",
  ]);
  assert.equal(x.calls(), 0);
  release();
  await first;
  assert.equal(x.gate.getActiveCount(), 0);
  assert.equal((await x.gate.submit(secondJob)).light, "GREEN");
  assert.equal(x.calls(), 2);
});
test("throwing completion audit never allows automatic relaunch", async () => {
  const x = setup({
    audit: async event => {
      if (event.event === "LAUNCHED") throw Error("audit offline");
      return true;
    },
  });
  assert.equal((await x.gate.submit(job)).light, "RED");
  assert.equal(x.calls(), 1);
  assert.equal((await x.gate.submit(job)).light, "RED");
  assert.equal(x.calls(), 1);
  assert.equal(x.gate.getActiveCount(), 0);
});
test("throwing launcher burns admission and releases capacity", async () => {
  let calls = 0;
  const x = setup({
    requestLaunch: async () => {
      calls++;
      throw Error("gate offline");
    },
  });
  assert.equal((await x.gate.submit(job)).light, "RED");
  assert.equal((await x.gate.submit(job)).light, "RED");
  assert.equal(calls, 1);
  assert.equal(x.gate.getActiveCount(), 0);
});
for (const target of [
  null,
  {},
  "osiris-web/../production",
  "osiris-web//staging",
]) {
  test(`invalid configured target ${String(target)} is rejected before admission`, () => {
    assert.throws(
      () => setup({ allowedTargets: new Set([target]) }),
      /SWARM_HOST_NOT_CONFIGURED/
    );
  });
}

for (const approved of [false, true]) {
  test(`real Rule Zero launcher integration with owner approval ${approved}`, async t => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { createRuleZeroLauncher } = await import("./launcher.mjs");
    const { createFileNonceStore } = await import("./nonce-store.mjs");
    const directory = await mkdtemp(join(tmpdir(), "swarm-integration-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const keys = generateKeyPairSync("ed25519");
    const now = Date.parse("2026-10-28T22:00:00Z");
    let launches = 0;
    const events = [];
    const requestLaunch = createRuleZeroLauncher({
      signingKey: keys.privateKey,
      pinnedPublicKey: keys.publicKey,
      clock: () => now,
      consumeNonce: createFileNonceStore(directory),
      probe: async j => ({
        jobId: j.id,
        target: j.target,
        commit: j.commit,
        checkedAt: new Date(now).toISOString(),
        credentialExpiry: new Date(now + 3600000).toISOString(),
        checks: Object.fromEntries(
          [
            "connectivity",
            "authentication",
            "authorization",
            "providerStatus",
            "quota",
            "sourceBaseline",
          ].map(name => [name, "PASS"])
        ),
      }),
      verifyOwnerApproval: async j => ({
        approved,
        approvalId: "synthetic_approval",
        jobId: j.id,
        target: j.target,
        commit: j.commit,
        expiresAt: new Date(now + 60000).toISOString(),
      }),
      launch: async j => {
        launches++;
        return {
          runId: "synthetic_run",
          jobId: j.id,
          target: j.target,
          commit: j.commit,
        };
      },
    });
    const { gate } = setup({
      requestLaunch,
      audit: async record => {
        events.push(record);
        return true;
      },
    });
    assert.equal((await gate.submit(job)).light, approved ? "GREEN" : "RED");
    assert.equal(launches, approved ? 1 : 0);
    assert.deepEqual(
      events.map(record => record.event),
      ["ADMISSION_ATTEMPT", approved ? "LAUNCHED" : "PREFLIGHT_BLOCKED"]
    );
    assert.ok(events.every(Object.isFrozen));
    assert.equal(gate.getActiveCount(), 0);
  });
}

test("post-dispatch audit outage reports effect unknown, not preflight blocked", async () => {
  const x = setup({
    audit: async event => event.event === "ADMISSION_ATTEMPT",
  });
  const result = await x.gate.submit(job);
  assert.equal(result.decision, "EFFECT_UNKNOWN_RECONCILE");
  assert.equal(result.light, "RED");
  assert.equal(x.calls(), 1);
  assert.equal((await x.gate.submit(job)).light, "RED");
  assert.equal(x.calls(), 1);
});

test("runner uncertainty reports effect unknown without a retry", async () => {
  let attempts = 0;
  const x = setup({
    requestLaunch: async () => {
      attempts++;
      throw Error("runner disconnected after accepting job");
    },
  });
  assert.equal((await x.gate.submit(job)).decision, "EFFECT_UNKNOWN_RECONCILE");
  assert.equal(attempts, 1);
  await x.gate.submit(job);
  assert.equal(attempts, 1);
});

test("pre-dispatch audit failure never calls runner", async () => {
  const x = setup({ audit: async () => false });
  const result = await x.gate.submit(job);
  assert.equal(result.decision, "PREFLIGHT_BLOCKED");
  assert.equal(x.calls(), 0);
});

test("malformed runner receipt is execution-uncertain", async () => {
  const x = setup({
    requestLaunch: async () => ({ decision: "LAUNCHED", light: "GREEN" }),
  });
  const result = await x.gate.submit(job);
  assert.equal(result.decision, "EFFECT_UNKNOWN_RECONCILE");
});
