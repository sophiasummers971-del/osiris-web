import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";

/**
 * Single-host staging replay store. Atomic create prevents reuse across
 * processes sharing one filesystem. NOT a distributed production nonce store.
 * The host must own a private directory and arrange bounded retention.
 */
export function createFileNonceStore(directory) {
  if (typeof directory !== "string" || !directory.startsWith("/")) {
    throw new Error("NONCE_DIRECTORY_REQUIRED");
  }
  return async function consumeNonce(nonce, jobId) {
    if (
      !/^[a-f0-9]{32,64}$/.test(nonce ?? "") ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(jobId ?? "")
    ) {
      return false;
    }
    const digest = createHash("sha256")
      .update(jobId + ":" + nonce)
      .digest("hex");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let handle;
    try {
      handle = await open(join(directory, digest), "wx", 0o600);
      await handle.writeFile("consumed\n");
      await handle.sync();
      return true;
    } catch (error) {
      if (error?.code === "EEXIST") return false;
      throw error;
    } finally {
      await handle?.close();
    }
  };
}
