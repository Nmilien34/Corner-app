// Regression tests for the two bugs spike target 3 found.
//
// Both were SILENT-WRONG-ANSWER bugs: they drew a highlight over the wrong text
// and reported success. Neither threw. Both will recur — one on any PDF whose
// pages contain empty text items, the other the moment someone creates a text
// layer without going through prepareTextLayer.

import { describe, expect, it } from "vitest";

import {
  buildPageIndex,
  prepareTextLayer,
  rectsForPageRange,
  type TextItemLike,
} from "../../reader/text-index";

/**
 * Page 94 of the 350-page spike corpus, reduced to its shape.
 *
 * The detail that matters: items 1 and 3 are zero-length `hasEOL` markers.
 * They contribute newlines to the page text — so they occupy character
 * offsets — but pdf.js renders NO span for them. The real page had 38 items
 * and 36 spans.
 */
const PAGE_94_ITEMS: TextItemLike[] = [
  { str: "Chapter 10", hasEOL: false },
  { str: "", hasEOL: true },
  { str: "Page 94 of 350", hasEOL: false },
  { str: "", hasEOL: true },
  { str: "Section 10.4 paragraph 1 - alpha", hasEOL: true },
  { str: "Section 10.4 paragraph 2 - bravo", hasEOL: true },
  { str: "Section 10.4 paragraph 3 - charlie", hasEOL: false },
];

/** Only the non-empty items get a span — mirroring pdf.js's TextLayer. */
function renderSpans(items: TextItemLike[]): HTMLElement[] {
  return items
    .filter((i) => i.str.length > 0)
    .map((i) => {
      const el = document.createElement("span");
      el.textContent = i.str;
      return el;
    });
}

describe("zero-length items do not consume a span index", () => {
  it("assigns spanIndex only to items that render", () => {
    const index = buildPageIndex(94, PAGE_94_ITEMS);

    expect(index.items).toHaveLength(7);
    expect(index.expectedSpanCount).toBe(5); // 7 items, 2 of them empty

    // The empty items are indexed for offsets but carry no span.
    expect(index.items[1]?.spanIndex).toBeNull();
    expect(index.items[3]?.spanIndex).toBeNull();

    // Everything after them is shifted DOWN relative to its item index —
    // this is the whole bug. Item 4 is span 2, not span 4.
    expect(index.items[0]?.spanIndex).toBe(0);
    expect(index.items[2]?.spanIndex).toBe(1);
    expect(index.items[4]?.spanIndex).toBe(2);
    expect(index.items[6]?.spanIndex).toBe(4);
  });

  it("still counts the empty items' newlines in character offsets", () => {
    const index = buildPageIndex(94, PAGE_94_ITEMS);
    // "Chapter 10"(10) + "\n"(1) => "Page 94 of 350" starts at 11
    expect(index.items[2]?.localStart).toBe(11);
    expect(index.text.slice(0, 12)).toBe("Chapter 10\nP");
  });

  it("resolves a known offset to the RIGHT text on a page with empty items", () => {
    const index = buildPageIndex(94, PAGE_94_ITEMS);
    const spans = renderSpans(PAGE_94_ITEMS);

    // Target "Section 10.4 paragraph 2 - bravo" by its page-relative offsets.
    const target = "Section 10.4 paragraph 2 - bravo";
    const start = index.text.indexOf(target);
    expect(start).toBeGreaterThan(0);

    const resolved = rectsForPageRange(index, spans, start, start + target.length);

    // jsdom reports zero-size rects, so assert on the text that was selected —
    // which is the thing that was wrong. A shifted index returns a different
    // paragraph here while looking perfectly healthy.
    expect(resolved.matchedText).toBe(target);
    expect(resolved.reason).not.toBe("span/item misalignment");
  });

  it("refuses to measure when the span count disagrees with the index", () => {
    const index = buildPageIndex(94, PAGE_94_ITEMS);
    const tooFew = renderSpans(PAGE_94_ITEMS).slice(0, 4);

    const resolved = rectsForPageRange(index, tooFew, 0, 10);

    expect(resolved.rects).toHaveLength(0);
    expect(resolved.reason).toContain("misalignment");
  });
});

describe("text layer scale factor", () => {
  it("sets --scale-factor, which pdf.js v4 requires to size the layer", () => {
    // Without this the layer sizes against an implicit scale of 1: glyphs look
    // right, measured widths do not. Highlight width ran 0.92 -> 0.58 -> 1.35
    // of page width across three zoom levels before this was set.
    const container = document.createElement("div");
    prepareTextLayer(container, 1.75);
    expect(container.style.getPropertyValue("--scale-factor")).toBe("1.75");
  });

  it("keeps normalized highlight width stable across a zoom range", () => {
    // The property must track the scale exactly. If it is ever set to a
    // constant, or skipped, measured geometry stops scaling with the page and
    // this catches it.
    const widths = [0.75, 1.1, 1.75, 2.5].map((scale) => {
      const container = document.createElement("div");
      prepareTextLayer(container, scale);
      const factor = Number(container.style.getPropertyValue("--scale-factor"));

      // A span 400 CSS-units wide at scale 1 occupies 400*scale on a page that
      // is also scale-proportional, so the normalized width must be invariant.
      const pageWidth = 612 * scale;
      const spanWidth = 400 * factor;
      return Number((spanWidth / pageWidth).toFixed(4));
    });

    expect(new Set(widths).size).toBe(1);
    expect(widths[0]).toBeCloseTo(400 / 612, 4);
  });
});
