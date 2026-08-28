# Corner PDF Editor & PDF Reader — Project Brief

> **Status note, added after Phase 0.** This is the original brief, preserved as written.
> Where it conflicts with the committed `CONVENTIONS.md`, **`CONVENTIONS.md` wins.** Known supersessions:
> - Repo layout: the brief's `corner-app/frontend` + `corner-app/backend` nesting is superseded by root npm
>   workspaces (`corner-backend/`, `corner-frontend/`, `shared/`) directly under `Corner-app/`.
> - The brief says both `marketing/` and `design/` are untracked. Corrected at the gate: **track `design/`,
>   ignore `marketing/`.**
> - The brief names PostHog as the analytics stack. Corrected: AppsFlyer stays for attribution, PostHog is a
>   second destination inside the existing `funnelEvents` wrapper. ATT is a required convention (see
>   `CONVENTIONS.md` and `OPEN-QUESTIONS.md` OQ-001/OQ-002).
> - Phase 0 is complete and its gate is passed. The live work starts at Phase 1.
> - Frontend tokens: the brief's secure-storage requirement stands and is a deliberate departure from both
>   reference apps, which use AsyncStorage.

## ROLE

You are setting up a brand new React Native + Expo project called **Corner PDF Editor & PDF Reader** (working name: **Corner**) inside the repo folder `Corner-App`, which I already cloned from GitHub and which is currently empty or near-empty.

You are working inside my masters folder. It contains my other shipped apps. **Two of them are your style guide: `leanient` and `pepta`.** Both are live React Native + Expo apps with Node backends. I want Corner to look and feel like they do, structurally, so I can move between the three repos without re-learning anything.

This is a **scaffolding task, not a feature-implementation task.** I want the skeleton, the contracts, the config, and the docs. I do not want you to build the PDF renderer or write the AI prompts today. Read the "SCOPE BOUNDARY" section carefully before you write a single file.

---

## PHASE 0 — RECON (do this first, write no project code until it is done)

Before creating anything, study `leanient` and `pepta`. Do not guess my conventions. Extract them.

Read enough of both repos to answer all of the following, and note where the two apps **disagree** (if they disagree, prefer whichever pattern appears in the more recently modified repo, and tell me which you picked and why):

**Repo layout**
- What sits at the repo root vs inside the project folder
- Exact names and casing of the frontend and backend folders (`frontend`/`app`/`mobile`, `backend`/`server`/`api`)
- Which folders are gitignored (I expect `marketing/` and `design/` to be untracked in both)
- Where `.env` files live, how many there are, and the naming convention (`.env`, `.env.example`, `.env.development`, `.env.production`)
- What's in `.gitignore`, and whether there's a root `README.md`, `package.json`, or workspace config

**Frontend conventions**
- Expo SDK version, whether it's Expo Router or React Navigation, and if Router, file-based route structure
- TypeScript or JavaScript, strictness settings, path aliases (`@/...`)
- Folder structure inside frontend: `src/` or not, and the names used for `components/`, `screens/` or `app/`, `hooks/`, `services/` or `api/`, `store/`, `constants/`, `theme/`, `types/`, `utils/`, `assets/`
- State management (Zustand / Context / Redux / React Query) and how it's organized
- Theming: colors, spacing, typography — where they live and how they're imported
- API client pattern: base URL handling, auth header injection, error shape, retry behavior
- How RevenueCat is initialized and where entitlement state is read from
- Analytics setup (I use PostHog on Pepta) and how events are named
- `app.json` / `app.config.js` structure, bundle ID convention, EAS build profiles

**Backend conventions**
- Node version, TypeScript or JS, module system (ESM vs CJS)
- Folder structure: `src/routes`, `src/controllers`, `src/services`, `src/models`, `src/middleware`, `src/jobs`, `src/utils`, `src/config` — use my actual names, not these
- Express version and app bootstrap pattern (where the server starts, how routes are registered)
- Mongoose model style: schema options, timestamps, indexes, naming (singular vs plural)
- Auth middleware: how tokens are issued and verified
- Error handling: is there a central error middleware, a custom error class, a standard JSON error envelope
- Logging library and format
- Validation library (zod / joi / express-validator) and where schemas live
- Render deployment config: `render.yaml`, build/start commands, health check endpoint
- Test setup, if any
- How the RevenueCat webhook is received and verified

**Deliverable for Phase 0:** create `Corner-App/CONVENTIONS.md` documenting everything above, with concrete file-path examples pulled from `leanient` and `pepta`. Every later decision in this task must trace back to that file. If a convention doesn't exist in either reference app, say so explicitly in `CONVENTIONS.md` and mark it `[NEW — proposed]`.

**Then stop and show me `CONVENTIONS.md` before proceeding to Phase 1.**

---

## THE PRODUCT — read this before designing anything

Corner is a PDF reader and editor for iOS and Android. The commodity half has to be genuinely good, because that's what gets installed. The AI half is why anyone stays.

### Half 1 — the PDF app (table stakes, must be excellent)

This is a crowded category. The competitors all do roughly the same set, and users churn instantly on anything that feels slow or ad-choked. Corner must cover:

- **Library / file manager**: on-device file browsing, recents, favorites/starred, folders and tags, search by filename, sorting (last modified, name, size, both directions), tabs by type (PDF / Word / Excel / PPT), file rename, duplicate, move, delete
- **Import**: system file picker, "Open with Corner" share sheet target, camera scan to PDF, photo-to-PDF, import from cloud drives later
- **Reader**: fast render, continuous scroll and page-flip modes, pinch zoom, thumbnail strip and grid, page jump, outline/TOC navigation, in-document text search with hit highlighting, bookmarks, reading progress persistence, night/sepia/reading themes, horizontal and vertical layouts
- **Annotate**: highlight, underline, strikethrough, freehand ink with color and width, sticky notes, text boxes, shapes, eraser, signature capture and placement, annotation list view, undo/redo
- **Edit / organize**: reorder pages, rotate, delete, insert, extract, merge multiple PDFs, split, compress, add watermark, add page numbers, crop
- **Convert**: PDF → Word/text, images → PDF, OCR on scanned documents to make them searchable
- **Protect**: password-protect a PDF, remove password, biometric lock on individual files or the whole app
- **Share/export**: system share sheet, save flattened copy, print

Do not build these now. But the folder structure, the navigation graph, the document model, and the type definitions must all have a place for them, so that adding them later is filling in a file rather than restructuring the app.

### Half 2 — the AI layer (the reason Corner exists)

**Listen mode.** The user opens a document and hits Listen. Corner reads it to them like a podcast: real cloud voices, not the robotic system voice. Two modes:

1. **Read-aloud (verbatim)** — the actual text of the document, with sentence-level highlight synced to the audio, so they can follow along on the page. Requires per-segment timing data.
2. **Podcast mode** — an AI-generated spoken adaptation: intro, chapter-by-chapter walkthrough in plain language, key takeaways, outro. Optionally two-host conversational style. This is a generated script, not the raw text.

Player requirements that shape the backend: chapters derived from the document outline, variable playback speed, background audio and lock-screen controls, sleep timer, resume position per document, and **offline download of generated audio**.

**Action items.** As part of processing, the AI extracts to-dos from the document — the things the reader is supposed to actually *do*. This works differently per document type, and the extraction prompt must be able to branch on it:

- A **how-to or self-help book** → practices, exercises, habits to adopt, with the chapter they came from
- A **contract or legal doc** → obligations, deadlines, renewal dates, notice periods, who owes what
- A **research paper or report** → follow-up reading, methods to try, open questions
- A **manual or spec** → setup steps in order, prerequisites, gotchas
- A **meeting doc or brief** → assigned actions and owners

Each to-do carries: title, optional detail, source page and chapter, confidence, suggested due date if the document implies one, and a completion state. The user can edit them, check them off, and export them to Reminders / Calendar.

**Doc chat.** Ask the document questions, get answers with page citations you can tap to jump to. This is the third pillar and shares the whole parsing and embedding pipeline with the other two, so it must be designed for now even if it ships later.

**Summaries.** Per-document and per-chapter summaries, key terms glossary. Cheap to add once chunking exists.

### The economics that constrain the design

Every AI feature above costs real money per document, and this is a free-to-install utility where most users never pay. The scaffold must therefore have, from day one:

- **Content-hash deduplication**: hash the file bytes; if a document with that hash has already been parsed/narrated, reuse the derived artifacts instead of paying twice. This is the single highest-leverage cost control in the whole app, because popular public PDFs and books will be uploaded by many users.
- **Per-user quotas**: pages parsed per month, TTS minutes per month, chat messages per day. Free tier gets a small allowance; paid gets a large one. Quota checks belong in middleware, not scattered in controllers.
- **Per-document hard caps**: max page count, max file size, max narration length, so one 900-page textbook can't burn a month of margin.
- **Explicit cost accounting**: every AI job records tokens/characters/seconds consumed and an estimated cost, so I can actually see unit economics per user instead of guessing from a provider bill.

### Privacy, which is a real product constraint here

People will upload contracts, medical records, and legal filings. The scaffold needs: a documented retention policy, hard delete that actually removes blobs and derived artifacts, no third-party training on content, and a `PRIVACY.md` in the repo stating what leaves the device and when. Assume this will be reviewed.

---

## DECISIONS ALREADY MADE — do not re-litigate these

| Area | Decision |
|---|---|
| Frontend | React Native + Expo, matching the SDK/router/language of the reference apps |
| Backend | Node + Express + MongoDB (Mongoose), deployed on Render — mirror the reference backends |
| Parsing | Server-side. Document uploads, backend parses, chunks, embeds |
| TTS | Cloud TTS generated server-side, cached to object storage, streamed and downloadable by the app. Provider behind a swappable interface — do not hardcode one vendor's SDK into controllers |
| Accounts | Anonymous device-ID user created on first launch, optional email upgrade later. No signup wall |
| Monetization | RevenueCat entitlements gate the AI features, matching the Pepta integration pattern |
| Analytics | PostHog, matching Pepta's setup and event-naming convention |

---

## PHASE 1 — REPO SKELETON

Mirror the reference apps exactly. My expectation, which you should override wherever `CONVENTIONS.md` says otherwise:

```
Corner-App/                          <- the cloned repo root
├── corner-app/                      <- project folder, named after the app
│   ├── frontend/
│   └── backend/
├── marketing/                       <- UNTRACKED. App Store screenshots, listing copy, ad creative
├── design/                          <- UNTRACKED. Claude's design work, mockups, design system
├── .env                             <- UNTRACKED
├── .env.example                     <- TRACKED, every key present with placeholder values
├── .gitignore
├── README.md
├── CONVENTIONS.md
├── PRIVACY.md
└── docs/
```

Requirements:
- `marketing/` and `design/` are gitignored but **created on disk** with a `README.md` inside each explaining what goes there, so the folders aren't empty and I don't lose the intent
- `.gitignore` must cover both, plus node_modules, Expo artifacts, build output, `.env*` except `.env.example`, and whatever the reference repos ignore
- Every `.env` key that exists anywhere in the codebase must appear in `.env.example` with a placeholder and a one-line comment. No exceptions. If I can't boot the app from `.env.example` alone, the scaffold is wrong
- Root `README.md`: what Corner is, the folder map, how to run frontend and backend locally, how to deploy, and where the env keys come from

---

## PHASE 2 — BACKEND SCAFFOLD

Follow the reference backends' structure. What follows is the *domain* you need to express in it, not a prescription of their folder names.

### Data models (Mongoose)

**User** — anonymous device ID as the primary identity, optional email/auth provider fields for later upgrade, RevenueCat app user ID, entitlement snapshot with expiry, quota counters with a reset date, created/last-seen timestamps, locale, and a soft-delete flag.

**Document** — owner, original filename, MIME type, byte size, page count, storage key for the blob, **content hash**, processing status enum (`uploaded` → `parsing` → `parsed` → `failed`), detected document type (book / contract / paper / manual / meeting / other), detected language, extracted outline/TOC, thumbnail key, reading progress, favorite flag, tags, and timestamps. Index on owner + updatedAt, and a separate index on contentHash.

**DocumentChunk** — document ref, ordinal, text, page start/end, character offsets, heading path (so a chunk knows which chapter it belongs to), token count, and an embedding vector field. Design for MongoDB Atlas Vector Search; leave the index definition in `docs/` with a note that it has to be created in Atlas, not in code.

**NarrationJob** — document ref, mode (`verbatim` | `podcast`), voice ID, speed, status enum, progress percent, error message, requested-by user, and cost accounting fields.

**AudioSegment** — narration ref, ordinal, chapter title, storage key for the audio file, duration, and a **timing map** aligning text spans to audio offsets (this is what powers sentence highlighting; leave the structure defined even though it's populated later).

**ActionItem** — document ref, owner, title, detail, source page, source chapter, confidence score, suggested due date, user-set due date, status (`open` | `done` | `dismissed`), whether the user edited it, and whether it was exported to the OS reminders.

**ChatMessage / ChatThread** — document ref, owner, role, content, and cited chunk refs with page numbers.

**ProcessingJob** — a generic job record: type, payload, status, attempts, lock ownership and lock expiry, next-run-at, last error. See the queue note below.

**UsageEvent** — owner, feature, units consumed (pages / characters / TTS seconds / tokens), provider, estimated cost in cents, timestamp. This is the table I'll query to understand unit economics, so make it easy to aggregate by user and by month.

### API surface

Scaffold every route with real routing, real validation schemas, real auth and quota middleware wiring, and typed request/response contracts. **Controller bodies return `501 Not Implemented` with a TODO comment naming what needs to be built.** I want the shape to be real and the logic to be absent.

```
POST   /v1/auth/anonymous              create-or-return anonymous user, issue token
POST   /v1/auth/upgrade                attach email/provider to existing anonymous user
GET    /v1/me                          profile, entitlements, quota state

POST   /v1/documents/upload-url        presigned upload target + content-hash dedupe check
POST   /v1/documents                   register uploaded doc, enqueue parse
GET    /v1/documents                   list, paginated, filter + sort
GET    /v1/documents/:id               metadata + outline + status
PATCH  /v1/documents/:id               rename, tag, favorite, reading progress
DELETE /v1/documents/:id               hard delete incl. blobs and derived artifacts
GET    /v1/documents/:id/text          extracted text by page range
POST   /v1/documents/:id/reparse       force re-parse (OCR fallback, etc.)

POST   /v1/documents/:id/narration     start narration job (mode, voice, speed)
GET    /v1/narration/:jobId            status + progress
GET    /v1/narration/:jobId/manifest   chapter list, segment URLs, durations, timing maps
DELETE /v1/narration/:jobId            cancel / delete generated audio
GET    /v1/voices                      available voices, gated by entitlement

POST   /v1/documents/:id/action-items/extract    enqueue extraction
GET    /v1/documents/:id/action-items
PATCH  /v1/action-items/:id
DELETE /v1/action-items/:id

POST   /v1/documents/:id/chat          RAG answer with citations (design for streaming)
GET    /v1/documents/:id/chat          thread history
POST   /v1/documents/:id/summary       document or per-chapter summary

POST   /v1/webhooks/revenuecat         signature-verified entitlement sync
GET    /healthz                        Render health check
```

### Services layer

One module per concern, each behind an interface so the vendor can be swapped without touching controllers:

- `storage` — object storage adapter (S3-compatible; note in the README that Cloudflare R2 is the cheap default because egress is free, which matters a lot when users stream audio)
- `pdf` — text extraction per page, outline extraction, page count, thumbnail generation, OCR fallback for scanned pages
- `chunking` — split into embedding-sized chunks that preserve page anchors and heading paths
- `embeddings` — vectorize chunks, batched
- `llm` — a single call interface with model config, retries, timeouts, token accounting; all prompts live in a dedicated `prompts/` directory as versioned files, never inline in service code
- `tts` — synthesize a script segment to audio, return duration and timing data; provider-agnostic
- `narration` — orchestrates: fetch chunks → build script (verbatim or podcast) → segment → TTS each segment → upload → assemble manifest
- `actionItems` — document-type-aware extraction, dedupe, confidence scoring
- `entitlements` — RevenueCat state resolution and quota enforcement
- `usage` — record consumption and estimated cost for every AI call

### Background jobs

Parsing, embedding, narration, and extraction are all too slow for a request cycle.

Use a **MongoDB-backed job queue with a separate worker process** rather than adding Redis/BullMQ, unless `leanient` or `pepta` already runs Redis, in which case match them. Reason: a Redis instance is a fixed monthly cost on Render, and at Corner's day-one volume a Mongo collection with an atomic `findOneAndUpdate` lock, a visibility timeout, and exponential backoff does the same job for free. Structure it so swapping in BullMQ later is a single adapter change, and say so in the README.

Job handlers to scaffold (registered, wired, bodies stubbed):
`parse-document`, `embed-chunks`, `generate-narration-script`, `synthesize-audio-segments`, `extract-action-items`, `generate-summary`, `cleanup-orphaned-blobs`.

Include `render.yaml` (or whatever the reference apps use) defining both the web service and the worker service.

### Cross-cutting

- Auth middleware verifying the token and loading the user
- Quota middleware that checks the relevant allowance *before* the handler runs and returns a structured `402`-style payload the app can turn into a paywall prompt
- Central error handler with the same JSON error envelope the reference backends use
- Request logging with a request ID
- Rate limiting on the AI endpoints specifically
- Zod (or whatever the references use) schemas for every request body and query, colocated per the reference convention

---

## PHASE 3 — FRONTEND SCAFFOLD

Match the reference apps' router, language, and folder structure. Scaffold the navigation graph and every screen as a placeholder that renders its name and is correctly wired into navigation, plus the full service/store/type layer.

**Navigation graph**

- Onboarding stack: intro, permissions, paywall
- Tabs: **Library** | **Listen** | **To-dos** | **Settings**
- Library stack: file list → document detail → reader
- Reader stack (modal-heavy): reader canvas, annotation toolbar, thumbnails/outline drawer, in-doc search, tools sheet (merge/split/rotate/compress/protect/convert), share sheet
- Listen stack: player (chapters, speed, sleep timer, follow-along highlight), voice picker, downloads
- To-dos stack: grouped by document and chapter, item detail/edit, export
- Chat: modal over the reader
- Settings: account, subscription, appearance, storage & offline, privacy & data, about

**Layers to create**

- `api/` — typed client per resource, mirroring the endpoints above, with the reference apps' base-URL and auth-header pattern
- `types/` — shared domain types matching the backend contracts exactly. If the reference apps share types between frontend and backend, do the same here; if not, keep them mirrored and note the duplication in `CONVENTIONS.md`
- `store/` — whatever the references use. Slices for: session/user, document library, active reader state, player state, to-dos, entitlements
- `hooks/` — data-fetching hooks per resource, plus `useEntitlement`, `useQuota`, `usePlayer`
- `theme/` — colors (light + dark + sepia reading theme), spacing, typography, following the reference apps' token structure
- `components/` — empty but organized subfolders with an index per group: `library/`, `reader/`, `annotations/`, `player/`, `todos/`, `common/`
- `services/` — RevenueCat init, PostHog init, file system helpers, share intent handling, background audio setup

**Dependencies to add and configure (not to use yet)**

Pick versions compatible with the Expo SDK the reference apps run. In the README, note the one real risk: **the PDF rendering and annotation library is the highest-risk dependency in this project.** Install a primary choice, and document in `docs/adr/0001-pdf-renderer.md` what the alternatives are, what each costs, and what would trigger a switch. Do not let this decision be implicit.

Also configure: document picker, file system, share-intent/"Open with" registration for PDF MIME types on both platforms, a background-capable audio player with lock-screen controls, secure storage for tokens, local auth for biometric file lock, and camera for scan-to-PDF.

`app.json` / `app.config.js`: bundle ID following my convention from the reference apps (assume `ai.boltzman.corner` unless the references suggest otherwise — flag it if you change it), app name "Corner PDF Editor & PDF Reader", associated file-type handlers, background audio mode, and EAS build profiles matching the references.

---

## PHASE 4 — DOCS

- `README.md` — as described in Phase 1
- `CONVENTIONS.md` — from Phase 0
- `PRIVACY.md` — what leaves the device, what's stored, retention, deletion
- `docs/architecture.md` — the full pipeline from upload to audio, as a diagram plus prose. This is the document I'll read in three weeks when I've forgotten how it works
- `docs/api.md` — every endpoint, request/response shapes, error codes
- `docs/data-model.md` — collections, fields, indexes, and the Atlas vector index definition I have to create by hand
- `docs/costs.md` — where money is spent per document, the dedupe and quota strategy, and rough per-document cost at the caps you chose
- `docs/adr/` — one short ADR per non-obvious decision: PDF renderer, job queue, TTS provider, vector store, storage provider
- `docs/roadmap.md` — a build order. My opinion, argue with it if you disagree: reader first, then annotations, then Listen verbatim mode, then to-dos, then podcast mode, then chat, then the editing tools. Reader has to be good before any AI matters

---

## SCOPE BOUNDARY — read this twice

**Do build:** folder structure, config files, package manifests with correct dependencies installed, database models with full schemas and indexes, route registration, middleware, validation schemas, service module interfaces with typed signatures, job handler registration, navigation graph, placeholder screens, typed API client, stores, theme tokens, env examples, and all documentation.

**Do not build:** PDF rendering, annotation logic, AI prompt content beyond a placeholder file with a TODO, TTS provider integration internals, the RAG retrieval algorithm, or any real business logic. Every function body that would contain domain logic gets a `TODO:` comment naming exactly what belongs there and which doc section describes it.

**Definition of done:**
1. `CONVENTIONS.md` exists and is accurate
2. Backend boots clean against a local Mongo and answers `GET /healthz`
3. Every route responds — `501` is fine, a crash or a 404 is not
4. Worker process starts, registers all handlers, polls, and idles without errors
5. Frontend builds and runs in Expo, every tab and screen reachable, no red screens
6. Type-checking and linting pass with zero errors in both packages
7. `.env.example` is complete enough to boot from
8. All Phase 4 docs written
9. Nothing tracked in git that shouldn't be, and `marketing/` and `design/` exist on disk

---

## HOW TO WORK

Do not do this in one shot. Check in with me at these points:

1. **After Phase 0** — show me `CONVENTIONS.md` and your reading of my structure. If you misread it, everything downstream is wrong, so this gate matters most.
2. **After the repo skeleton and backend models** — show me the data model before you build around it.
3. **After the backend is booting** — before you start the frontend.
4. **At the end** — a summary of what exists, what's stubbed, every assumption you made, and every place where `leanient` and `pepta` disagreed and you had to pick.

Keep a running `docs/OPEN-QUESTIONS.md` of anything you had to guess. Never invent a convention silently — if the reference apps don't answer it, guess, mark it `[NEW — proposed]`, and put it in that file.

If any instruction here conflicts with what you actually find in `leanient` and `pepta`, **the reference apps win.** Tell me about the conflict rather than quietly following me.
