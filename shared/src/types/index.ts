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
 * Anchor into a parsed document, in the shape the API returns it.
 *
 * The persisted form lives on DocumentChunk; this is the read shape shared by
 * narration highlighting, action-item provenance, and chat citations. Page
 * numbers are 1-based and inclusive on both ends. Character offsets index the
 * normalized full text of the parse generation, NOT the page — resolve them to
 * a page with DocumentContent.pageOffsets.
 */
export interface DocumentAnchor {
  pageStart: number;
  pageEnd: number;
  charStart: number;
  charEnd: number;
}
