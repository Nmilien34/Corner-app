// Splits a parsed document into embedding-sized chunks that preserve page
// anchors and heading paths.
//
// THE ANCHOR CONTRACT
//
//   charStart/charEnd index the NORMALIZED FULL TEXT, half-open, document-wide.
//   pageStart/pageEnd are 1-based and inclusive.
//
// Document-wide rather than page-local because a chunk routinely straddles a
// page break; page-local offsets would force every chunk to carry a list of
// per-page spans and every consumer to reassemble them.
//
// A chunk's text MUST equal normalizedText.slice(charStart, charEnd) exactly.
// That identity is what makes the offsets meaningful, and it is asserted in
// tests rather than assumed — a chunker that trims or joins its output breaks
// every downstream highlight while looking perfectly reasonable.

import type { ParsedDocument, ParsedOutlineNode } from "./pdf.service";

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

export interface ChunkingOptions {
  /** Chunk size follows the embedding model's window, not the other way round. */
  targetTokens?: number;
  overlapTokens?: number;
  minTokens?: number;
}

export interface ChunkingService {
  chunk(input: { parsed: ParsedDocument } & ChunkingOptions): ChunkDraft[];
}

/** ~4 characters per token for English prose. Cheap, and only used for sizing. */
const CHARS_PER_TOKEN = 4;
const DEFAULT_TARGET_TOKENS = 450;
const DEFAULT_OVERLAP_TOKENS = 60;
const DEFAULT_MIN_TOKENS = 24;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** 1-based page containing a document-wide offset. */
export function pageForOffset(pageOffsets: readonly number[], offset: number): number {
  let lo = 0;
  let hi = pageOffsets.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((pageOffsets[mid] as number) <= offset) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found + 1;
}

/**
 * Deepest outline node at or before `offset`, plus the path to it.
 *
 * Outline nodes are emitted in document order by pdf.service, so a linear scan
 * with a running stack is enough; there is no need to re-sort or to walk the
 * tree per chunk.
 */
export function headingPathForOffset(
  outline: readonly ParsedOutlineNode[],
  offset: number,
): { path: string[]; nodeId: string | null } {
  let current: ParsedOutlineNode | null = null;
  for (const node of outline) {
    if (node.charStart === null) continue;
    if (node.charStart > offset) break;
    current = node;
  }
  if (!current) return { path: [], nodeId: null };

  const byId = new Map(outline.map((n) => [n.id, n]));
  const path: string[] = [];
  let cursor: ParsedOutlineNode | undefined = current;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    path.unshift(cursor.title);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return { path, nodeId: current.id };
}

/**
 * Finds a break near `preferred` that does not cut mid-sentence or mid-word.
 *
 * Chunk boundaries land inside retrieved context and inside anything a user is
 * shown, so a chunk ending "the agreement shall termin" is a visible defect.
 * Never moves past `hardLimit`.
 */
function findBreak(text: string, from: number, preferred: number, hardLimit: number): number {
  const window = Math.min(200, Math.floor((preferred - from) / 4));
  if (window <= 0) return Math.min(preferred, hardLimit);

  for (let i = preferred; i > preferred - window && i > from + 1; i -= 1) {
    const ch = text[i - 1];
    const next = text[i];
    if ((ch === "." || ch === "!" || ch === "?" || ch === "\n") && (next === undefined || /\s/.test(next))) {
      return i;
    }
  }
  for (let i = preferred; i > preferred - window && i > from + 1; i -= 1) {
    if (/\s/.test(text[i - 1] as string)) return i;
  }
  return Math.min(preferred, hardLimit);
}

export function createChunkingService(): ChunkingService {
  return {
    chunk({ parsed, targetTokens, overlapTokens, minTokens }) {
      const target = (targetTokens ?? DEFAULT_TARGET_TOKENS) * CHARS_PER_TOKEN;
      const overlap = (overlapTokens ?? DEFAULT_OVERLAP_TOKENS) * CHARS_PER_TOKEN;
      const minimum = (minTokens ?? DEFAULT_MIN_TOKENS) * CHARS_PER_TOKEN;

      const { normalizedText: text, pageOffsets, outline } = parsed;
      const chunks: ChunkDraft[] = [];

      let cursor = 0;
      let ordinal = 0;

      while (cursor < text.length) {
        const remaining = text.length - cursor;
        const end =
          remaining <= target + minimum
            ? text.length
            : findBreak(text, cursor, cursor + target, text.length);

        const slice = text.slice(cursor, end);

        // Whitespace-only regions (page separators, blank pages) carry no
        // meaning and would pollute retrieval, but they still occupy offsets —
        // so they are skipped, not collapsed. Offsets stay exact.
        if (slice.trim().length > 0) {
          const { path, nodeId } = headingPathForOffset(outline, cursor);
          chunks.push({
            ordinal,
            text: slice,
            anchor: {
              pageStart: pageForOffset(pageOffsets, cursor),
              pageEnd: pageForOffset(pageOffsets, Math.max(cursor, end - 1)),
              charStart: cursor,
              charEnd: end,
            },
            headingPath: path,
            outlineNodeId: nodeId,
            tokenCount: estimateTokens(slice),
          });
          ordinal += 1;
        }

        if (end >= text.length) break;
        const next = Math.max(cursor + 1, end - overlap);
        cursor = next <= cursor ? end : next;
      }

      return chunks;
    },
  };
}
