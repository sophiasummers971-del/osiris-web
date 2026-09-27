import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: mocks.from } }),
}));
import { evidenceStorage } from "./evidence-storage";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.from.mockReturnValue(mocks);
});
describe("private evidence storage adapter", () => {
  it("uses only the private evidence bucket and never overwrites an object", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    await evidenceStorage("https://example.supabase.co", "secret")!.upload(
      "1/2/file.txt",
      new Uint8Array([65]),
      "text/plain"
    );
    expect(mocks.from).toHaveBeenCalledWith("osiris-evidence");
    expect(mocks.upload).toHaveBeenCalledWith(
      "1/2/file.txt",
      expect.any(Uint8Array),
      { upsert: false, contentType: "text/plain" }
    );
  });
  it("signs an attachment for exactly 60 seconds", async () => {
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://signed.test/file" },
      error: null,
    });
    await expect(
      evidenceStorage("https://example.supabase.co", "secret")!.download(
        "1/2/file.txt",
        "file.txt"
      )
    ).resolves.toBe("https://signed.test/file");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("1/2/file.txt", 60, {
      download: "file.txt",
    });
  });
  it("sanitizes storage error payloads", async () => {
    mocks.upload.mockResolvedValue({
      error: { message: "private-secret-marker" },
    });
    await expect(
      evidenceStorage("https://example.supabase.co", "secret")!.upload(
        "1/2/file.txt",
        new Uint8Array(),
        "text/plain"
      )
    ).rejects.toThrow("Evidence storage operation failed");
  });
});
