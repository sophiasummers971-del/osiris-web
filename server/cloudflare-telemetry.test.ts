import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Cloudflare client entrypoint", () => {
  it("does not mount Vercel-only telemetry without its hosting endpoints", () => {
    const app = readFileSync(
      new URL("../client/src/App.tsx", import.meta.url),
      "utf8"
    );
    expect(app).not.toContain("@vercel/analytics");
    expect(app).not.toContain("@vercel/speed-insights");
  });
});
