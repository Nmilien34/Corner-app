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

import { Types } from "mongoose";

import { splitRangeByPage } from "@corner/shared";

import { DocumentChunkModel, DocumentContentModel } from "../models";
import { VECTOR_INDEX_NAME } from "../jobs/vector-index-check";
import { createEmbeddingsService } from "./embeddings.service";

/**
 * Candidates the ANN search considers before returning `limit`.
 *
 * Atlas recommends roughly 10-20x the requested limit. Corner's retrieval is
 * scoped to ONE document by the contentId filter, so the candidate pool is
 * hundreds of chunks, not millions — this can be generous without costing
 * anything meaningful, and generosity is what buys recall back if quantization
 * is ever enabled (see docs/adr/0002-vector-store.md).
 */
const CANDIDATE_MULTIPLIER = 20;

export function createRetrievalService(): RetrievalService {
  const embeddings = createEmbeddingsService();

  return {
    async search({ contentId, parseVersion, query, limit = 8 }) {
      const { vector } = await embeddings.embedOne(query);

      const content = await DocumentContentModel.findById(contentId)
        .select({ pageOffsets: 1, normalizedTextLength: 1 })
        .lean();

      const results = await DocumentChunkModel.aggregate<{
        _id: Types.ObjectId;
        text: string;
        anchor: { pageStart: number; pageEnd: number; charStart: number; charEnd: number };
        headingPath: string[];
        score: number;
      }>([
        {
          $vectorSearch: {
            index: VECTOR_INDEX_NAME,
            path: "embedding",
            // A plain array, deliberately. STORED vectors are binData because
            // there are millions of them and disk is the constraint; the query
            // vector is one ephemeral value, so the representation buys nothing
            // and the driver's types only declare number[] here anyway.
            queryVector: Array.from(vector),
            numCandidates: limit * CANDIDATE_MULTIPLIER,
            limit,
            // BOTH filters are mandatory. contentId keeps a query inside the
            // document being asked about — without it an answer can cite
            // another user's file, which for contracts and medical records is
            // a disclosure. parseVersion keeps results inside one parse
            // generation so anchors from two coordinate systems never blend.
            filter: {
              contentId: new Types.ObjectId(contentId),
              parseVersion,
            },
          },
        },
        {
          $project: {
            text: 1,
            anchor: 1,
            headingPath: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ]);

      // Spans are decomposed per page here rather than by the client, so a
      // citation crossing a page break arrives as two resolvable spans. The
      // client never splits and never receives pageOffsets.
      const pageOffsets = content?.pageOffsets ?? [];
      const totalLength = content?.normalizedTextLength ?? 0;

      return results.map((r) => ({
        chunkId: String(r._id),
        text: r.text,
        spans: splitRangeByPage(r.anchor.charStart, r.anchor.charEnd, pageOffsets, totalLength),
        headingPath: r.headingPath,
        score: r.score,
      }));
    },

    async checkVectorIndex() {
      try {
        const list = await DocumentChunkModel.collection.listSearchIndexes().toArray();
        const idx = list.find((i) => (i as { name?: string }).name === VECTOR_INDEX_NAME);
        if (!idx) {
          return { present: false, detail: `No search index named "${VECTOR_INDEX_NAME}".` };
        }
        const queryable = Boolean((idx as { queryable?: boolean }).queryable);
        return {
          present: true,
          detail: queryable
            ? `"${VECTOR_INDEX_NAME}" is queryable.`
            : `"${VECTOR_INDEX_NAME}" exists but is still building.`,
        };
      } catch (error) {
        return {
          present: false,
          detail: `Could not list search indexes (not Atlas?): ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    },
  };
}
