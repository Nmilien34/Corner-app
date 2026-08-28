# pdfjs-dist is version-locked across backend and frontend

**Pinned: `4.10.38`, exact, no caret, in three places.**

- root `package.json` → `overrides` — forces a single resolved copy for every
  workspace regardless of what each declares
- `corner-backend/package.json` → server-side text extraction
- `corner-frontend/package.json` → the reader's WebView bundle

## Why this is a lock and not a preference

Corner's anchor design stores character offsets into a normalized full text
produced on the **server**, and resolves them to rectangles on the **client**.
That only works if both sides produce character-identical text.

Using the same library on both sides makes them identical *by construction*
rather than by a maintained contract. But that guarantee is exactly as strong
as the version match. pdf.js can legitimately change any of these between
versions without it being a breaking change on their side:

- whitespace collapsing between text items
- ligature decomposition (`ﬁ` → `fi`)
- end-of-line hyphenation handling
- whether a given item is emitted at all, or with `hasEOL` set
- zero-length item emission — which already caused one silent bug

**Any of those shifts every character offset after the point of change.** The
symptom is highlights landing on the wrong words, narration following the wrong
sentence, and citations pointing near-but-not-at their source. Nothing throws.

## Upgrading is a migration, not a bump

Before changing this version:

1. Re-run the corpus cross-verification (`docs/adr/0001-pdf-renderer.md`, the
   gate that compares server-produced chunk offsets against client-resolved
   text). A version bump that passes it is safe to ship.
2. If it fails, **every stored document must be re-parsed** — chunk offsets,
   `pageOffsets`, and `AudioSegment.timingMap` cues are all invalidated
   together. Bump `DocumentContent.parseVersion` so the old generation stays
   readable until the new one is complete.
3. Bump all three declarations in the same commit. Never one side alone.

## Drift protection

`corner-backend/src/tests/pdfjs-version.test.ts` reads all three manifests and
fails if they disagree. It is a cheap test guarding an expensive mistake — a
silent one-sided bump is otherwise invisible until someone notices a highlight
is slightly off.

## Node caveat

`pdfjs-dist@4` is **ESM-only** — there is no CommonJS build. `corner-backend`
compiles to CommonJS (CONVENTIONS.md), so `require()` cannot load it. The
loader in `src/services/pdf.service.ts` uses a runtime dynamic import that
TypeScript will not downlevel to `require`. That indirection is deliberate;
removing it breaks the build at runtime, not at compile time.
