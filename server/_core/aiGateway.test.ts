import { describe, expect, it, vi } from "vitest";
import { generateGatewayText } from "./aiGateway.js";

describe("generateGatewayText", () => {
  it("streams GPT-5.4 text and reports token usage", async () => {
    const usage = {
      inputTokens: 8,
      outputTokens: 5,
      totalTokens: 13,
    };
    const streamText = vi.fn(() => ({
      textStream: (async function* () {
        yield "OSIRIS ";
        yield "online";
      })(),
      usage: Promise.resolve(usage),
    }));
    const logUsage = vi.fn();

    const result = await generateGatewayText({
      prompt: "Report system status",
      streamText,
      logUsage,
    });

    expect(streamText).toHaveBeenCalledWith({
      model: "openai/gpt-5.4",
      prompt: "Report system status",
    });
    expect(result).toEqual({ text: "OSIRIS online", usage });
    expect(logUsage).toHaveBeenCalledWith(usage);
  });
});
