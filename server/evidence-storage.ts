import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";

export const MAX_EVIDENCE_BYTES = 1024 * 1024;
export const EVIDENCE_BUCKET = "osiris-evidence";
export function validateEvidence(
  filename: string,
  mime: string,
  base64: string
) {
  const invalid = () => {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Use a valid PDF, PNG, JPEG or UTF-8 text file, at most 1 MiB",
    });
  };
  if (
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
    base64.length % 4 !== 0 ||
    base64.length > 1398104
  )
    invalid();
  const bytes = Buffer.from(base64, "base64");
  if (
    !bytes.length ||
    bytes.length > MAX_EVIDENCE_BYTES ||
    bytes.toString("base64") !== base64
  )
    invalid();
  const name = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const extension = name.split(".").pop()?.toLowerCase();
  const allowed = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    txt: "text/plain",
  };
  if (!extension || allowed[extension as keyof typeof allowed] !== mime)
    invalid();
  if (mime === "application/pdf" && bytes.subarray(0, 5).toString() !== "%PDF-")
    invalid();
  if (
    mime === "image/png" &&
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    invalid();
  if (
    mime === "image/jpeg" &&
    bytes.subarray(0, 3).toString("hex") !== "ffd8ff"
  )
    invalid();
  if (mime === "text/plain") {
    try {
      if (
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes)
        )
      )
        invalid();
    } catch {
      invalid();
    }
  }
  return { bytes, name, extension: extension! };
}
export type EvidenceStorage = {
  upload(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  download(path: string, filename: string): Promise<string>;
};
export function evidenceStorage(
  url?: string,
  secret?: string
): EvidenceStorage | undefined {
  if (!url || !secret) return;
  const bucket = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(EVIDENCE_BUCKET);
  const fail = () => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Evidence storage operation failed",
    });
  };
  return {
    async upload(path, bytes, mime) {
      const { error } = await bucket.upload(path, bytes, {
        upsert: false,
        contentType: mime,
      });
      if (error) fail();
    },
    async download(path, filename) {
      const { data, error } = await bucket.createSignedUrl(path, 60, {
        download: filename,
      });
      if (error || !data) return fail();
      return data.signedUrl;
    },
  };
}
