# Spike: PDF renderer selection

Evidence for `docs/adr/0001-pdf-renderer.md`. Deliberately outside
`corner-frontend/` so it cannot contaminate the scaffold, and outside the npm
workspace list so `npm install` at the root never pulls it in.

## STATUS: HALTED AT THE STOP CONDITION — ADR NOT WRITTEN

The brief for this spike said: *"If a candidate cannot do anchored overlays on
both platforms, stop and tell me before writing the ADR."*

That condition was hit before the app was built, from the candidates' own
published type definitions. Details in "Findings" below. No ADR has been
written, and no renderer has been chosen.

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

### What this means

This is not a gap in two particular libraries; it is the shape of the RN native
PDF ecosystem. Both wrap the platform viewers (PDFKit on iOS, PdfRenderer on
Android). Android's `PdfRenderer` is a **rasterizer** — it converts a page to a
bitmap and exposes no text layer at all — so no thin wrapper over it can
surface selection geometry. The limitation is upstream of the JS binding.

The remaining path that can satisfy the requirement is **pdf.js in a WebView**,
where the text layer is real DOM and selection geometry comes from
`Range.getClientRects()` in coordinates that are trivially convertible to the
page's own space. That was to be the second candidate. It is untested here
because the spike halted first — and it carries the opposite risk (memory on a
350-page document), which is exactly what the spike was meant to measure.

## What was NOT measured, and why

None of the four metrics — time to first page, scroll smoothness, memory
ceiling, selection coordinates — were measured on hardware.

**No physical devices are connected to this machine.** `xcrun devicectl list
devices` reports one known iPhone 16 Pro in state `unavailable`; `adb devices`
reports an empty list. One Android emulator AVD (`Medium_Phone_API_36.1`) and
the iOS simulators exist, but the brief explicitly required physical devices on
both platforms, and memory ceiling and scroll smoothness are precisely the
metrics a simulator misrepresents — it uses host RAM and host GPU.
