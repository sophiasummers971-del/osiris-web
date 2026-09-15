export const WORKERS_AI_MODEL =
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

type WorkersAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type WorkersAiResult = {
  response?: string;
  usage?: WorkersAiUsage;
};

export type WorkersAiBinding = {
  run(
    model: string,
    input: {
      messages: Array<{ role: "system" | "user"; content: string }>;
    }
  ): Promise<WorkersAiResult>;
};

export async function generateWorkersAiText(options: {
  prompt: string;
  ai: WorkersAiBinding | null | undefined;
  logUsage?: (usage: WorkersAiUsage) => void;
}) {
  if (!options.ai) throw new Error("Cloudflare Workers AI is not configured");

  const result = await options.ai.run(WORKERS_AI_MODEL, {
    messages: [
      {
        role: "system",
        content:
          "You are OSIRIS Intelligence. Provide concise, evidence-aware analysis. Clearly separate facts, inferences, and unknowns.",
      },
      { role: "user", content: options.prompt },
    ],
  });

  const text = result.response?.trim();
  if (!text) throw new Error("Cloudflare Workers AI returned no text");

  const rawUsage = result.usage ?? {};
  (options.logUsage ??
    (value => console.info("[Workers AI] Token usage", value)))(rawUsage);

  return {
    text,
    usage: {
      inputTokens: rawUsage.prompt_tokens,
      outputTokens: rawUsage.completion_tokens,
      totalTokens: rawUsage.total_tokens,
    },
  };
}
