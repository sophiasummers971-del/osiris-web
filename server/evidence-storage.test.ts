import { describe, expect, it } from "vitest";
import { validateEvidence, MAX_EVIDENCE_BYTES } from "./evidence-storage";
import { Buffer } from "node:buffer";

describe("private evidence validation", () => {
  it("accepts UTF-8 text and sanitizes names", () => {
    const file = validateEvidence(
      "../my note.txt",
      "text/plain",
      Buffer.from("hello").toString("base64")
    );
    expect(file.bytes.toString()).toBe("hello");
    expect(file.name).not.toContain("/");
  });
  it.each([
    ["x.svg", "image/svg+xml", "<svg/>"],
    ["x.pdf", "application/pdf", "not PDF"],
    ["x.png", "image/png", "not PNG"],
    ["x.jpg", "image/jpeg", "not JPEG"],
    ["x.txt", "text/plain", "hello\0"],
    ["x.txt", "application/pdf", "%PDF-"],
  ])("rejects invalid content or MIME: %s", (name, mime, content) => {
    expect(() =>
      validateEvidence(name, mime, Buffer.from(content).toString("base64"))
    ).toThrow();
  });
  it("rejects empty, malformed, oversized and invalid UTF-8 files", () => {
    for (const data of [
      "",
      "!!!!",
      "aGVsbG8",
      Buffer.alloc(MAX_EVIDENCE_BYTES + 1).toString("base64"),
      Buffer.from([255]).toString("base64"),
    ])
      expect(() => validateEvidence("x.txt", "text/plain", data)).toThrow();
  });
  it.each([
    ["x.pdf", "application/pdf", Buffer.from("%PDF-1.7")],
    ["x.png", "image/png", Buffer.from("89504e470d0a1a0a", "hex")],
    ["x.jpeg", "image/jpeg", Buffer.from("ffd8ff", "hex")],
  ])("accepts allowed signatures: %s", (name, mime, bytes) => {
    expect(
      validateEvidence(name, mime, bytes.toString("base64")).bytes
    ).toEqual(bytes);
  });
});
