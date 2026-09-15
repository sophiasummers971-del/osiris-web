import { describe, expect, it } from "vitest";
import {
  decryptMonitoringToken,
  encryptMonitoringToken,
} from "./token-crypto.js";

const key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8";
const otherKey = "Hh0cGxoZGBcWFRQTEhEQDw4NDAsKCQgHBgUEAwIBAAA";

describe("monitoring token encryption", () => {
  it("round-trips a token without retaining plaintext", async () => {
    const encrypted = await encryptMonitoringToken("github-secret", key);
    expect(encrypted).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encrypted).not.toContain("github-secret");
    await expect(decryptMonitoringToken(encrypted, key)).resolves.toBe(
      "github-secret"
    );
  });

  it("uses a fresh nonce for every encryption", async () => {
    const first = await encryptMonitoringToken("same-token", key);
    const second = await encryptMonitoringToken("same-token", key);
    expect(first).not.toBe(second);
  });

  it("rejects decryption with another key", async () => {
    const encrypted = await encryptMonitoringToken("github-secret", key);
    await expect(decryptMonitoringToken(encrypted, otherKey)).rejects.toThrow();
  });

  it("rejects malformed envelopes and invalid keys", async () => {
    await expect(decryptMonitoringToken("not-an-envelope", key)).rejects.toThrow(
      "Unsupported monitoring token envelope"
    );
    await expect(encryptMonitoringToken("token", "dG9vLXNob3J0")).rejects.toThrow(
      "exactly 32 bytes"
    );
  });
});
