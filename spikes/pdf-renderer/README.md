# Spike: PDF renderer selection

Evidence for `docs/adr/0001-pdf-renderer.md`. Deliberately outside
`corner-frontend/` so it cannot contaminate the scaffold, and outside the npm
workspace list so `npm install` at the root never pulls it in.

## STATUS: decided — pdf.js in a WebView. Target 3 passed; 1, 2 and 4 pending hardware.

The renderer decision is recorded in `docs/adr/0001-pdf-renderer.md`. The
deciding argument is **coordinate systems**, not overlay capability.

**Target 3 (char offset → screen rect) PASSES** — measured in a desktop browser,
which is the right instrument for a correctness question. Results below.

Targets 1 (peak RSS), 2 (scroll smoothness) and 4 (time to first page) are
unmeasured: they need a low-end Android handset and a physical iPhone, and no
devices are attached to the build machine.

## Test corpus

`make-test-pdf.py` generates dependency-free, genuinely text-selectable PDFs
(real `Tj` text operators, not scanned images — the whole question is whether
selection yields usable coordinates, so an image-only corpus would prove
nothing).

```bash
python3 make-test-pdf.py 350 assets/large-350p.pdf   # 350pp, ~215 KB
python3 make-test-pdf.py 12  assets/small-12p.pdf    # control
```

Validated: both parse and render through Apple's own PDF stack (verified via
QuickLook thumbnail render), 350 `/Type /Page` objects, valid xref and trailer.
The PDFs are gitignored; regenerate them rather than committing binaries.

## Findings so far

### Both native candidates fail the anchored-overlay requirement

**`react-native-pdf@7.0.5`** — its complete public API is 30 props, one ref
method (`setPage`), and these two facts:

```ts
enableTextSelection?: boolean;   // "Only works on iOS. Defaults to `true`."

type TextSelectionChangeEvent = {
  nativeEvent:
    | { type: 'selectionCleared' }
    | { type: 'selectionChanged'; text: string };   // <- the STRING. Nothing else.
};
```

- **No text selection on Android at all**, by the library's own documentation.
- On iOS, selection returns the selected *string* with **no rects, no page
  number, no geometry of any kind**.
- The only coordinates anywhere in the API are `onPageSingleTap(page, x, y)` —
  a tap point, not a selection.
- There is no page↔view coordinate transform. `onScaleChanged(scale)` reports
  zoom but nothing reports scroll offset or page origin, so even given rects
  there is no supported way to keep an overlay anchored through scroll.

**`react-native-pdf-renderer@2.3.0`** — nine props total (`source`, `style`,
`distanceBetweenPages`, `maxZoom`, `maxPageResolution`, `singlePage`,
`onPageChange`, `onError`, `testID`). **No text API whatsoever**: no selection,
no extraction, no geometry. It is a fast scrolling page rasterizer and nothing
more.

### CORRECTION (2026-08-28): the category-ceiling claim was wrong

An earlier revision of this file concluded that the limitation was upstream of
the JS binding — that Android's platform PDF support is a rasterizer with no
text layer, so *no* React Native library could ever surface selection geometry.

**That is superseded and was already out of date when written.** Verified at
`developer.android.com/jetpack/androidx/releases/pdf`:

`androidx.pdf` reached **1.0.0-beta01 on 2026-08-26** and provides text
selection with drag handles, multi-page selection across page boundaries,
find-in-file search with streaming results, snap-to-text highlighting, free-form
annotation with an eraser, undo/redo, form filling, and an OCR provider. It
backports to `minSdk 28`, so it covers roughly two billion active devices — not
a bleeding-edge-only option.

The mistake was conflating `android.graphics.pdf.PdfRenderer` — the old
rasterizer, which genuinely has no text layer — with "Android's PDF stack".
`androidx.pdf` is a different, newer Jetpack library. Android is no longer
selection-free at the platform level.

### What is still true

The two libraries audited above still expose no usable geometry. That finding
was measured from their published typings and stands:

- `react-native-pdf@7.0.5` — iOS-only selection returning a bare string
- `react-native-pdf-renderer@2.3.0` — no text API at all

So the gap is in the **React Native binding layer**, not in the platform. No
maintained RN library wraps `androidx.pdf` today. Closing that gap means
writing a native module across `androidx.pdf` and PDFKit — which is the best
long-term end state and the wrong cost right now. It is recorded as the revisit
path in the ADR rather than dismissed.

## Target 3 — RESULT: PASS

**The char-offset → screen-rect round trip works.** Run in a desktop browser
against the 350-page corpus (1,325,480 characters) with virtualization on.

| Check | Result |
|---|---|
| 60 sentence-length ranges spread across the document | **60/60** drawn text === expected text |
| Systematic sweep, every 3,500 chars, whole document | **379/379** resolved |
| Survives scroll away and back | **yes** — position identical |
| Survives zoom 0.75 → 1.1 → 1.75 → 2.5 (459px → 1530px page) | **yes** — normalized width identical at 0.7765 across all |

The anchor design is sound. Highlighting a sentence from a server-issued
character offset lands on the right words and stays there.

### Two bugs found, both of the silent-wrong-answer class

Neither would have thrown. Both would have drawn a highlight over the wrong
text while reporting success — which is precisely the failure mode the ADR
argues native SDKs would multiply by building the mapping twice.

**1. pdf.js's TextLayer does not render a span for a zero-length item.**

Such items are real: they are `hasEOL` markers that contribute a newline to the
page's text, so they count for character offsets but produce no DOM node.
Indexing spans positionally by item index is therefore wrong — and wrong in the
worst way, because it agrees with reality on most pages and shifts on the ones
containing empty items. Page 94 of the corpus has **38 items and 36 spans**.

Caught only because the shift ran off the end of the span list and produced no
rects. A smaller shift would have highlighted the wrong sentence silently.

Fix: `buildPageIndex` tracks a separate `spanIndex` that advances only for
non-empty items, and `rectsForRange` asserts `spans.length` equals the expected
non-empty count before measuring anything.

**2. pdf.js v4's TextLayer requires `--scale-factor` on its container.**

Without it the layer sizes itself against an implicit scale of 1. Glyph
positions still look plausible on screen, so nothing appears broken — the
failure only surfaces when you *measure* a rect.

Caught by the zoom survival test: highlight width went **0.92 → 0.58 → 1.35** of
page width across three zoom levels, at one point drawing a highlight wider than
the page, while x/y anchored perfectly and the text was correct throughout. With
`--scale-factor` set it is 0.7765 at every level.

### Design constraints this establishes

- **Resolution requires the page to be rendered**, and rendering is async. Under
  virtualization an off-screen page has no text layer to measure, so the player
  must scroll a target into view and await the render before drawing. Not a
  defect — but it means highlight-on-narration has to be sequenced, not fired
  and forgotten.
- **A range spanning a page boundary resolves only on its first page.** Verified:
  a range crossing 94 → 95 returned rects for the page-94 portion only. Sentences
  do straddle page breaks, so the client must split a range at page boundaries
  and resolve each page separately. Cheap to do, invisible until it happens.
- **Virtualization holds.** With a ±2-page buffer, 7 of 350 pages were live.

### Numbers worth keeping

- Index build over 350 pages / 1.33M chars: **~15.3s cold**, ~400ms warm
  (pdf.js caches parsed pages). In production this is server-side work done once
  at parse time, not a client cost — but it sets expectations for the parser.
- Corpus: 350 pages, 219 KB, real text operators.

## Running it

```bash
cd spikes/pdf-renderer/harness && npm install
python3 ../make-test-pdf.py 350 ../assets/large-350p.pdf   # if absent
node server.js        # http://localhost:5187
```

Registered as `pdf-spike` in `.claude/launch.json`. The page exposes
`window.__spike` for automation: `highlight(from,to)`, `diagnose(from,to)`,
`sampleRanges(n)`, `setScale(s)`, `scrollTo(px)`, `renderedPages()`.

## What was NOT measured, and why


None of the four metrics — time to first page, scroll smoothness, memory
ceiling, selection coordinates — were measured on hardware.

**No physical devices are connected to this machine.** `xcrun devicectl list
devices` reports one known iPhone 16 Pro in state `unavailable`; `adb devices`
reports an empty list. One Android emulator AVD (`Medium_Phone_API_36.1`) and
the iOS simulators exist, but the brief explicitly required physical devices on
both platforms, and memory ceiling and scroll smoothness are precisely the
metrics a simulator misrepresents — it uses host RAM and host GPU.
