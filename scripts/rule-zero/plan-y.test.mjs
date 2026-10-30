import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canonicalJSON,
  createPlanY,
  hashData,
  publicKeyFingerprint,
  verifyPlanApproval,
  verifyAgentContract,
} from "./plan-y.mjs";
import { createPlanYAdmission } from "./plan-y-admission.mjs";
import { createRuleZeroLauncher } from "./launcher.mjs";
import { createFileNonceStore } from "./nonce-store.mjs";

const authority = generateKeyPairSync("ed25519"),
  issuer = generateKeyPairSync("ed25519"),
  agent = generateKeyPairSync("ed25519"),
  otherAgent = generateKeyPairSync("ed25519"),
  runner = generateKeyPairSync("ed25519");
const now = Date.parse("2026-10-28T22:00:00Z");
const at = delta => new Date(now + delta).toISOString();
const context = Object.freeze({
  taskId: "task_x_123",
  ownerId: "synthetic_owner",
  tenantId: "synthetic_tenant",
});
const agents = new Map([
  ["NR-00001", agent.publicKey],
  ["NR-00002", otherAgent.publicKey],
]);
const signed = (body, key) => {
  const payload = canonicalJSON(body);
  return {
    payload,
    signature: sign(null, Buffer.from(payload), key).toString("base64"),
  };
};
const copy = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const step = {
    id: "step_1",
    description: "Inspect synthetic fixture",
    purpose: "Verify a bounded task",
    justification: "Produce reproducible evidence",
    dependencies: [],
    scope: {
      target: "osiris-web/staging",
      commit: "a".repeat(40),
      tools: ["inspect"],
      zones: ["staging/fixtures"],
      rulesetHash: "b".repeat(64),
      budgets: { maxCalls: 2, maxTokens: 10, maxCostMicros: 20 },
    },
    risks: ["Fixture may be invalid"],
    expectedEvidence: ["Synthetic signed receipt"],
  };
  const plan = {
    schema: "osiris.plan-y/v1",
    ...context,
    task: "Task X: inspect isolated fixtures",
    version: 1,
    steps: [step],
  };
  const planHash = createPlanY(JSON.stringify(plan)).hash;
  const approval = {
    schema: "osiris.plan-approval/v1",
    approvalId: "approval_plan_123",
    planHash,
    planVersion: 1,
    ...context,
    issuedAt: at(-1000),
    expiresAt: at(120000),
  };
  const contract = {
    schema: "osiris.agent-contract/v1",
    contractId: "contract_00001",
    approvalId: approval.approvalId,
    agentId: "NR-00001",
    agentKeyHash: publicKeyFingerprint(agent.publicKey),
    planHash,
    planVersion: 1,
    ...context,
    stepId: step.id,
    jobId: "plan_job_00001",
    target: step.scope.target,
    commit: step.scope.commit,
    tools: ["inspect"],
    zones: ["staging/fixtures"],
    rulesetHash: step.scope.rulesetHash,
    budgets: { ...step.scope.budgets },
    issuedAt: at(-1000),
    expiresAt: at(60000),
  };
  return { plan, approval, contract };
}
function request(f, schema = "osiris.agent-admission/v1", overrides = {}) {
  return {
    schema,
    agentId: f.contract.agentId,
    contractId: f.contract.contractId,
    contractHash: hashData(f.contract),
    planHash: f.approval.planHash,
    planVersion: f.plan.version,
    stepId: f.contract.stepId,
    ...context,
    nonce: randomBytes(16).toString("hex"),
    issuedAt: at(-100),
    expiresAt: at(30000),
    ...overrides,
  };
}
function bundle(f, overrides = {}) {
  return {
    planJson: JSON.stringify(f.plan),
    approvalEnvelope: signed(f.approval, authority.privateKey),
    contractEnvelope: signed(f.contract, issuer.privateKey),
    requestEnvelope: signed(request(f), agent.privateKey),
    ...overrides,
  };
}
function action(f, overrides = {}, signer = agent.privateKey) {
  return {
    contractId: f.contract.contractId,
    requestEnvelope: signed(
      request(f, "osiris.agent-action/v1", {
        tool: "inspect",
        zone: "staging/fixtures",
        rulesetHash: f.contract.rulesetHash,
        tokens: 2,
        costMicros: 3,
        ...overrides,
      }),
      signer
    ),
  };
}
async function harness(t, overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "plan-y-tests-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const consumeNonce = createFileNonceStore(directory);
  let launches = 0,
    actions = 0;
  const auditRecords = [];
  const core = createRuleZeroLauncher({
    signingKey: runner.privateKey,
    pinnedPublicKey: runner.publicKey,
    clock: () => now,
    consumeNonce,
    probe: async job => ({
      jobId: job.id,
      target: job.target,
      commit: job.commit,
      checkedAt: at(0),
      credentialExpiry: at(3600000),
      checks: Object.fromEntries(
        [
          "connectivity",
          "authentication",
          "authorization",
          "providerStatus",
          "quota",
          "sourceBaseline",
        ].map(k => [k, "PASS"])
      ),
    }),
    verifyOwnerApproval: async job => ({
      approved: true,
      approvalId: `core_${job.id}`,
      jobId: job.id,
      target: job.target,
      commit: job.commit,
      expiresAt: at(60000),
    }),
    launch: async job => {
      launches++;
      return {
        runId: "synthetic_run",
        jobId: job.id,
        target: job.target,
        commit: job.commit,
      };
    },
  });
  const options = {
    authorityKey: authority.publicKey,
    contractKey: issuer.publicKey,
    agentKeys: agents,
    context,
    allowedTargets: new Set(["osiris-web/staging"]),
    requestLaunch: core,
    consumeNonce,
    audit: async record => {
      auditRecords.push(record);
      return true;
    },
    executeSyntheticAction: async () => {
      actions++;
      return { receiptId: "synthetic_action" };
    },
    clock: () => now,
    ...overrides,
  };
  return {
    gate: createPlanYAdmission(options),
    options,
    launches: () => launches,
    actions: () => actions,
    auditRecords,
  };
}
const verification = f => ({
  ...bundle(f),
  authorityKey: authority.publicKey,
  contractKey: issuer.publicKey,
  agentKeys: agents,
  context,
  now,
});

test("Plan Y is recursively immutable and canonical hash covers every field", () => {
  const f = fixture(),
    p = createPlanY(JSON.stringify(f.plan));
  assert.ok(Object.isFrozen(p.plan.steps[0].scope.budgets));
  assert.throws(() => {
    p.plan.steps[0].purpose = "different";
  }, TypeError);
  const reversed = Object.fromEntries(Object.entries(f.plan).reverse());
  assert.equal(createPlanY(JSON.stringify(reversed)).hash, p.hash);
  for (const mutate of [
    p => p.version++,
    p => (p.task = "different"),
    p => (p.steps[0].purpose = "different"),
    p => (p.steps[0].justification = "different"),
    p => p.steps[0].risks.push("new risk"),
    p => p.steps[0].expectedEvidence.push("new evidence"),
  ]) {
    const changed = copy(f.plan);
    mutate(changed);
    assert.notEqual(createPlanY(JSON.stringify(changed)).hash, p.hash);
  }
});
for (const [name, modify] of [
  ["unknown dependency", p => p.steps[0].dependencies.push("unknown")],
  ["cyclic dependency", p => p.steps[0].dependencies.push("step_1")],
  ["duplicate step", p => p.steps.push(copy(p.steps[0]))],
  ["missing justification", p => delete p.steps[0].justification],
  ["missing risk evidence", p => (p.steps[0].expectedEvidence = [])],
  ["unknown schema property", p => (p.extraPermission = true)],
  ["fractional budget", p => (p.steps[0].scope.budgets.maxCalls = 1.5)],
])
  test(`plan rejects ${name}`, () => {
    const f = fixture();
    modify(f.plan);
    assert.throws(() => createPlanY(JSON.stringify(f.plan)));
  });

test("approval and contract independently verify with pinned public keys", () => {
  const f = fixture(),
    b = bundle(f);
  assert.ok(
    verify(
      null,
      Buffer.from(b.approvalEnvelope.payload),
      authority.publicKey,
      Buffer.from(b.approvalEnvelope.signature, "base64")
    )
  );
  assert.ok(
    verify(
      null,
      Buffer.from(b.contractEnvelope.payload),
      issuer.publicKey,
      Buffer.from(b.contractEnvelope.signature, "base64")
    )
  );
  assert.equal(verifyPlanApproval(verification(f)).hash, f.approval.planHash);
  assert.equal(
    verifyAgentContract(verification(f)).contract.agentId,
    "NR-00001"
  );
});
for (const [name, modify] of [
  ["wrong plan hash", a => (a.planHash = "c".repeat(64))],
  ["wrong version", a => a.planVersion++],
  ["wrong task", a => (a.taskId = "other_task")],
  ["wrong owner", a => (a.ownerId = "other_owner")],
  ["wrong tenant", a => (a.tenantId = "other_tenant")],
  ["expired approval", a => (a.expiresAt = at(-1))],
  ["future approval", a => (a.issuedAt = at(1))],
])
  test(`signed approval rejects ${name}`, async t => {
    const f = fixture();
    modify(f.approval);
    const h = await harness(t);
    assert.equal((await h.gate.submit(bundle(f))).light, "RED");
    assert.equal(h.launches(), 0);
  });
for (const [name, modify] of [
  ["expanded tools", c => c.tools.push("shell")],
  ["expanded zones", c => c.zones.push("production/secrets")],
  ["expanded budget", c => c.budgets.maxTokens++],
  ["wrong target", c => (c.target = "osiris-web/production")],
  ["wrong commit", c => (c.commit = "c".repeat(40))],
  ["wrong ruleset", c => (c.rulesetHash = "c".repeat(64))],
  ["wrong step", c => (c.stepId = "other_step")],
  ["wrong approval", c => (c.approvalId = "other_approval")],
  ["wrong owner", c => (c.ownerId = "other_owner")],
  ["wrong tenant", c => (c.tenantId = "other_tenant")],
  ["wrong task", c => (c.taskId = "other_task")],
  [
    "wrong agent key",
    c => (c.agentKeyHash = publicKeyFingerprint(otherAgent.publicKey)),
  ],
  ["invalid agent ID", c => (c.agentId = "agent_admin")],
  ["expired contract", c => (c.expiresAt = at(-1))],
  ["contract outlives approval", c => (c.expiresAt = at(180000))],
])
  test(`signed contract rejects ${name}`, async t => {
    const f = fixture();
    modify(f.contract);
    const h = await harness(t);
    assert.equal((await h.gate.submit(bundle(f))).light, "RED");
    assert.equal(h.launches(), 0);
  });
for (const kind of [
  "approvalEnvelope",
  "contractEnvelope",
  "requestEnvelope",
]) {
  test(`tampered ${kind} is blocked`, async t => {
    const f = fixture(),
      b = bundle(f);
    b[kind].payload = b[kind].payload.replace(
      "synthetic_tenant",
      "attacker_tenant"
    );
    const h = await harness(t);
    assert.equal((await h.gate.submit(b)).light, "RED");
    assert.equal(h.launches(), 0);
  });
  test(`wrong signer for ${kind} is blocked`, async t => {
    const f = fixture(),
      b = bundle(f);
    b[kind] = signed(JSON.parse(b[kind].payload), otherAgent.privateKey);
    const h = await harness(t);
    assert.equal((await h.gate.submit(b)).light, "RED");
    assert.equal(h.launches(), 0);
  });
}
test("changed plan invalidates original approval even with fresh contract signature", async t => {
  const f = fixture();
  f.plan.steps[0].purpose = "Changed purpose";
  const h = await harness(t);
  assert.equal((await h.gate.submit(bundle(f))).light, "RED");
  assert.equal(h.launches(), 0);
});
test("agent cannot expand request fields or replace trusted pins", async t => {
  const f = fixture(),
    b = bundle(f);
  b.requestEnvelope = signed(
    request(f, undefined, { tools: ["shell"] }),
    agent.privateKey
  );
  const h = await harness(t);
  assert.equal(
    (
      await h.gate.submit({
        ...b,
        authorityKey: otherAgent.publicKey,
        context: { tenantId: "attacker" },
      })
    ).light,
    "RED"
  );
  assert.equal(h.launches(), 0);
});
test("agent admission request must bind exact contract, step and version", async t => {
  const h = await harness(t);
  for (const change of [
    { contractHash: "c".repeat(64) },
    { stepId: "other_step" },
    { planVersion: 2 },
    { agentId: "NR-00002" },
    { nonce: "bad" },
  ]) {
    const f = fixture();
    assert.equal(
      (
        await h.gate.submit(
          bundle(f, {
            requestEnvelope: signed(
              request(f, undefined, change),
              agent.privateKey
            ),
          })
        )
      ).light,
      "RED"
    );
  }
  assert.equal(h.launches(), 0);
});
test("valid contract passes actual Rule Zero launcher and synthetic action gate", async t => {
  const f = fixture(),
    h = await harness(t);
  assert.equal((await h.gate.submit(bundle(f))).decision, "LAUNCHED");
  assert.equal(h.launches(), 1);
  assert.equal(
    (await h.gate.requestAction(action(f))).decision,
    "SYNTHETIC_ACTION_COMPLETED"
  );
  assert.equal(h.actions(), 1);
  assert.equal(h.gate.getContractState(f.contract.contractId), "ACTIVE");
});
test("concurrent duplicate contracts across gate instances launch exactly once", async t => {
  const f = fixture(),
    h = await harness(t),
    other = createPlanYAdmission(h.options);
  const results = await Promise.all([
    h.gate.submit(bundle(f)),
    other.submit(bundle(f)),
  ]);
  assert.equal(results.filter(r => r.light === "GREEN").length, 1);
  assert.equal(h.launches(), 1);
});
test("new contract ID cannot reuse an assigned agent or step", async t => {
  const f = fixture(),
    h = await harness(t);
  assert.equal((await h.gate.submit(bundle(f))).light, "GREEN");
  const another = fixture();
  another.contract.contractId = "contract_other";
  another.contract.jobId = "plan_job_other";
  assert.equal((await h.gate.submit(bundle(another))).light, "RED");
  assert.equal(h.launches(), 1);
});
test("distinct registered identities can execute distinct independent steps", async t => {
  const f = fixture();
  const second = copy(f.plan.steps[0]);
  second.id = "step_2";
  f.plan.steps.push(second);
  f.approval.planHash = createPlanY(JSON.stringify(f.plan)).hash;
  f.contract.planHash = f.approval.planHash;
  const h = await harness(t);
  assert.equal((await h.gate.submit(bundle(f))).light, "GREEN");
  const other = copy(f);
  Object.assign(other.contract, {
    contractId: "contract_00002",
    jobId: "plan_job_00002",
    agentId: "NR-00002",
    agentKeyHash: publicKeyFingerprint(otherAgent.publicKey),
    stepId: "step_2",
  });
  const b = bundle(other);
  b.requestEnvelope = signed(request(other), otherAgent.privateKey);
  assert.equal((await h.gate.submit(b)).light, "GREEN");
  assert.equal(h.launches(), 2);
});
test("dependency metadata is validated but unsupported completion evidence blocks admission", async t => {
  const f = fixture(),
    prerequisite = copy(f.plan.steps[0]);
  prerequisite.id = "prerequisite";
  f.plan.steps.push(prerequisite);
  f.plan.steps[0].dependencies = [prerequisite.id];
  f.approval.planHash = createPlanY(JSON.stringify(f.plan)).hash;
  f.contract.planHash = f.approval.planHash;
  const h = await harness(t);
  const result = await h.gate.submit(bundle(f));
  assert.deepEqual(result.reasons, ["DEPENDENCY_EVIDENCE_UNSUPPORTED"]);
  assert.equal(h.launches(), 0);
});
for (const consumeNonce of [
  async () => false,
  async () => {
    throw Error("store offline");
  },
])
  test("failed claim store blocks before admission", async t => {
    const h = await harness(t, { consumeNonce });
    assert.equal((await h.gate.submit(bundle(fixture()))).light, "RED");
    assert.equal(h.launches(), 0);
  });
test("audit failure blocks launch and contract is burned", async t => {
  const f = fixture(),
    h = await harness(t, { audit: async () => false });
  assert.equal((await h.gate.submit(bundle(f))).light, "RED");
  assert.equal(h.launches(), 0);
  assert.equal(h.gate.getContractState(f.contract.contractId), "REVOKED");
});
test("caller mutations during audit cannot replace signed inputs", async t => {
  const f = fixture(),
    b = bundle(f);
  const h = await harness(t, {
    audit: async () => {
      b.planJson = "{}";
      b.contractEnvelope.payload = "{}";
      return true;
    },
  });
  assert.equal((await h.gate.submit(b)).light, "GREEN");
  assert.equal(h.launches(), 1);
});
test("expiry during admission audit blocks before Rule Zero launch", async t => {
  let time = now;
  const h = await harness(t, {
    clock: () => time,
    audit: async () => {
      time += 180000;
      return true;
    },
  });
  assert.equal((await h.gate.submit(bundle(fixture()))).light, "RED");
  assert.equal(h.launches(), 0);
});
for (const [name, changes] of [
  ["zone", { zone: "production/secrets" }],
  ["tool", { tool: "shell" }],
  ["ruleset", { rulesetHash: "c".repeat(64) }],
])
  test(`authenticated ${name} violation revokes, denies and never executes`, async t => {
    const f = fixture(),
      h = await harness(t);
    await h.gate.submit(bundle(f));
    const result = await h.gate.requestAction(action(f, changes));
    assert.deepEqual(result.signals, ["DENY", "REVOKE"]);
    assert.equal(h.actions(), 0);
    assert.equal(h.gate.getContractState(f.contract.contractId), "REVOKED");
    assert.equal((await h.gate.requestAction(action(f))).light, "RED");
    assert.equal(h.actions(), 0);
  });
test("forged violation cannot revoke someone else's contract", async t => {
  const f = fixture(),
    h = await harness(t);
  await h.gate.submit(bundle(f));
  assert.equal(
    (
      await h.gate.requestAction(
        action(f, { zone: "production/secrets" }, otherAgent.privateKey)
      )
    ).light,
    "RED"
  );
  assert.equal(h.gate.getContractState(f.contract.contractId), "ACTIVE");
  assert.equal(h.actions(), 0);
});
test("signed action replay invokes synthetic callback only once", async t => {
  const f = fixture(),
    h = await harness(t);
  await h.gate.submit(bundle(f));
  const a = action(f);
  assert.equal((await h.gate.requestAction(a)).light, "GREEN");
  assert.equal((await h.gate.requestAction(a)).light, "RED");
  assert.equal(h.actions(), 1);
});
test("concurrent budget requests reserve before awaits and cannot overspend", async t => {
  const f = fixture();
  f.contract.budgets.maxCalls = 1;
  const h = await harness(t);
  await h.gate.submit(bundle(f));
  const results = await Promise.all([
    h.gate.requestAction(action(f)),
    h.gate.requestAction(action(f)),
  ]);
  assert.ok(results.some(r => r.signals?.includes("REVOKE")));
  assert.ok(h.actions() <= 1);
  assert.equal((await h.gate.requestAction(action(f))).light, "RED");
});
test("pending authorized action is cancelled by revocation before callback", async t => {
  let release, entered;
  const pending = new Promise(resolve => {
    release = resolve;
  });
  const observed = new Promise(resolve => {
    entered = resolve;
  });
  const f = fixture(),
    h = await harness(t, {
      audit: async record => {
        if (record.event === "SYNTHETIC_ACTION_ATTEMPT") {
          entered();
          await pending;
        }
        return true;
      },
    });
  await h.gate.submit(bundle(f));
  const actionPromise = h.gate.requestAction(action(f));
  await observed;
  assert.equal(
    (await h.gate.requestAction(action(f, { zone: "production/secrets" })))
      .light,
    "RED"
  );
  release();
  assert.equal((await actionPromise).light, "RED");
  assert.equal(h.actions(), 0);
});
test("expiry during action prevents callback", async t => {
  let time = now;
  const f = fixture(),
    h = await harness(t, {
      clock: () => time,
      audit: async record => {
        if (record.event === "SYNTHETIC_ACTION_ATTEMPT") time += 180000;
        return true;
      },
    });
  await h.gate.submit(bundle(f));
  assert.equal((await h.gate.requestAction(action(f))).light, "RED");
  assert.equal(h.actions(), 0);
});
test("unsafe host configuration and duplicate agent keys are rejected", async t => {
  const h = await harness(t);
  assert.throws(() =>
    createPlanYAdmission({ ...h.options, consumeNonce: undefined })
  );
  assert.throws(
    () =>
      createPlanYAdmission({
        ...h.options,
        agentKeys: new Map([
          ["NR-00001", agent.publicKey],
          ["NR-00002", agent.publicKey],
        ]),
      }),
    /AGENT_KEY_REUSED/
  );
});
test("malformed input and invalid clock fail closed", async t => {
  const h = await harness(t, { clock: () => NaN });
  assert.equal((await h.gate.submit(bundle(fixture()))).light, "RED");
  assert.equal(
    (
      await h.gate.submit({
        get planJson() {
          throw Error("getter");
        },
      })
    ).light,
    "RED"
  );
  assert.equal(h.launches(), 0);
});

test("agent admission request expiry during audit blocks launch", async t => {
  let time = now;
  const f = fixture(),
    h = await harness(t, {
      clock: () => time,
      audit: async () => {
        time = now + 40000;
        return true;
      },
    });
  assert.equal((await h.gate.submit(bundle(f))).light, "RED");
  assert.equal(h.launches(), 0);
});
test("uncertain synthetic execution failure revokes before any retry", async t => {
  let attempts = 0;
  const f = fixture(),
    h = await harness(t, {
      executeSyntheticAction: async () => {
        attempts++;
        throw Error("uncertain outcome");
      },
    });
  await h.gate.submit(bundle(f));
  assert.equal((await h.gate.requestAction(action(f))).light, "RED");
  assert.equal(h.gate.getContractState(f.contract.contractId), "REVOKED");
  assert.equal((await h.gate.requestAction(action(f))).light, "RED");
  assert.equal(attempts, 1);
});

for (const [name, charge] of [
  ["tokens", { tokens: 11 }],
  ["cost", { costMicros: 21 }],
  ["negative", { tokens: -1 }],
  ["unsafe integer", { costMicros: Number.MAX_SAFE_INTEGER }],
]) {
  test(`synthetic ${name} budget violation denies and revokes before callback`, async t => {
    const f = fixture(),
      h = await harness(t);
    await h.gate.submit(bundle(f));
    const result = await h.gate.requestAction(action(f, charge));
    assert.deepEqual(result.signals, ["DENY", "REVOKE"]);
    assert.equal(h.actions(), 0);
  });
}
test("action audit failure revokes without invoking callback", async t => {
  const f = fixture(),
    h = await harness(t, {
      audit: async r => r.event !== "SYNTHETIC_ACTION_ATTEMPT",
    });
  await h.gate.submit(bundle(f));
  const result = await h.gate.requestAction(action(f));
  assert.deepEqual(result.signals, ["DENY", "REVOKE"]);
  assert.equal(h.actions(), 0);
});
test("noncanonical and wrong-domain signed approval payloads are rejected", () => {
  const f = fixture(),
    v = verification(f);
  const payload = JSON.stringify(f.approval, null, 2);
  assert.throws(() =>
    verifyPlanApproval({
      ...v,
      approvalEnvelope: {
        payload,
        signature: sign(
          null,
          Buffer.from(payload),
          authority.privateKey
        ).toString("base64"),
      },
    })
  );
  assert.throws(() =>
    verifyPlanApproval({
      ...v,
      approvalEnvelope: signed(
        { ...f.approval, schema: "osiris.agent-contract/v1" },
        authority.privateKey
      ),
    })
  );
});
test("changing a plan version rejects an unchanged old approval", async t => {
  const f = fixture();
  f.plan.version++;
  const h = await harness(t);
  assert.equal((await h.gate.submit(bundle(f))).light, "RED");
  assert.equal(h.launches(), 0);
});

test("Plan Y preserves uncertain launch outcome and burns contract", async t => {
  const f = fixture();
  let calls = 0;
  const h = await harness(t, {
    requestLaunch: async () => {
      calls++;
      return {
        decision: "EFFECT_UNKNOWN_RECONCILE",
        light: "RED",
        reasons: ["POST_DISPATCH_AUDIT_UNAVAILABLE"],
      };
    },
  });
  const outcome = await h.gate.submit(bundle(f));
  assert.equal(outcome.decision, "EFFECT_UNKNOWN_RECONCILE");
  assert.deepEqual(outcome.signals, ["DENY", "REVOKE", "RECONCILE"]);
  assert.equal(h.gate.getContractState(f.contract.contractId), "REVOKED");
  assert.equal(calls, 1);
  await h.gate.submit(bundle(f));
  assert.equal(calls, 1);
});
