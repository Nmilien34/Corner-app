# ADR 0001 — PDF renderer

**Status:** Accepted (2026-08-28). Memory ceiling unmeasured; see "Open risk".
**Decision:** **pdf.js rendered inside a WebView.**

## The load-bearing argument: coordinate systems

This decision is **not** about which library can draw a highlight. It is about
which one speaks the coordinate system Corner's schema already committed to.

`DocumentChunk.anchor` stores `charStart`/`charEnd` as offsets into the
**normalized full text of a parse generation** — document-wide, not page-local.
`AudioSegment.timingMap` resolves through the *same* space, so a player position
maps to a character range and then to a page via `DocumentContent.pageOffsets`.
That was chosen deliberately (see `document-chunk.model.ts`) so narration
highlighting, action-item provenance and chat citations share one anchor space
instead of three.

The consequence is precise: **highlighting a sentence during narration means
mapping a server-issued character offset to an on-screen rectangle.** That is
the operation the renderer has to support. Not "can it highlight" — *can it
turn a character offset into geometry.*

- **pdf.js** gives that mapping natively. Its text layer is real DOM: character
  offsets index into text nodes, and `Range.getClientRects()` returns rects in a
  space trivially convertible to page coordinates. The same code runs on both
  platforms because it is the same engine, not two engines with similar APIs.
- **Native SDKs** return platform geometry and selected strings. Neither iOS
  PDFKit nor `androidx.pdf` exposes "give me the rect for characters N..M of the
  document's text". Corner would have to build an offset→rect map **twice**,
  against two different APIs, and keep both consistent with the server's
  normalization — including how whitespace was collapsed, how page breaks were
  joined, and how OCR text was interleaved. Two independent reimplementations of
  the same mapping, each able to drift from the server's parse and from each
  other, silently, in a way that manifests as highlights landing on the wrong
  words.

Overlay capability is table stakes and several options have it. The offset→rect
mapping is the thing that is cheap in one architecture and a recurring
correctness liability in the other.

## What was considered

### react-native-pdf@7.0.5 — rejected

Audited from published typings. `enableTextSelection` is documented **"Only
works on iOS"**; on iOS the selection event carries `{ text: string }` and no
rects, no page, no geometry. The only coordinates in the entire API are
`onPageSingleTap(page, x, y)`. No page↔view transform exists, so overlays could
not stay anchored through scroll even given rects.

### react-native-pdf-renderer@2.3.0 — rejected

Nine props. No text API of any kind. A fast scrolling rasterizer.

### A native module over androidx.pdf + PDFKit — right end state, wrong cost now

**Correcting an earlier claim in this repo:** a previous revision of the spike
README asserted that Android's platform PDF support is a rasterizer with no text
layer, and therefore that *no* RN library could ever surface selection geometry.
That was wrong, and it conflated `android.graphics.pdf.PdfRenderer` (the old
rasterizer) with Android's PDF stack generally.

`androidx.pdf` reached **1.0.0-beta01 on 2026-08-26** and provides text selection
with drag handles, multi-page selection, find-in-file search, snap-to-text
highlighting, annotations with eraser and undo/redo, form filling, and an OCR
provider — backported to `minSdk 28`, covering roughly two billion devices.
Verified at `developer.android.com/jetpack/androidx/releases/pdf`.

So the gap is in the **React Native binding layer**, not the platform. No
maintained RN library wraps `androidx.pdf` today.

Writing that module is the best long-term end state and is rejected on cost, not
capability. It would mean two native codebases, and — per the coordinate-system
argument above — two independent offset→rect implementations, which is precisely
the liability this decision exists to avoid. It is also premature: `androidx.pdf`
is at **beta01**, with `@ExperimentalPdfApi` on `PdfViewer`, `PdfViewerState`,
`EditablePdfViewerFragment`, `AnnotationsView` and `OcrProvider`. Building
against experimental APIs in a beta library is a maintenance commitment before
there is a product.

**Revisit when** `androidx.pdf` reaches stable and those APIs shed
`@ExperimentalPdfApi`, or when a maintained RN binding for it appears.

### ComPDFKit React Native SDK — priced fallback

Covers React Native across Android and iOS with a real annotation layer.

**No public pricing.** Every tier is quote-only: *"Our pricing depends on your
unique needs: products, features, and deployment options."* A "Community
License" is referenced for start-ups at "affordable and reasonable prices" with
no figure attached. A 30-day production trial key without watermarks is
available. Confirmed at `compdf.com/pricing`, 2026-08-28.

**A quote has not been requested.** Doing so means submitting company and
contact details to a vendor's sales team, along with app volume and deployment
model — information only the product owner can supply. When requesting it, ask
specifically for: the Community tier figure and its eligibility limits,
perpetual vs subscription, whether the licence is per-bundle-ID (Corner ships
`ai.boltzman.corner` on two platforms), and whether the React Native binding
carries a surcharge over the native SDKs.

**This is the fallback if the memory ceiling below proves fatal**, since it
sidesteps WebView memory entirely — at the cost of reintroducing the two-sided
offset→rect mapping, which would need a hard look before committing.

## Open risk — the reason this ADR is not finished

pdf.js in a WebView carries the opposite risk profile from the native options:
the mapping is free, the **memory is not**. A 350-page document rendered without
page virtualization will exhaust a low-end handset.

The mitigation is virtualization — render only visible pages plus a small
buffer — and it is unproven for Corner. Four things must be measured, in this
priority order:

1. **Peak RSS on the 350-page corpus under virtualization.** The one real risk.
2. **Scroll smoothness under virtualization** — frame timing, not impressions.
3. **Server char offset → screen rect, round-tripped.** Pick an offset range,
   draw the rect, confirm it lands on the right words and survives scroll and
   zoom. *If this does not work cleanly the anchor design itself is in question,
   not just the renderer* — escalate immediately rather than working around it.
4. **Time to first page on a cold open.**

Test on a **low-end Android handset, not a flagship**, plus a physical iPhone.
Simulators are disqualified for 1 and 2: they use host RAM and host GPU, which
is exactly what these targets are trying to bound.

**Status: unmeasured.** No physical devices are attached to the build machine
(`devicectl` reports the one known iPhone `unavailable`; `adb devices` is empty).
The corpus generator exists at `spikes/pdf-renderer/`; the harness does not.

## What would trigger a switch

- **Peak RSS exceeds the low-end Android budget with virtualization on.** The
  primary kill condition. Virtualization is the mitigation; if it is not enough
  there is no second lever inside this architecture.
- **Target 3 fails** — offset→rect does not round-trip reliably. This would
  invalidate the decision *and* the anchor design, so it escalates rather than
  simply switching renderer.
- **Frame timing stays bad under virtualization** on a low-end handset. Corner's
  commodity half has to be excellent; a janky reader loses users before the AI
  half is ever reached.
- **A maintained RN binding for `androidx.pdf` appears** and a matching iOS story
  exists — revisit the native path on its merits.

The switch target in the first three cases is ComPDFKit, contingent on the quote
and on a plan for the two-sided offset→rect mapping.
