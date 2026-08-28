// Cross-package domain types.
//
// The Zod request/response contracts land here in the phase that adds the
// routes. What is settled now is the envelope both sides already agree on
// (CONVENTIONS.md "Errors and response envelopes"), so it is declared once
// here rather than being restated by the client in Phase 3.

/** Success envelope: every 2xx body is `{ data: ... }`. */
export interface ApiSuccess<T> {
  data: T;
}

/** Failure envelope: every non-2xx body is `{ error: { ... } }`. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/**
 * A character range guaranteed NOT to cross a page boundary.
 *
 * Offsets remain document-wide (the same space as DocumentChunk.anchor), but
 * the range is bounded to one page, so a client can resolve it against that
 * page's rendered text layer without knowing anything about page geometry.
 */
export interface PageSpan {
  /** 1-based. */
  page: number;
  /**
   * Document-wide offsets, for provenance, dedupe and server-side reasoning.
   * Exclusive end.
   */
  charStart: number;
  charEnd: number;
  /**
   * The SAME range expressed relative to the start of this page's text.
   *
   * This pair is what the client actually resolves with, and it is why
   * pageOffsets never has to be sent over the wire: a client rendering page N
   * builds its text index from that page alone, starting at 0, and needs no
   * global knowledge to line up. Exclusive end.
   */
  pageCharStart: number;
  pageCharEnd: number;
}

/**
 * Anchor into a parsed document, in the shape the API returns it.
 *
 * The persisted form on DocumentChunk stores only charStart/charEnd — compact
 * and canonical. This read shape adds `spans`: the SAME range already split at
 * page boundaries by the server.
 *
 * The split is the server's job because the server owns
 * DocumentContent.pageOffsets. Spike target 3 established that a client can
 * only resolve a range against one rendered page at a time: a range crossing a
 * page boundary resolved on its first page only, drawing a partial highlight
 * and reporting success. Sentences straddle page breaks routinely, so leaving
 * the split to the client would mean shipping pageOffsets down and having every
 * client re-implement the same edge cases.
 *
 * Clients iterate `spans` and resolve each independently. They never split, and
 * pageOffsets is never sent over the wire.
 */
export interface DocumentAnchor {
  /** 1-based, inclusive — the overall extent, for jump-to-page. */
  pageStart: number;
  pageEnd: number;
  /** Document-wide offsets of the whole range, for provenance and dedupe. */
  charStart: number;
  charEnd: number;
  /** The same range, decomposed. Never empty for a non-empty range. */
  spans: PageSpan[];
}

/**
 * One text span aligned to an audio offset, as returned by the narration
 * manifest. Already decomposed per page for the same reason as DocumentAnchor.
 */
export interface TimingCue {
  /** Seconds from the start of this segment's audio file. */
  startSeconds: number;
  endSeconds: number;
  spans: PageSpan[];
}

/** A tappable chat citation. Single-page by construction. */
export interface ChatCitation {
  chunkId: string | null;
  span: PageSpan;
  snippet: string;
}
