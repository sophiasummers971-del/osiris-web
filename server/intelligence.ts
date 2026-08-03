import { z } from "zod";
import { generateGatewayText } from "./_core/aiGateway.js";
import { protectedProcedure, router } from "./_core/trpc.js";

type GenerateText = (input: { prompt: string }) => Promise<{
  text: string;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}>;

export function createIntelligenceRouter(generate: GenerateText) {
  return router({
    generate: protectedProcedure
      .input(z.object({ prompt: z.string().trim().min(1).max(4_000) }))
      .mutation(({ input }) => generate({ prompt: input.prompt })),
  });
}

export const intelligenceRouter = createIntelligenceRouter(generateGatewayText);
