import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
// Reproduce known failures from immutable baseline source in a temporary tree.
// No provider calls, credentials, infrastructure changes, or real runner.
const baseline = "743c9ce987facf2b7f41c07cadf6490c08fdf834";
const archive = await mkdtemp(join(tmpdir(), "rule-zero-original-"));
try {
  for (const file of [
    "launcher.mjs",
    "attestation.mjs",
    "preflight.mjs",
    "nonce-store.mjs",
  ]) {
    const { stdout } = await promisify(execFile)("git", [
      "show",
      `${baseline}:scripts/rule-zero/${file}`,
    ]);
    await writeFile(join(archive, file), stdout);
  }
  const { createRuleZeroLauncher } = await import(
    pathToFileURL(join(archive, "launcher.mjs")).href
  );
  const { createFileNonceStore } = await import(
    pathToFileURL(join(archive, "nonce-store.mjs")).href
  );
  const { evaluatePreflight } = await import(
    pathToFileURL(join(archive, "preflight.mjs")).href
  );
  const keys = generateKeyPairSync("ed25519");
  const now = Date.parse("2026-10-28T22:00:00Z");
  const base = {
    id: "job_12345678",
    target: "osiris-web/staging",
    commit: "a".repeat(40),
  };
  const checks = Object.fromEntries(
    [
      "connectivity",
      "authentication",
      "authorization",
      "providerStatus",
      "quota",
      "sourceBaseline",
    ].map(x => [x, "PASS"])
  );
  const evidence = j => ({
    jobId: j.id,
    target: j.target,
    commit: j.commit,
    checkedAt: new Date(now).toISOString(),
    credentialExpiry: new Date(now + 3600000).toISOString(),
    checks,
  });
  for (const attack of [
    "stale-probe",
    "wrong-probe-commit",
    "mutable-target",
    "concurrent-approval-reuse",
    "expiry-during-approval",
    "wrong-job-receipt",
  ]) {
    const directory = await mkdtemp(join(tmpdir(), "rule-zero-baseline-"));
    const j = { ...base };
    let t = now;
    let launched = [];
    const run = createRuleZeroLauncher({
      signingKey: keys.privateKey,
      pinnedPublicKey: keys.publicKey,
      clock: () => t,
      consumeNonce: createFileNonceStore(directory),
      probe: async x => ({
        ...evidence(x),
        ...(attack === "stale-probe"
          ? { checkedAt: new Date(now - 3600000).toISOString() }
          : {}),
        ...(attack === "wrong-probe-commit" ? { commit: "b".repeat(40) } : {}),
      }),
      verifyOwnerApproval: async () => {
        if (attack === "mutable-target") j.target = "other/target";
        if (attack === "expiry-during-approval") t += 7200000;
        return true;
      },
      launch: async x => {
        launched.push(x);
        return {
          runId: "synthetic-run",
          jobId: "wrong_job",
          target: "wrong/target",
          commit: "b".repeat(40),
        };
      },
    });
    const results =
      attack === "concurrent-approval-reuse"
        ? await Promise.all([run(j), run(j)])
        : [await run(j)];
    console.log(
      JSON.stringify({
        attack,
        decisions: results.map(x => x.decision),
        launches: launched.length,
        targets: launched.map(x => x.target),
      })
    );
    await rm(directory, { recursive: true, force: true });
  }

  const resetDirectory = await mkdtemp(
    join(tmpdir(), "rule-zero-original-store-")
  );
  try {
    const consume = createFileNonceStore(resetDirectory);
    const first = await consume("a".repeat(32), base.id);
    await rm(resetDirectory, { recursive: true });
    console.log(
      JSON.stringify({
        attack: "missing-store-resets-replay",
        first,
        replay: await consume("a".repeat(32), base.id),
      })
    );
  } finally {
    await rm(resetDirectory, { recursive: true, force: true });
  }
  const raw = {
    ...evidence(base),
    source: "trusted-runner",
    ownerApproval: true,
  };
  console.log(
    JSON.stringify({
      attack: "not-applicable-expiry",
      result: evaluatePreflight(
        { ...raw, credentialExpiry: "not-applicable" },
        now
      ),
    })
  );
  console.log(
    JSON.stringify({
      attack: "invalid-clock",
      result: evaluatePreflight(
        {
          ...raw,
          checkedAt: "2020-01-01T00:00:00Z",
          credentialExpiry: "2020-01-01T00:00:00Z",
        },
        NaN
      ),
    })
  );
} finally {
  await rm(archive, { recursive: true, force: true });
}
