import { randomBytes as secureRandomBytes, createHash } from "node:crypto";

// Isolated lifecycle: the supplied store MUST implement globally atomic
// putIfAbsent and destructive take across every worker and region.
// This does not verify any authenticator or issue owner approval.
export function createChallengeService({
  store,
  clock = Date.now,
  randomBytes = secureRandomBytes,
}) {
  if (
    typeof store?.putIfAbsent !== "function" ||
    typeof store?.take !== "function" ||
    typeof clock !== "function" ||
    typeof randomBytes !== "function"
  )
    throw new Error("CHALLENGE_STORE_NOT_CONFIGURED");

  function validScope(s) {
    return (
      s &&
      ["tenantId", "ownerId", "jobId"].every(
        key =>
          typeof s[key] === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(s[key])
      ) &&
      typeof s.planHash === "string" &&
      /^[a-f0-9]{64}$/.test(s.planHash)
    );
  }
  function keyFor(challenge) {
    return (
      "webauthn-challenge:" +
      createHash("sha256").update(challenge).digest("hex")
    );
  }

  return {
    async issue(scope) {
      if (!validScope(scope)) throw new Error("INVALID_CHALLENGE_SCOPE");
      const now = clock();
      if (!Number.isFinite(now)) throw new Error("INVALID_CLOCK");
      const nonce = randomBytes(32);
      if (!Buffer.isBuffer(nonce) || nonce.length !== 32)
        throw new Error("INVALID_RANDOM_SOURCE");
      const challenge = nonce.toString("base64url");
      const record = {
        tenantId: scope.tenantId,
        ownerId: scope.ownerId,
        jobId: scope.jobId,
        planHash: scope.planHash,
        expiresAt: now + 120000,
      };
      if ((await store.putIfAbsent(keyFor(challenge), record)) !== true)
        throw new Error("CHALLENGE_UNAVAILABLE_OR_COLLISION");
      return { challenge, expiresAt: record.expiresAt };
    },
    async consume(scope) {
      const deny = { ok: false };
      if (
        !validScope(scope) ||
        typeof scope.challenge !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(scope.challenge)
      )
        return deny;
      try {
        // An atomic destructive take burns a challenge even when scope fails.
        const record = await store.take(keyFor(scope.challenge));
        if (!record || !Number.isFinite(clock()) || clock() >= record.expiresAt)
          return deny;
        if (
          ["tenantId", "ownerId", "jobId", "planHash"].some(
            k => record[k] !== scope[k]
          )
        )
          return deny;
        return { ok: true };
      } catch {
        return deny;
      }
    },
  };
}
