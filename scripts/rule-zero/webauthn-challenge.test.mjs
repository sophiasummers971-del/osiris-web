import test from "node:test";
import assert from "node:assert/strict";
import { createChallengeService } from "./webauthn-challenge.mjs";

const now = 1770000000000;
const scope = {
  tenantId: "tenant_12345",
  ownerId: "owner_12345",
  jobId: "job_12345678",
  planHash: "a".repeat(64),
};
function setup() {
  const records = new Map();
  const store = {
    putIfAbsent: async (key, value) => {
      if (records.has(key)) return false;
      records.set(key, value);
      return true;
    },
    take: async key => {
      const item = records.get(key);
      if (!item) return null;
      records.delete(key);
      return item;
    },
  };
  return createChallengeService({
    store,
    clock: () => now,
    randomBytes: n => Buffer.alloc(n, 17),
  });
}
test("issued challenge is bound to a job and consumed once", async () => {
  const service = setup();
  const issued = await service.issue(scope);
  assert.equal(typeof issued.challenge, "string");
  assert.equal(issued.challenge.length >= 32, true);
  const verified = await service.consume({
    ...scope,
    challenge: issued.challenge,
  });
  assert.equal(verified.ok, true);
  assert.equal(
    (await service.consume({ ...scope, challenge: issued.challenge })).ok,
    false
  );
});
test("wrong scope burns challenge instead of allowing replay", async () => {
  const service = setup();
  const issued = await service.issue(scope);
  assert.equal(
    (await service.consume({ ...scope, ownerId: "owner_wrong", challenge: issued.challenge })).ok,
    false
  );
  assert.equal(
    (await service.consume({ ...scope, challenge: issued.challenge })).ok,
    false
  );
});
test("store unavailable fails closed", async () => {
  const service = createChallengeService({
    store: {
      putIfAbsent: async () => { throw Error("offline"); },
      take: async () => { throw Error("offline"); },
    },
    clock: () => now,
  });
  await assert.rejects(service.issue(scope));
  assert.equal((await service.consume({ ...scope, challenge: "x" })).ok, false);
});
