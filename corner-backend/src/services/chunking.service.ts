// Splits a parsed document into embedding-sized chunks that preserve page
// anchors and heading paths.
//
// The anchor contract is the important part: charStart/charEnd index the
// NORMALIZED FULL TEXT, half-open, and pageStart/pageEnd are 1-based inclusive.
// A chunk may straddle a page break; that is why offsets are document-wide
// rather than page-local. See document-chunk.model.ts.

import type { ParsedDocument } from "./pdf.service";

export interface ChunkDraft {
  ordinal: number;
  text: string;
  anchor: {
    pageStart: number;
    pageEnd: number;
    charStart: number;
    charEnd: number;
  };
  headingPath: string[];
  outlineNodeId: string | null;
  tokenCount: number;
}

export interface ChunkingService {
  chunk(input: {
    parsed: ParsedDocument;
    targetTokens?: number;
    overlapTokens?: number;
  }): ChunkDraft[];
}

// TODO(phase-2-impl): implement. Target chunk size should follow from the
// embedding model chosen in docs/atlas-vector-index.md, not be picked
// independently.
export function createChunkingService(): ChunkingService {
  throw new Error("ChunkingService not implemented");
}
