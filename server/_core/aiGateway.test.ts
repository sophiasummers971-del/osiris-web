import { describe, expect, it, vi } from "vitest";
import {
  generateWorkersAiText,
  WORKERS_AI_MODEL,
} from "./aiGateway.js";

describe("generateWorkersAiText", () => {
  it("runs the bound Cloudflare model and reports token usage", async () => {
    const rawUsage = {
      prompt_tokens: 8,
      completion_tokens: 5,
      total_tokens: 13,
    };
    const ai = {
      run: vi.fn(async () => ({
        response: " OSIRIS online ",
        usage: rawUsage,
      })),
    };
    const logUsage = vi.fn();

    const result = await generateWorkersAiText({
      prompt: "Report system status",
      ai,
      logUsage,
    });

    expect(ai.run).toHaveBeenCalledWith(
      WORKERS_AI_MODEL,
      expect.objectContaining({
        messages: expect.arrayContaining([
          { role: "user", content: "Report system status" },
        ]),
      })
    );
    expect(result).toEqual({
      text: "OSIRIS online",
      usage: { inputTokens: 8, outputTokens: 5, totalTokens: 13 },
    });
    expect(logUsage).toHaveBeenCalledWith(rawUsage);
  });

  it("fails clearly when the Workers AI binding is absent", async () => {
    await expect(
      generateWorkersAiText({ prompt: "status", ai: null })
    ).rejects.toThrow("Cloudflare Workers AI is not configured");
  });
});
