// Reader text index. Runs INSIDE the WebView that hosts pdf.js.
//
// Carried across from spikes/pdf-renderer, where target 3 established that a
// server-issued character offset resolves to the right words on screen. Both
// bugs that spike found were silent-wrong-answer bugs — they drew highlights
// over the wrong text while reporting success — so both are guarded here and
// covered by regression tests in src/tests/reader/.
//
// The server sends PageSpan[] already split at page boundaries, each carrying
// page-relative offsets. This module never splits and never sees pageOffsets.

/** The subset of pdf.js's TextItem this module depends on. */
export interface TextItemLike {
  str: string;
  hasEOL?: boolean;
}

export interface IndexedItem {
  itemIndex: number;
  /**
   * Index into the rendered spans, or null when the item produces no span.
   *
   * pdf.js's TextLayer renders NO span for a zero-length item. Such items are
   * real — they are `hasEOL` markers contributing a newline, so they count for
   * character offsets — but they have no DOM node to measure. Indexing spans
   * positionally by item index is therefore wrong, and wrong in the worst way:
   * it agrees with reality on most pages and shifts on the ones containing
   * empty items.
   *
   * Page 94 of the 350-page test corpus has 38 items and 36 spans. Before this
   * distinction existed, every span lookup past the first empty item on that
   * page was off by one, then two. It surfaced as "no rects" only because the
   * shift ran off the end of the list; a smaller shift highlights the wrong
   * sentence and reports success.
   */
  spanIndex: number | null;
  /** Page-relative, matching PageSpan.pageCharStart/pageCharEnd. */
  localStart: number;
  /** End of the item's own text. The trailing newline is not selectable. */
  localEnd: number;
  length: number;
}

export interface PageTextIndex {
  pageNumber: number;
  text: string;
  items: IndexedItem[];
  /** How many spans the text layer should contain, for the alignment guard. */
  expectedSpanCount: number;
}

/**
 * Builds a page's character index from pdf.js text items.
 *
 * NORMALIZATION CONTRACT — the server produces the same text, the same way:
 *   - items concatenated in order
 *   - each contributes `str`, plus "\n" when `hasEOL`
 * Any divergence puts highlights on the wrong words while every individual
 * piece still looks correct.
 */
export function buildPageIndex(
  pageNumber: number,
  items: readonly TextItemLike[],
): PageTextIndex {
  const indexed: IndexedItem[] = [];
  let local = 0;
  let spanIndex = 0;
  let text = "";

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item.str !== "string") continue;

    const hasSpan = item.str.length > 0;
    const piece = item.str + (item.hasEOL ? "\n" : "");

    indexed.push({
      itemIndex: i,
      spanIndex: hasSpan ? spanIndex : null,
      localStart: local,
      localEnd: local + item.str.length,
      length: item.str.length,
    });

    if (hasSpan) spanIndex += 1;
    local += piece.length;
    text += piece;
  }

  return { pageNumber, text, items: indexed, expectedSpanCount: spanIndex };
}

export interface ResolvedSpan {
  rects: DOMRect[];
  matchedText: string;
  reason: string | null;
}

/**
 * Maps a page-relative character range to rectangles on the rendered page.
 *
 * Requires the page's text layer to be in the DOM. Under virtualization an
 * un-rendered page has nothing to measure — see ADR 0001 R1: the player
 * pre-renders the page ahead of the audio position for exactly this reason.
 */
export function rectsForPageRange(
  index: PageTextIndex,
  spans: ArrayLike<Element>,
  pageCharStart: number,
  pageCharEnd: number,
): ResolvedSpan {
  if (spans.length === 0) {
    return { rects: [], matchedText: "", reason: "text layer empty" };
  }

  // Guard the alignment assumption instead of trusting it. If pdf.js ever
  // changes which items it renders, this fails loudly here rather than drawing
  // highlights over the wrong words somewhere downstream.
  if (spans.length !== index.expectedSpanCount) {
    return {
      rects: [],
      matchedText: "",
      reason: `span/item misalignment: ${spans.length} spans vs ${index.expectedSpanCount} expected`,
    };
  }

  const rects: DOMRect[] = [];
  let matchedText = "";

  for (const entry of index.items) {
    if (entry.localEnd <= pageCharStart) continue;
    if (entry.localStart >= pageCharEnd) break;
    if (entry.spanIndex === null) continue; // real text, no DOM node

    const span = spans[entry.spanIndex];
    const node = span?.firstChild;
    if (!node || node.nodeType !== 3) continue;

    const from = Math.max(0, pageCharStart - entry.localStart);
    const to = Math.min(entry.length, pageCharEnd - entry.localStart);
    if (to <= from) continue;

    const available = node.textContent?.length ?? 0;
    const range = document.createRange();
    try {
      range.setStart(node, Math.min(from, available));
      range.setEnd(node, Math.min(to, available));
    } catch {
      continue;
    }

    for (const rect of Array.from(range.getClientRects())) {
      if (rect.width > 0 && rect.height > 0) rects.push(rect);
    }
    matchedText += (node.textContent ?? "").slice(from, to);
  }

  return {
    rects,
    matchedText,
    reason: rects.length > 0 ? null : "no rects produced",
  };
}

/**
 * The CSS custom property pdf.js v4's TextLayer requires on its container.
 *
 * Without it the layer sizes itself against an implicit scale of 1. Glyph
 * positions still look plausible, so nothing appears broken on screen — the
 * failure only surfaces when a rect is measured. In the spike, highlight width
 * ran 0.92 -> 0.58 -> 1.35 of page width across three zoom levels, at one point
 * drawing a highlight wider than the page, while x/y anchored perfectly and the
 * text was correct throughout.
 *
 * Every text layer goes through this function. Setting the property inline at a
 * call site is how it gets forgotten on the second one.
 */
export function prepareTextLayer(container: HTMLElement, scale: number): void {
  container.style.setProperty("--scale-factor", String(scale));
}
