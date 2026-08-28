// Which pages the reader keeps rendered.
//
// Carried across from the spike harness, which proved the approach holds: with
// a +/-2 page buffer, 7 of 350 pages were live and offset resolution stayed
// correct. What is added here is the narration requirement.
//
// Kept as a PURE function of observable state, deliberately. The window is the
// single lever behind memory (spike target 1) and scroll smoothness (target 2),
// and tuning it on a real device should mean changing constants and re-running
// tests — not reasoning about a component's render cycle.

export interface WindowInputs {
  totalPages: number;
  /** Inclusive 1-based range currently intersecting the viewport. */
  visibleFirst: number;
  visibleLast: number;
  /** Page the narration audio is currently reading, if playing. */
  narrationPage?: number | null;
  /** Page a pending highlight targets, if any. */
  focusPage?: number | null;
}

export interface RenderWindow {
  /** Pages to have rendered, ascending. */
  pages: number[];
  /** Why each non-visible page is retained — for debugging a memory spike. */
  reasons: Record<number, "visible" | "scroll-buffer" | "narration" | "focus">;
}

/** Pages either side of the viewport, so a flick does not reveal blanks. */
export const SCROLL_BUFFER = 2;

/**
 * Pages kept rendered AHEAD of the narration position.
 *
 * ADR 0001 R1: a page has no text layer until it is rendered, and rendering is
 * async, so a player that renders reactively drops the follow-along highlight
 * at every page turn — which for continuous narration is every few tens of
 * seconds, and is most visible exactly when the reader is following along.
 *
 * One page of lead is the minimum that covers a turn. Two costs little and
 * absorbs a slow render on a low-end device.
 */
export const NARRATION_LOOKAHEAD = 2;

/**
 * Hard ceiling on simultaneously rendered pages.
 *
 * Each rendered page holds a canvas bitmap plus a text layer, and the canvas
 * dominates: at 2x zoom a Letter page is roughly 1224x1584 px, about 7.8 MB as
 * RGBA. Ten such pages is ~78 MB of bitmap alone, before pdf.js's own
 * structures — which is the whole memory risk this cap exists to bound.
 *
 * 10 is a starting value, not a measured one. Spike target 1 sets it properly
 * against peak RSS on a low-end Android handset. It is a constant precisely so
 * that tuning is a one-line change with tests around it.
 */
export const MAX_LIVE_PAGES = 10;

export function computeRenderWindow(input: WindowInputs): RenderWindow {
  const { totalPages } = input;
  if (totalPages <= 0) return { pages: [], reasons: {} };

  const clamp = (n: number) => Math.min(Math.max(n, 1), totalPages);
  const reasons: RenderWindow["reasons"] = {};
  const kept = new Set<number>();

  const take = (page: number, why: RenderWindow["reasons"][number]): boolean => {
    const p = clamp(page);
    if (kept.has(p)) return true;
    if (kept.size >= MAX_LIVE_PAGES) return false;
    kept.add(p);
    reasons[p] = why;
    return true;
  };

  const visFirst = clamp(input.visibleFirst);
  const visLast = clamp(Math.max(input.visibleLast, input.visibleFirst));
  const narrationPage = input.narrationPage ?? null;
  const focusPage = input.focusPage ?? null;

  // RESERVED FIRST, not merely prioritised.
  //
  // A wide viewport can nominate more pages than the cap allows — 13 visible
  // pages against a cap of 10 leaves nothing. Ranking by tier is not enough in
  // that case: the visible tier fills the budget and the narration lead is
  // starved, which is precisely the R1 failure (highlight drops at every page
  // turn) reintroduced by a different route.
  //
  // So the narration lead and the focus page are claimed BEFORE visible pages.
  // Their combined worst case is small — NARRATION_LOOKAHEAD + 2 — so the
  // degradation lands on visible pages at extreme zoom-out, where a page
  // resolving a moment late is a far cheaper failure than a missing highlight
  // during playback.
  if (narrationPage !== null) {
    for (let i = 0; i <= NARRATION_LOOKAHEAD; i += 1) take(narrationPage + i, "narration");
  }
  if (focusPage !== null) take(focusPage, "focus");

  // Then visible pages, working outward from the centre of the viewport so the
  // pages the reader is actually looking at survive a squeeze.
  const centre = Math.round((visFirst + visLast) / 2);
  const visible: number[] = [];
  for (let p = visFirst; p <= visLast; p += 1) visible.push(p);
  visible.sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
  for (const p of visible) take(p, "visible");

  // Buffer last: it only exists so a flick does not reveal blanks, which is
  // the cheapest thing here to lose.
  for (let i = 1; i <= SCROLL_BUFFER; i += 1) {
    take(visFirst - i, "scroll-buffer");
    take(visLast + i, "scroll-buffer");
  }

  const pages = [...kept].sort((a, b) => a - b);
  const keptReasons: RenderWindow["reasons"] = {};
  for (const p of pages) keptReasons[p] = reasons[p] as RenderWindow["reasons"][number];

  return { pages, reasons: keptReasons };
}

/** Pages to render and to evict, given what is currently live. */
export function diffRenderWindow(
  live: readonly number[],
  next: RenderWindow,
): { toRender: number[]; toEvict: number[] } {
  const wanted = new Set(next.pages);
  const current = new Set(live);
  return {
    toRender: next.pages.filter((p) => !current.has(p)),
    toEvict: live.filter((p) => !wanted.has(p)).sort((a, b) => a - b),
  };
}
