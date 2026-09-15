import { z } from "zod";
import {
  generateWorkersAiText,
  type WorkersAiBinding,
} from "./_core/aiGateway.js";
import { protectedProcedure, router } from "./_core/trpc.js";

type GenerateText = (input: {
  prompt: string;
  ai: WorkersAiBinding | null | undefined;
}) => Promise<{
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
      .mutation(({ input, ctx }) =>
        generate({ prompt: input.prompt, ai: ctx.ai })
      ),
  });
}

export const intelligenceRouter = createIntelligenceRouter(
  generateWorkersAiText
);
