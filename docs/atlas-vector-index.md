# Atlas Vector Search index

**Created 2026-08-28 and READY.** Verified queryable, with retrieval proven
end to end against the live cluster.

## It is created by script, not by hand

An earlier revision of this file said the index could only be created in the
Atlas UI. That is no longer true — the driver exposes `createSearchIndex`, so
the definition lives in version control next to the schema it indexes:

```bash
npm run atlas:index -w @corner/backend              # status
npm run atlas:index -w @corner/backend -- --create  # build it
```

`corner-backend/src/scripts/create-vector-index.ts` holds the definition and
polls until the index reports `queryable`. It stays a deliberate flagged action
rather than something a deploy runs, because building an index over a large
collection is expensive and a definition change means a full rebuild.

The worker still checks at startup and warns loudly if the index is missing or
still building — it warns rather than crashing, because parsing, narration,
action items and summaries all work without it and only chat does not.

## Vectors are stored as binData, not arrays

`DocumentChunk.embedding` is BSON **binData subtype 9, float32**, written with
`Binary.fromFloat32Array()`. Verified against the live cluster: Mongoose's
`Buffer` schema path preserves subtype 9, which is what makes the value a vector
to Atlas rather than an opaque blob. A plain Buffer with the default subtype 0
would be silently unindexed — the query would return nothing and nothing would
error.

Storage impact and the reasoning are in `docs/adr/0002-vector-store.md`; the
short version is 3.31x less disk than an array of doubles.

The **query** vector is passed as a plain array. There is one per query, so its
representation buys nothing.

## The embedding decision (resolves OQ-005)

| | |
|---|---|
| Provider | **OpenAI** |
| Model | **`text-embedding-3-small`** |
| Dimensions | **1536** (the model's native width) |
| Similarity | cosine |
| Price | $0.02 per 1M input tokens |

These are pinned in code as `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL` and
`EMBEDDING_DIMENSIONS` in `@corner/shared`, so the service and this document
cannot drift apart silently.

### Why this one

**Cost is negligible against the rest of the pipeline.** A 400-page book is
roughly 200k tokens, so embedding it costs about **$0.004**. Against TTS for
the same document — dollars, not fractions of a cent — the embedding line is
rounding error. Optimizing it would be optimizing the wrong thing.

**Same vendor as the other app.** Pepta already depends on the `openai` SDK, so
this is one API surface both codebases share rather than a new provider
relationship, a new key format, and a new failure mode to learn.

**`-3-large` was considered and rejected.** It is 3072 dimensions and about 6.5x
the price for a modest retrieval-quality gain. That gain does not pay for
itself here: Corner's retrieval is always scoped to a **single document** by the
mandatory `contentId` filter, so each query searches tens or hundreds of chunks
rather than millions. Recall pressure is low, which is exactly the regime where
the cheaper model is indistinguishable. It would also double index size and
memory.

**It has an exit.** `text-embedding-3-small` supports Matryoshka dimension
reduction (1536 → 512 or 256) at a quality cost but no provider change, if
index size ever becomes the constraint. Starting at native width keeps that
option without needing it now.

## Definition

Collection: `documentchunks` (Mongoose pluralizes `DocumentChunk`)
Index name: `chunk_embedding_index` — must match `VECTOR_INDEX_NAME` in
`corner-backend/src/jobs/vector-index-check.ts`
Type: `vectorSearch`

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "contentId"
    },
    {
      "type": "filter",
      "path": "parseVersion"
    }
  ]
}
```

## Why those two filter fields

Both are mandatory, not optional tuning.

**`contentId`** scopes retrieval to the document being asked about. Without it a
query searches every chunk of every document in the cluster — answers would
cite other people's files. For a corpus of contracts and medical records that
is not a relevance bug, it is a disclosure.

**`parseVersion`** scopes retrieval to the current parse generation. A reparse
writes generation N+1 alongside N (see `document-content.model.ts`), so without
this filter a search blends both, returning anchors that point into two
different coordinate systems.

## Creating it

Atlas CLI:

```bash
atlas deployments search indexes create --deploymentName <cluster> --file atlas-vector-index.json
```

The CLI's file needs `database`, `collectionName`, `name` and `type` wrapping
the `fields` block above.

Verify afterwards by restarting the worker: it logs
`Vector index "chunk_embedding_index" is READY.` at info level when the index
exists and is queryable, and warns otherwise.

## Changing dimensions later is a migration

Not an in-place edit. Create a second index, re-embed the corpus into it, then
swap. `DocumentChunk` records `embeddingModel` and `embeddingDimensions` per
chunk precisely so this can be done incrementally and so a partially migrated
corpus is detectable rather than silently mixed.

## Local development

Atlas Vector Search does not exist in a local `mongod` — `$listSearchIndexes`
and `$vectorSearch` are Atlas-only and error out. Document chat therefore does
not work against a local database, and the worker will say so at startup.

Options, in order of preference:

1. Use a free-tier Atlas cluster for development.
2. Stub `RetrievalService` behind its interface and return fixture chunks.

Do not try to approximate it with a text index. The results are not comparable
and the difference will be mistaken for a prompt problem.
