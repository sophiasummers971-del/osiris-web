import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context.js";
import { createIntelligenceRouter } from "./intelligence.js";

const authenticatedContext = {
  user: { id: 1, role: "admin" },
  req: {},
  res: {},
} as TrpcContext;

describe("intelligence.generate", () => {
  it("allows an authenticated operator to generate Gateway text", async () => {
    const generate = vi.fn(async ({ prompt }: { prompt: string }) => ({
      text: `Generated: ${prompt}`,
      usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    }));
    const caller = createIntelligenceRouter(generate).createCaller(
      authenticatedContext
    );

    const result = await caller.generate({ prompt: "Assess this case" });

    expect(generate).toHaveBeenCalledWith({ prompt: "Assess this case" });
    expect(result.text).toBe("Generated: Assess this case");
    expect(result.usage.totalTokens).toBe(7);
  });

  it("rejects unauthenticated generation", async () => {
    const generate = vi.fn();
    const caller = createIntelligenceRouter(generate).createCaller({
      ...authenticatedContext,
      user: null,
    });

    await expect(caller.generate({ prompt: "Assess this case" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
