// One call interface with model config, retries, timeouts and token accounting.
// Prompts live as versioned files in src/prompts/, never inline.

import OpenAI from "openai";

import { env } from "../config/env";
import { AppError, ReasoningBudgetExhaustedError } from "../lib/errors";

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
  readonly provider: string;
  readonly model: string;
  complete(input: {
    messages: LlmMessage[];
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  }): Promise<LlmCompletion>;
}

/**
 * Cheapest current model. Chat over a handful of retrieved passages is not a
 * reasoning-heavy task, and at $0.05/$0.40 per 1M it is noise next to TTS —
 * one verbatim book costs more than tens of thousands of chat turns.
 */
export const CHAT_MODEL = "gpt-5-nano";
export const LLM_PROVIDER = "openai";

export function createLlmService(): LlmService {
  if (!env.LLM_API_KEY) {
    throw new AppError("llm_not_configured", "LLM_API_KEY is not set", 500, undefined, false);
  }

  const client = new OpenAI({ apiKey: env.LLM_API_KEY });

  return {
    provider: LLM_PROVIDER,
    model: CHAT_MODEL,

    /**
     * @param maxTokens budget for BOTH reasoning and visible output.
     *
     * gpt-5-nano is a reasoning model: `max_completion_tokens` covers its
     * internal reasoning tokens as well as the answer. Measured, it spends ~128
     * reasoning tokens on a two-word reply, and far more on a RAG prompt
     * carrying six passages — so a budget sized for the answer alone is
     * consumed before a single visible token is produced, and the API returns
     * `finish_reason: "length"` with EMPTY content and no error.
     *
     * 3000 leaves room for reasoning plus a few paragraphs. Do not lower it to
     * "the length of the answer we want".
     */
    async complete({ messages, maxTokens = 3000, timeoutMs = 60_000 }) {
      const response = await client.chat.completions.create(
        {
          model: CHAT_MODEL,
          messages,
          max_completion_tokens: maxTokens,
        },
        { timeout: timeoutMs },
      );

      const choice = response.choices[0];

      // SHARED GUARD. Every structured-output call in Corner goes through
      // complete(), so this check lives here rather than at each call site —
      // narration scripts, action-item extraction and summaries will all meet
      // it, and the symptom (a 200 with empty content) gives no hint.
      if (!choice?.message?.content) {
        const reason = choice?.finish_reason ?? "unknown";
        const usage = response.usage as
          | { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } }
          | undefined;

        if (reason === "length") {
          throw new ReasoningBudgetExhaustedError({
            model: response.model,
            maxTokens,
            reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens,
            completionTokens: usage?.completion_tokens,
          });
        }

        throw new AppError(
          "llm_empty_response",
          `Model returned no content (finish_reason=${reason})`,
          502,
          { model: response.model, finishReason: reason },
          true,
        );
      }

      return {
        content: choice.message.content,
        tokensIn: response.usage?.prompt_tokens ?? 0,
        tokensOut: response.usage?.completion_tokens ?? 0,
        model: response.model,
      };
    },
  };
}
