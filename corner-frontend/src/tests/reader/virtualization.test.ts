import { describe, expect, it } from "vitest";

import {
  computeRenderWindow,
  diffRenderWindow,
  MAX_LIVE_PAGES,
  NARRATION_LOOKAHEAD,
} from "../../reader/virtualization";

describe("computeRenderWindow", () => {
  it("keeps visible pages plus a scroll buffer either side", () => {
    const w = computeRenderWindow({ totalPages: 350, visibleFirst: 94, visibleLast: 95 });
    expect(w.pages).toEqual([92, 93, 94, 95, 96, 97]);
    expect(w.reasons[94]).toBe("visible");
    expect(w.reasons[92]).toBe("scroll-buffer");
  });

  it("clamps at both ends of the document", () => {
    expect(computeRenderWindow({ totalPages: 350, visibleFirst: 1, visibleLast: 1 }).pages)
      .toEqual([1, 2, 3]);
    expect(computeRenderWindow({ totalPages: 350, visibleFirst: 350, visibleLast: 350 }).pages)
      .toEqual([348, 349, 350]);
  });

  it("renders AHEAD of the narration position (ADR 0001 R1)", () => {
    // The reader is on page 10 but audio is reading page 40. Without lookahead
    // the highlight vanishes at every page turn.
    const w = computeRenderWindow({
      totalPages: 350, visibleFirst: 10, visibleLast: 10, narrationPage: 40,
    });
    for (let i = 0; i <= NARRATION_LOOKAHEAD; i += 1) {
      expect(w.pages).toContain(40 + i);
      expect(w.reasons[40 + i]).toBe("narration");
    }
  });

  it("keeps the narration lead when the cap forces a choice", () => {
    // Wide viewport plus narration elsewhere: more candidates than the cap.
    const w = computeRenderWindow({
      totalPages: 350, visibleFirst: 100, visibleLast: 112, narrationPage: 200,
    });
    expect(w.pages.length).toBeLessThanOrEqual(MAX_LIVE_PAGES);
    // Buffer pages are sacrificed before the narration lead.
    expect(w.pages).toContain(200);
    expect(Object.values(w.reasons)).not.toContain("scroll-buffer");
  });

  it("never exceeds the live-page cap", () => {
    for (let span = 1; span < 40; span += 3) {
      const w = computeRenderWindow({
        totalPages: 350, visibleFirst: 50, visibleLast: 50 + span,
        narrationPage: 300, focusPage: 7,
      });
      expect(w.pages.length).toBeLessThanOrEqual(MAX_LIVE_PAGES);
    }
  });

  it("includes a focus page so a citation can be highlighted on arrival", () => {
    const w = computeRenderWindow({
      totalPages: 350, visibleFirst: 5, visibleLast: 6, focusPage: 300,
    });
    expect(w.pages).toContain(300);
    expect(w.reasons[300]).toBe("focus");
  });

  it("returns nothing for an empty document", () => {
    expect(computeRenderWindow({ totalPages: 0, visibleFirst: 1, visibleLast: 1 }).pages)
      .toEqual([]);
  });
});

describe("diffRenderWindow", () => {
  it("reports only the delta, so scrolling does not re-render the world", () => {
    const next = computeRenderWindow({ totalPages: 350, visibleFirst: 94, visibleLast: 95 });
    const { toRender, toEvict } = diffRenderWindow([92, 93, 94, 95, 96], next);
    expect(toRender).toEqual([97]);
    expect(toEvict).toEqual([]);
  });

  it("evicts pages that left the window", () => {
    const next = computeRenderWindow({ totalPages: 350, visibleFirst: 200, visibleLast: 200 });
    const { toEvict } = diffRenderWindow([92, 93, 94], next);
    expect(toEvict).toEqual([92, 93, 94]);
  });
});
