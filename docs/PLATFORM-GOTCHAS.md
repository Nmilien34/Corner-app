# Platform gotchas

Cases where an interface stated one thing and the runtime did another. Each cost
real time to find, and each has the same fix: **verify by observing behaviour,
not by reading a screen.**

---

## OpenAI restricted-key permissions are not proven by the dialog

**Observed 2026-08-28.**

The restricted-key dialog for `corner-prod` displayed per-endpoint permission
rows. Images showed as not granted. The key generated an image anyway.

```
POST /v1/moderations        -> 401  missing_scope: model.request
POST /v1/images/generations -> 200  image generated, billed
```

Both calls used the same key in the same minute. Moderations was correctly
refused while image generation succeeded — so the key was genuinely restricted
in one direction and genuinely permissive in another, which no reading of the
dialog would have revealed.

It persisted after the settings were reviewed, and a second probe after an
explicit re-save still returned 200.

**What this means in practice**

- The rows in that dialog are **not proof of the key's actual grants**.
- The only reliable verification is to **call a denied endpoint and confirm a
  401**.
- Verify with a **free** endpoint where possible. `/v1/moderations` costs
  nothing and answers the "is this key restricted at all" question. Reserve the
  paid probe for the specific scope you must confirm, and understand that it
  only costs money in the case where the restriction failed — which is exactly
  the case worth paying to discover.

**Why it matters here.** Corner's key is the credential for a project with a
spend limit and a credit grant. Image generation is orders of magnitude more
expensive per call than anything Corner legitimately does, so a key that can
reach it has a much larger blast radius than intended.

---

## pdf.js renders no span for zero-length text items

**Found 2026-08-28.** Same class: the data model implied a 1:1 mapping between
text items and rendered spans, and the runtime did something else.

`getTextContent().items` includes zero-length items carrying `hasEOL` — real
characters that occupy offsets — but `TextLayer` renders **no DOM node** for
them. Page 94 of the test corpus has 38 items and 36 spans.

Indexing spans positionally by item index therefore agrees with reality on most
pages and silently shifts on the rest. It surfaced as "no rects" only because
the shift ran off the end of the list; a smaller shift highlights the wrong
sentence and reports success.

Guarded in `corner-frontend/src/reader/text-index.ts`, which asserts the
span/item count relationship before measuring anything, with regression tests.

---

## pdf.js v4 requires `--scale-factor` on the text layer container

**Found 2026-08-28.** Without it the layer sizes itself against an implicit
scale of 1. Glyphs still look correct on screen, so nothing appears broken — the
failure only surfaces when a rect is **measured**.

Highlight width ran 0.92 → 0.58 → 1.35 of page width across three zoom levels,
at one point wider than the page, while x/y anchored perfectly and the text was
correct throughout.

---

## The shared pattern

In all three, a surface — a settings dialog, an items array, a rendered page —
implied a fact that the runtime contradicted. None threw. Each was found by
measuring behaviour rather than trusting the representation.

Where a claim matters, assert it in code (`assertCornerKey`,
`assertExpectedBucket`, the span/item count check) or verify it with a call
whose result cannot be misread.
