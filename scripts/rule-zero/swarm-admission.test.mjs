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
    audit: async () => {},
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
  const x = setup({ audit: async () => { throw Error("offline"); } });
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
  const pending = new Promise(resolve => { release = resolve; });
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
