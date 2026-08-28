# Corner PDF Editor & PDF Reader

A React Native + Expo PDF reader and editor with a Node/Express/MongoDB
backend. The commodity half — library, reader, annotation, page tools — has to
be genuinely good, because that is what gets installed. The AI half is why
anyone stays: **audio narration** of uploaded documents, **extracted action
items**, and **document chat**, all sharing one parsing and embedding pipeline.

## Current state

**Scaffold in progress.** Phase 1 (repo skeleton) and the data-model half of
Phase 2 are done. There are no routes, no services, and no frontend yet.

| Phase | State |
|---|---|
| 0 — Recon → `CONVENTIONS.md` | Done, gate passed |
| 1 — Repo skeleton | Done |
| 2 — Backend: data models | Done (12 models, 41 indexes) |
| 2 — Backend: routes, services, jobs, `render.yaml` | Not started |
| 3 — Frontend | Not started |
| 4 — Docs | Partial (`atlas-vector-index.md`, `OPEN-QUESTIONS.md`) |

The backend does not boot yet — there is no `app.ts` or `index.ts`. `npm run
typecheck` and `npm run lint` pass, and the models register and resolve their
indexes.

## Folder map

```
Corner-app/
├── corner-backend/          API. Express 5 + Mongoose 8, CommonJS output.
│   └── src/models/          The 12 collections. All that exists so far.
├── corner-frontend/         Expo app. Placeholder until Phase 3.
├── shared/                  @corner/shared — Zod contracts, constants, types.
├── design/                  TRACKED. Mockups, design system.
├── marketing/               IGNORED. Store assets, ad creative, video.
├── docs/
│   ├── BRIEF.md             The product + scaffolding brief.
│   ├── OPEN-QUESTIONS.md    Everything guessed or undecided. Read this.
│   └── atlas-vector-index.md  Vector index you must create BY HAND in Atlas.
├── CONVENTIONS.md           How Corner is written, and why. Traced to Pepta/Leanient.
└── .env.example             Canonical env inventory. Complete by rule.
```

Three npm workspaces at the root, no nested project folder — matching Pepta and
Leanient. `design/` is tracked and `marketing/` is not; see `CONVENTIONS.md`
for why that splits the way it does.

## Running locally

Requires Node >= 20 and a MongoDB instance.

```bash
npm install
cp .env.example .env     # then fill in MONGODB_URI and JWT_SECRET
npm run build -w @corner/shared
```

Checks:

```bash
npm run typecheck
npm run lint
```

`npm run dev` starts the shared-package watcher and the backend. The backend
has no entry point yet, so it will not serve anything until Phase 2 continues.

## Where the env keys come from

`.env.example` at the root is the **complete inventory** — every `process.env`
key read anywhere in the codebase appears there with a placeholder and a
one-line comment. Backend loaders read the current working directory first,
then backfill from the repo-root `.env`.

- `MONGODB_URI` — local `mongod` for development. **Atlas in production**: the
  vector search that document chat depends on does not exist in a local mongod.
- `JWT_SECRET` — 64 characters minimum, enforced. Pepta's convention.
- `STORAGE_*` — S3-compatible. Cloudflare R2 is the cheap default because
  **egress is free**, which matters a great deal when users stream audio.
- `LLM_API_KEY` / `EMBEDDINGS_API_KEY` / `TTS_API_KEY` — declared but not yet
  read; providers are undecided (`OPEN-QUESTIONS.md` OQ-005).
- `EXPO_PUBLIC_*` — the only keys that reach the device. Everything else is
  server-only and must never take that prefix.

## Deployment

Render, mirroring Leanient's root `render.yaml`: a web service plus a **second
worker service** for the background queue. The manifest is not written yet —
it lands with the routes and the worker.

## Two things that will bite you

**The Atlas vector index is created by hand.** Nothing in this repo creates it.
A deploy without it does not fail at boot — it fails the first time someone
asks a document a question. See `docs/atlas-vector-index.md`.

**The job queue is Mongo-backed, not Redis.** An atomic `findOneAndUpdate`
lease with a visibility timeout and exponential backoff, because a Redis
instance is a fixed monthly cost on Render and neither reference app runs one.
Swapping in BullMQ later is meant to be a single adapter change.
