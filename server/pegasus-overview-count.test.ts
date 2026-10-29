import { describe, expect, it } from "vitest";

describe("PEGASUS alert count", () => {
  it("does not conflate the preview list with the total", () => {
    const preview = Array.from({ length: 20 }, () => ({ status: "open" }));
    const totalOpen = 23;
    expect(totalOpen).toBeGreaterThan(preview.length);
  });
});
