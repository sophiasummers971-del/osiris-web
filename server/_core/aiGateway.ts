type GatewayUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type StreamTextResult = {
  textStream: AsyncIterable<string>;
  usage: PromiseLike<GatewayUsage>;
};

type StreamText = (options: {
  model: string;
  prompt: string;
}) => StreamTextResult;

const streamFromGateway: StreamText = options => vercelStreamText(options);

export async function generateGatewayText(options: {
  prompt: string;
  streamText?: StreamText;
  logUsage?: (usage: GatewayUsage) => void;
}) {
  const result = (options.streamText ?? streamFromGateway)({
    model: "openai/gpt-5.4",
    prompt: options.prompt,
  });
  let text = "";

  for await (const chunk of result.textStream) {
    text += chunk;
  }

  const usage = await result.usage;
  (options.logUsage ?? (value => console.info("[AI Gateway] Token usage", value)))(
    usage
  );

  return { text, usage };
}
import { streamText as vercelStreamText } from "ai";
