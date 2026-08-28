// RAG retrieval over DocumentChunk, backed by Atlas Vector Search.

import type { PageSpan } from "@corner/shared";

export interface RetrievedChunk {
  chunkId: string;
  text: string;
  /**
   * Decomposed per page. A chunk routinely straddles a page break, so a
   * citation built from one carries more than one span; emitting a single
   * page + range would quietly drop the remainder.
   */
  spans: PageSpan[];
  headingPath: string[];
  score: number;
}

export interface RetrievalService {
  /**
   * Both filters are mandatory, not optional tuning.
   *
   * contentId scopes retrieval to the document being asked about — without it
   * a query searches every chunk in the cluster and can cite another user's
   * file, which for a corpus of contracts and medical records is a disclosure.
   * parseVersion keeps results inside one generation, so anchors from two
   * coordinate systems are never blended.
   */
  search(input: {
    contentId: string;
    parseVersion: number;
    query: string;
    limit?: number;
  }): Promise<RetrievedChunk[]>;

  /**
   * Probes the vector index. Used by the worker's startup check, which warns
   * loudly rather than crashing when the index is absent.
   */
  checkVectorIndex(): Promise<{ present: boolean; detail: string }>;
}

// TODO(phase-2-impl): implement with a $vectorSearch aggregation.
export function createRetrievalService(): RetrievalService {
  throw new Error("RetrievalService not implemented");
}
