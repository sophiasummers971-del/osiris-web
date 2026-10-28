import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";

/**
 * Single-host staging replay store, NOT distributed production persistence.
 * The host must provision a private directory in a trusted parent in advance.
 * Never silently recreate a missing store: that would erase replay history.
 * Retain job/approval claims for the full lifetime of their identifiers.
 */
export function createFileNonceStore(directory) {
  if (typeof directory !== "string" || !directory.startsWith("/"))
    throw new Error("NONCE_DIRECTORY_REQUIRED");
  let identity;
  return async function consumeNonce(nonce, jobId) {
    if (
      !/^[a-f0-9]{32,64}$/.test(nonce ?? "") ||
      !/^[a-zA-Z0-9_-]{8,128}$/.test(jobId ?? "")
    )
      return false;
    const digest = createHash("sha256")
      .update(jobId + ":" + nonce)
      .digest("hex");
    let parent;
    let handle;
    try {
      parent = await open(
        directory,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
      );
      const stat = await parent.stat();
      if (
        !stat.isDirectory() ||
        (stat.mode & 0o077) !== 0 ||
        (typeof process.getuid === "function" && stat.uid !== process.getuid())
      )
        throw new Error("NONCE_DIRECTORY_NOT_PRIVATE");
      const currentIdentity = `${stat.dev}:${stat.ino}`;
      if (identity && identity !== currentIdentity)
        throw new Error("NONCE_DIRECTORY_REPLACED");
      identity = currentIdentity;
      handle = await open(join(directory, digest), "wx", 0o600);
      await handle.writeFile("consumed\n");
      await handle.sync();
      // Persist the directory entry as well as the claim contents.
      await parent.sync();
      return true;
    } catch (error) {
      if (error?.code === "EEXIST") return false;
      throw error;
    } finally {
      await handle?.close();
      await parent?.close();
    }
  };
}
