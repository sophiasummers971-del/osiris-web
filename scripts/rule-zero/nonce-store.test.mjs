import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileNonceStore } from "./nonce-store.mjs";

test("nonce is consumed atomically only once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rule-zero-"));
  try {
    const consume = createFileNonceStore(directory);
    const results = await Promise.all([
      consume("a".repeat(32), "job_12345678"),
      consume("a".repeat(32), "job_12345678"),
    ]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(await consume("a".repeat(32), "job_12345678"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("invalid nonce never reaches filesystem", async () => {
  const consume = createFileNonceStore("/tmp/never-created-by-this-test");
  assert.equal(await consume("../../oops", "job_12345678"), false);
});
