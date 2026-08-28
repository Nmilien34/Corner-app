// Builds the document-wide character index that mirrors what the SERVER would
// produce, then maps an offset range back to on-screen rectangles.
//
// This file is the whole point of spike target 3. Corner's schema stores
// DocumentChunk.anchor.charStart/charEnd as offsets into the normalized full
// text of a parse generation, and AudioSegment.timingMap resolves through the
// same space. So the client must be able to answer:
//
//     given characters N..M of the document, where are they on screen?
//
// The risk is not "can a rect be drawn". It is whether the client's notion of
// character N is the SAME as the server's. Any divergence in normalization —
// how items are joined, where newlines land, how pages are separated — puts
// the highlight on the wrong words while every individual piece looks correct.
//
// NORMALIZATION CONTRACT (server and client must agree exactly):
//   - a page's text is its pdf.js text items concatenated in order
//   - an item contributes item.str, plus "\n" when item.hasEOL
//   - pages are joined with PAGE_SEPARATOR
//   - pageOffsets[p] is the offset at which page p+1 begins
//
// Anything the server does differently must be mirrored here, and vice versa.

export const PAGE_SEPARATOR = "\n\n";

export function buildPageIndex(pageNumber, textContent, startOffset) {
  const items = [];
  let local = 0;
  let text = "";
  let spanIndex = 0;

  for (let i = 0; i < textContent.items.length; i += 1) {
    const item = textContent.items[i];
    if (typeof item.str !== "string") continue;

    const piece = item.str + (item.hasEOL ? "\n" : "");

    // THE ALIGNMENT RULE, and the bug this spike caught.
    //
    // pdf.js's TextLayer does NOT render a span for a zero-length item. Such
    // items are real — they are hasEOL markers that contribute a newline to
    // the page's text — so they must count for character offsets, but they
    // produce no DOM node to measure.
    //
    // Indexing spans positionally by item index is therefore wrong, and wrong
    // in the worst way: it agrees with reality on most pages and silently
    // shifts on the ones containing empty items. Page 94 of the test corpus
    // has 38 items and 36 spans; before this fix every span lookup past item 1
    // on that page was off by one, then two.
    //
    // A shift large enough to run off the end produced "no rects", which is at
    // least visible. A smaller shift would have drawn a rect over the WRONG
    // WORDS and reported success.
    const hasSpan = item.str.length > 0;

    items.push({
      itemIndex: i,
      spanIndex: hasSpan ? spanIndex : null,
      localStart: local,
      localEnd: local + item.str.length, // the \n is not selectable DOM text
      pieceEnd: local + piece.length,
      length: item.str.length,
    });

    if (hasSpan) spanIndex += 1;
    local += piece.length;
    text += piece;
  }

  return {
    pageNumber,
    startOffset,
    endOffset: startOffset + text.length,
    length: text.length,
    text,
    items,
  };
}

/** Which page contains a document-wide offset. Binary search over pageOffsets. */
export function pageForOffset(pages, offset) {
  let lo = 0;
  let hi = pages.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = pages[mid];
    if (offset < p.startOffset) hi = mid - 1;
    else if (offset >= p.endOffset) lo = mid + 1;
    else return p;
  }
  return null;
}

/**
 * Maps a document-wide [charStart, charEnd) range to client rects.
 *
 * Requires the page's text layer to be in the DOM — under virtualization an
 * off-screen page has no spans to measure. That is a real constraint on the
 * design, not a harness shortcut: highlights can only be resolved for pages
 * that are rendered, so the player must scroll a target into view before it
 * can draw on it.
 */
export function rectsForRange(page, textLayerEl, charStart, charEnd) {
  if (!textLayerEl) return { rects: [], reason: "page not rendered" };

  const spans = textLayerEl.querySelectorAll("span");
  if (spans.length === 0) return { rects: [], reason: "text layer empty" };

  // Guard the alignment assumption rather than trusting it. If pdf.js ever
  // changes which items it renders, this fails loudly here instead of drawing
  // highlights over the wrong words somewhere downstream.
  const expectedSpans = page.items.filter((e) => e.spanIndex !== null).length;
  if (spans.length !== expectedSpans) {
    return {
      rects: [],
      reason: `span/item misalignment: ${spans.length} spans vs ${expectedSpans} expected`,
    };
  }

  const localStart = charStart - page.startOffset;
  const localEnd = charEnd - page.startOffset;

  const rects = [];
  const matched = [];

  for (const entry of page.items) {
    if (entry.localEnd <= localStart) continue;
    if (entry.localStart >= localEnd) break;

    if (entry.spanIndex === null) continue; // empty item: real text, no DOM node
    const span = spans[entry.spanIndex];
    if (!span || !span.firstChild) continue;

    const from = Math.max(0, localStart - entry.localStart);
    const to = Math.min(entry.length, localEnd - entry.localStart);
    if (to <= from) continue;

    const node = span.firstChild;
    const available = node.textContent.length;
    const range = document.createRange();
    try {
      range.setStart(node, Math.min(from, available));
      range.setEnd(node, Math.min(to, available));
    } catch {
      continue;
    }

    for (const r of range.getClientRects()) {
      if (r.width > 0 && r.height > 0) rects.push(r);
    }
    matched.push({
      itemIndex: entry.itemIndex,
      spanIndex: entry.spanIndex,
      text: node.textContent.slice(from, to),
    });
    range.detach?.();
  }

  return { rects, matched, reason: rects.length ? null : "no rects produced" };
}
