// jsdom implements the DOM but not layout, so Range.getClientRects is absent.
// Every real browser and WebView has it, so the production module correctly
// assumes it — the gap is the test environment's, and it is filled here rather
// than by weakening the code under test.
//
// It returns an empty list because there genuinely are no rectangles without
// layout. That is why the regression tests assert on the SELECTED TEXT rather
// than on pixels: text is what the span-alignment bug got wrong, and it is
// verifiable without layout. Real-pixel geometry is verified in the browser
// harness at spikes/pdf-renderer.

if (typeof Range !== "undefined" && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function getClientRects() {
    const list: DOMRect[] = [];
    return Object.assign(list, { item: (i: number) => list[i] ?? null }) as unknown as DOMRectList;
  };
}

if (typeof Range !== "undefined" && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0,
       toJSON: () => ({}) }) as DOMRect;
}
