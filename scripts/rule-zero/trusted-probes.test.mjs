import test from "node:test";
import assert from "node:assert/strict";
import { collectProviderProbe } from "./trusted-probes.mjs";

const base = {
  provider: "github",
  credential: "test-only",
  expectedIdentity: "jade",
  jobId: "job_12345678",
  target: "osiris-web/staging",
};
function mock(status, login = "jade", remaining = "100") {
  return async (url, options) => {
    assert.equal(url, "https://api.github.com/user");
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    return {
      status,
      ok: status === 200,
      headers: { get: k => (k === "x-ratelimit-remaining" ? remaining : null) },
      json: async () => ({ login }),
    };
  };
}
test("healthy authenticated account is still RED without approval, expiry and baseline evidence", async () => {
  const result = await collectProviderProbe({ ...base, fetchImpl: mock(200) });
  assert.equal(result.classification, "API_HEALTHY");
  assert.equal(result.identityMatch, true);
  assert.equal(result.decision, "PREFLIGHT_BLOCKED");
});
test("expired auth is RED", async () => {
  assert.equal(
    (await collectProviderProbe({ ...base, fetchImpl: mock(401) }))
      .classification,
    "AUTH_EXPIRED"
  );
});
test("wrong identity is RED", async () => {
  assert.equal(
    (await collectProviderProbe({ ...base, fetchImpl: mock(200, "other") }))
      .identityMatch,
    false
  );
});
test("rate limit classified, never green", async () => {
  const result = await collectProviderProbe({
    ...base,
    fetchImpl: mock(403, "jade", "0"),
  });
  assert.equal(result.classification, "RATE_LIMITED");
  assert.equal(result.light, "RED");
});
test("network error fails closed", async () => {
  const result = await collectProviderProbe({
    ...base,
    fetchImpl: async () => {
      throw Error("network down");
    },
  });
  assert.equal(result.light, "RED");
});
test("arbitrary provider is rejected without network call", async () => {
  const result = await collectProviderProbe({
    ...base,
    provider: "https://evil.test",
    fetchImpl: () => {
      throw Error("must not call");
    },
  });
  assert.equal(result.light, "RED");
});
