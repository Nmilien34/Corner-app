import { describe, expect, it } from "vitest";

import { pageIndexForOffset, splitRangeByPage } from "./page-spans";

// Three pages of 100 chars each, joined by a 2-char separator:
//   page 1 text [0,100)    sep [100,102)
//   page 2 text [102,202)  sep [202,204)
//   page 3 text [204,304)
const OFFSETS = [0, 102, 204];
const TOTAL = 304;

describe("splitRangeByPage", () => {
  it("returns a single span for a range inside one page", () => {
    expect(splitRangeByPage(10, 40, OFFSETS, TOTAL)).toEqual([
      { page: 1, charStart: 10, charEnd: 40, pageCharStart: 10, pageCharEnd: 40 },
    ]);
  });

  it("splits a range that crosses one page boundary", () => {
    // This is the case that silently drew a partial highlight before the split
    // moved to the server: a sentence running off the end of page 1.
    expect(splitRangeByPage(90, 130, OFFSETS, TOTAL)).toEqual([
      { page: 1, charStart: 90, charEnd: 102, pageCharStart: 90, pageCharEnd: 102 },
      { page: 2, charStart: 102, charEnd: 130, pageCharStart: 0, pageCharEnd: 28 },
    ]);
  });

  it("splits a range spanning three pages", () => {
    expect(splitRangeByPage(50, 250, OFFSETS, TOTAL)).toEqual([
      { page: 1, charStart: 50, charEnd: 102, pageCharStart: 50, pageCharEnd: 102 },
      { page: 2, charStart: 102, charEnd: 204, pageCharStart: 0, pageCharEnd: 102 },
      { page: 3, charStart: 204, charEnd: 250, pageCharStart: 0, pageCharEnd: 46 },
    ]);
  });

  it("clamps the final page to the document length", () => {
    expect(splitRangeByPage(300, 999, OFFSETS, TOTAL)).toEqual([
      { page: 3, charStart: 300, charEnd: 304, pageCharStart: 96, pageCharEnd: 100 },
    ]);
  });

  it("handles a range starting exactly on a page boundary", () => {
    expect(splitRangeByPage(102, 150, OFFSETS, TOTAL)).toEqual([
      { page: 2, charStart: 102, charEnd: 150, pageCharStart: 0, pageCharEnd: 48 },
    ]);
  });

  it("handles a range ending exactly on a page boundary", () => {
    expect(splitRangeByPage(60, 102, OFFSETS, TOTAL)).toEqual([
      { page: 1, charStart: 60, charEnd: 102, pageCharStart: 60, pageCharEnd: 102 },
    ]);
  });

  it("returns nothing for empty, inverted or out-of-range inputs", () => {
    expect(splitRangeByPage(50, 50, OFFSETS, TOTAL)).toEqual([]);
    expect(splitRangeByPage(80, 20, OFFSETS, TOTAL)).toEqual([]);
    expect(splitRangeByPage(-5, 10, OFFSETS, TOTAL)).toEqual([]);
    expect(splitRangeByPage(400, 450, OFFSETS, TOTAL)).toEqual([]);
    expect(splitRangeByPage(10, 40, [], TOTAL)).toEqual([]);
  });

  it("never emits a span that crosses a boundary, over the whole document", () => {
    // The invariant the client depends on. If this ever fails, highlights start
    // resolving partially again.
    for (let start = 0; start < TOTAL; start += 7) {
      for (const len of [1, 13, 60, 111, 250]) {
        for (const span of splitRangeByPage(start, start + len, OFFSETS, TOTAL)) {
          const pageStart = OFFSETS[span.page - 1] as number;
          const pageEnd = OFFSETS[span.page] ?? TOTAL;
          expect(span.charStart).toBeGreaterThanOrEqual(pageStart);
          expect(span.charEnd).toBeLessThanOrEqual(pageEnd);
          expect(span.charEnd).toBeGreaterThan(span.charStart);
          // page-relative pair must describe the same range
          expect(span.pageCharStart).toBe(span.charStart - pageStart);
          expect(span.pageCharEnd).toBe(span.charEnd - pageStart);
          expect(span.pageCharStart).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("reassembles to the original range with no gaps or overlaps", () => {
    const spans = splitRangeByPage(50, 250, OFFSETS, TOTAL);
    expect(spans[0]?.charStart).toBe(50);
    expect(spans[spans.length - 1]?.charEnd).toBe(250);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i]?.charStart).toBe(spans[i - 1]?.charEnd);
    }
  });
});

describe("pageIndexForOffset", () => {
  it("finds the containing page", () => {
    expect(pageIndexForOffset(OFFSETS, 0)).toBe(0);
    expect(pageIndexForOffset(OFFSETS, 101)).toBe(0);
    expect(pageIndexForOffset(OFFSETS, 102)).toBe(1);
    expect(pageIndexForOffset(OFFSETS, 303)).toBe(2);
  });

  it("returns -1 before the first page", () => {
    expect(pageIndexForOffset(OFFSETS, -1)).toBe(-1);
  });
});
