// One call interface with model config, retries, timeouts and token
// accounting. Prompts live as versioned files in src/prompts/, never inline.

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletion {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface LlmService {
  complete(input: {
    messages: LlmMessage[];
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }): Promise<LlmCompletion>;

  completeJson<T>(input: {
    messages: LlmMessage[];
    schemaName: string;
    maxTokens?: number;
  }): Promise<{ value: T; tokensIn: number; tokensOut: number; model: string }>;
}

// TODO(phase-2-impl): implement with retries and a timeout. Every call must
// emit a UsageEvent through usage.service — an untracked LLM call is an
// invisible cost, which is the thing BRIEF's economics section exists to stop.
export function createLlmService(): LlmService {
  throw new Error("LlmService not implemented");
}
