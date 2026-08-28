# Atlas Vector Search index

**This index cannot be created from application code.** Mongoose's
`schema.index()` does not create Atlas Search indexes, so nothing in
`corner-backend` will bring it into existence. It must be created by hand in
the Atlas UI, the Atlas CLI, or the Admin API.

A deploy that skips it does **not** fail at boot. It fails at query time, the
first time someone asks a document a question. Treat creating it as part of
provisioning a new environment, alongside creating the database user.

## Definition

Collection: `documentchunks` (Mongoose pluralizes `DocumentChunk`)
Index name: `chunk_embedding_index`
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

`contentId` scopes retrieval to the document being asked about. Without it a
query searches every chunk of every document in the cluster, which is both
wrong (answers cite other people's files) and a privacy incident, given Corner
holds contracts and medical records.

`parseVersion` scopes retrieval to the current parse generation. A reparse
writes generation N+1 alongside N (see `document-content.model.ts`), so without
this filter a search returns a blend of both generations, with anchors that
point into two different coordinate systems.

## numDimensions is not a free choice

`1536` is a placeholder matching the common OpenAI `text-embedding-3-small`
output. It **must** equal the real output width of whichever embedding model
Corner ends up using, and Atlas will not tell you it is wrong — it will accept
the index and return bad results.

The embedding provider is not chosen yet (`docs/OPEN-QUESTIONS.md` OQ-005).
`DocumentChunk` records `embeddingModel` and `embeddingDimensions` per chunk
precisely so that a change of model is detectable and re-embeddable
incrementally, rather than being a silent corpus-wide corruption.

Changing dimensions later means: create a second index, re-embed into it, then
swap. It is not an in-place edit.

## Creating it

Atlas CLI:

```bash
atlas deployments search indexes create \
  --deploymentName <cluster> \
  --file docs/atlas-vector-index.json
```

The JSON file above needs a `database`, `collectionName`, `name`, and `type`
wrapper when used with the CLI; the `fields` block is the part that matters and
is reproduced verbatim.

## Local development

Atlas Vector Search does not exist in a local `mongod`. Chat retrieval will not
work against a local database. Options, in order of preference:

1. Use a free-tier Atlas cluster for development.
2. Stub the retrieval service behind its interface (it is already designed to
   be swappable) and return fixture chunks.

Do not attempt to emulate it with a `$near` or a text index — the results are
not comparable and the difference will be mistaken for a prompt problem.
