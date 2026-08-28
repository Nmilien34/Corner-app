import type { PageSpan } from "../types";

/**
 * Splits a document-wide character range at page boundaries.
 *
 * The server owns `DocumentContent.pageOffsets`, so the server owns this. Every
 * API response that carries a character range emits it **already decomposed**,
 * and the client never splits and never receives `pageOffsets` at all.
 *
 * This exists because spike target 3 established that a client can only resolve
 * a range against a single rendered page's text layer — a range crossing a page
 * boundary silently resolved on its first page only, drawing a highlight over
 * part of a sentence and reporting success. Sentences straddle page breaks
 * routinely, so leaving the split to the client meant every client had to know
 * about `pageOffsets` and get the same edge cases right.
 *
 * `pageOffsets[i]` is the offset at which page `i + 1` begins. Page `p`
 * therefore covers `[pageOffsets[p - 1], pageOffsets[p])`, and the last page
 * runs to `totalLength`.
 *
 * Any page-separator characters sit at the tail of a page's range. They are
 * inert: they carry no glyphs, so a span ending inside one produces no rect.
 */
export function splitRangeByPage(
  charStart: number,
  charEnd: number,
  pageOffsets: readonly number[],
  totalLength: number,
): PageSpan[] {
  if (charEnd <= charStart) return [];
  if (pageOffsets.length === 0) return [];
  if (charStart < 0 || charStart >= totalLength) return [];

  const end = Math.min(charEnd, totalLength);
  const spans: PageSpan[] = [];

  let index = pageIndexForOffset(pageOffsets, charStart);
  if (index < 0) return [];

  while (index < pageOffsets.length) {
    const pageStart = pageOffsets[index] as number;
    if (pageStart >= end) break;

    const nextStart = pageOffsets[index + 1];
    const pageEnd = nextStart === undefined ? totalLength : nextStart;

    const from = Math.max(charStart, pageStart);
    const to = Math.min(end, pageEnd);
    if (to > from) {
      spans.push({
        page: index + 1,
        charStart: from,
        charEnd: to,
        // Page-relative, so the client resolves without pageOffsets.
        pageCharStart: from - pageStart,
        pageCharEnd: to - pageStart,
      });
    }

    index += 1;
  }

  return spans;
}

/** 0-based index of the page containing `offset`, or -1. Binary search. */
export function pageIndexForOffset(
  pageOffsets: readonly number[],
  offset: number,
): number {
  let lo = 0;
  let hi = pageOffsets.length - 1;
  let found = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((pageOffsets[mid] as number) <= offset) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return found;
}
