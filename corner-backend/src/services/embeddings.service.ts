// Vectorizes chunks, batched.
//
// Provider and dimensions are RESOLVED — OpenAI text-embedding-3-small at 1536
// dimensions. See docs/atlas-vector-index.md for the decision and its
// consequences. The interface stays provider-agnostic so that a change is an
// adapter swap plus a re-embed, not a rewrite.

export interface EmbeddingResult {
  embedding: number[];
  tokensConsumed: number;
}

export interface EmbeddingsService {
  readonly model: string;
  readonly dimensions: number;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
  embedOne(text: string): Promise<EmbeddingResult>;
}

// TODO(phase-2-impl): implement against the OpenAI SDK using
// env.EMBEDDINGS_API_KEY. Must assert its own output width equals
// EMBEDDING_DIMENSIONS before writing — a silent width change corrupts the
// whole corpus and Atlas will not report it.
export function createEmbeddingsService(): EmbeddingsService {
  throw new Error("EmbeddingsService not implemented");
}
