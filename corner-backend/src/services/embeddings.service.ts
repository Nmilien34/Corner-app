// Vectorizes chunks, batched.
//
// Provider and width are RESOLVED (OQ-005): OpenAI text-embedding-3-small at
// 1536 dimensions. Pinned in @corner/shared so the service, the Atlas index
// definition and docs/atlas-vector-index.md cannot drift apart.

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL, EMBEDDING_PROVIDER } from "@corner/shared";
import { Binary } from "bson";
import OpenAI from "openai";

import { env } from "../config/env";
import { AppError } from "../lib/errors";

export interface EmbeddingResult {
  /**
   * BSON binData vector (subtype 9, float32) ready to store.
   *
   * Encoded here rather than at the call site so there is exactly one place
   * that decides the wire format. A plain Buffer with the default subtype is
   * not a vector to Atlas and would be silently unindexed — the query would
   * return nothing and nothing would error.
   */
  embedding: Binary;
  /** Float32Array view, for assertions and tests. Not stored. */
  vector: Float32Array;
  tokensConsumed: number;
}

export interface EmbeddingsService {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embedBatch(texts: string[]): Promise<{ results: EmbeddingResult[]; totalTokens: number }>;
  embedOne(text: string): Promise<EmbeddingResult>;
}

/**
 * Inputs per request.
 *
 * OpenAI accepts far more, but a failed batch is retried whole, so a large
 * batch turns one transient error into a large re-spend. 96 keeps a retry
 * cheap while still amortizing the round trip.
 */
export const EMBEDDING_BATCH_SIZE = 96;

export function createEmbeddingsService(): EmbeddingsService {
  if (!env.EMBEDDINGS_API_KEY) {
    throw new AppError(
      "embeddings_not_configured",
      "EMBEDDINGS_API_KEY is not set",
      500,
      undefined,
      false,
    );
  }

  const client = new OpenAI({ apiKey: env.EMBEDDINGS_API_KEY });

  return {
    provider: EMBEDDING_PROVIDER,
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,

    async embedBatch(texts) {
      if (texts.length === 0) return { results: [], totalTokens: 0 };

      const response = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      // The API returns results with an index; do not assume input order.
      const ordered = [...response.data].sort((a, b) => a.index - b.index);

      if (ordered.length !== texts.length) {
        throw new AppError(
          "embeddings_count_mismatch",
          `Requested ${texts.length} embeddings, received ${ordered.length}`,
          502,
          undefined,
          false,
        );
      }

      for (const item of ordered) {
        // Atlas does NOT validate vector width against the index — a mismatch
        // is accepted silently and returns bad results forever. Asserting here
        // is the only place it can be caught before the corpus is poisoned.
        // Checked on the raw array BEFORE encoding: once packed into binData
        // a wrong width is just a differently-sized buffer, and the mistake
        // becomes invisible.
        if (item.embedding.length !== EMBEDDING_DIMENSIONS) {
          throw new AppError(
            "embeddings_wrong_dimensions",
            `Expected ${EMBEDDING_DIMENSIONS}-dimension vectors from ${EMBEDDING_MODEL}, got ${item.embedding.length}. ` +
              "Writing these would silently corrupt the vector index.",
            502,
            undefined,
            false,
          );
        }
      }

      const totalTokens = response.usage?.prompt_tokens ?? 0;

      return {
        results: ordered.map((item) => {
          const vector = Float32Array.from(item.embedding);
          return {
            embedding: Binary.fromFloat32Array(vector),
            vector,
            // The API bills per request, not per input. Apportioning evenly
            // keeps per-chunk attribution honest about being an estimate
            // rather than inventing precision the provider never gave us.
            tokensConsumed: Math.round(totalTokens / ordered.length),
          };
        }),
        totalTokens,
      };
    },

    async embedOne(text) {
      const { results } = await this.embedBatch([text]);
      const first = results[0];
      if (!first) {
        throw new AppError("embeddings_empty", "No embedding returned", 502, undefined, false);
      }
      return first;
    },
  };
}
