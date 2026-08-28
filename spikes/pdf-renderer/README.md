# Spike: PDF renderer selection

Evidence for `docs/adr/0001-pdf-renderer.md`. Deliberately outside
`corner-frontend/` so it cannot contaminate the scaffold, and outside the npm
workspace list so `npm install` at the root never pulls it in.

## STATUS: decided — pdf.js in a WebView. Measurement still outstanding.

The renderer decision was made on 2026-08-28 and is recorded in
`docs/adr/0001-pdf-renderer.md`. The deciding argument is **coordinate
systems**, not overlay capability — see the ADR.

The four spike targets have **not** been measured, because no physical devices
are attached to the build machine. The harness is unbuilt; this directory
currently holds only the test corpus generator and these findings.

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

## What was NOT measured, and why

None of the four metrics — time to first page, scroll smoothness, memory
ceiling, selection coordinates — were measured on hardware.

**No physical devices are connected to this machine.** `xcrun devicectl list
devices` reports one known iPhone 16 Pro in state `unavailable`; `adb devices`
reports an empty list. One Android emulator AVD (`Medium_Phone_API_36.1`) and
the iOS simulators exist, but the brief explicitly required physical devices on
both platforms, and memory ceiling and scroll smoothness are precisely the
metrics a simulator misrepresents — it uses host RAM and host GPU.
