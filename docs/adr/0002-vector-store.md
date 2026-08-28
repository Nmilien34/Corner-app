# ADR 0002 — Vector store: Atlas Vector Search

**Status:** Accepted (2026-08-28).
**Decision:** Keep vectors in MongoDB Atlas Vector Search. Do not introduce a
dedicated vector database.

Recorded because this question recurs — "shouldn't vectors live in a real vector
DB?" is a reasonable instinct and the answer depends on a workload detail that
is easy to forget.

## The workload is not the one vector databases solve

Corner's retrieval is **always scoped to a single document** by the mandatory
`contentId` filter (`RetrievalService.search`, and the `filter` fields in
`docs/atlas-vector-index.md`). A query searches the chunks of one document —
hundreds, occasionally a few thousand — not a corpus of millions.

Dedicated vector stores earn their keep on the opposite shape: one enormous
index, queried without a partition key, where ANN graph quality and memory
layout dominate. At a few hundred candidates behind a hard filter, that
machinery is not doing anything Atlas cannot.

## The cost of moving is a correctness problem, not an operational one

Splitting vectors into a second store creates a **dual-write consistency
problem on every mutation that touches a chunk**:

- a document delete must remove chunks from Mongo *and* vectors from the store
- a reparse writes a new `parseVersion` and must retire the old generation's
  vectors, atomically enough that a query never blends two coordinate systems
- an interrupted embed job leaves the two stores disagreeing about what exists

Each of those is a place the two can silently diverge. The symptom is retrieval
returning chunks whose text no longer exists, or citations resolving to offsets
from a retired parse — **the same silent-wrong-answer class** eliminated in
ADR 0001 by running one PDF library on both sides. Trading a real correctness
risk for a performance benefit that does not exist at this scale is a bad deal
in the only direction that matters.

Keeping vectors on `DocumentChunk` means a chunk and its vector are the same
document. There is nothing to keep in sync.

## Revisit trigger

**Cross-document retrieval** — searching across a user's whole library rather
than within one document — changes the workload shape. The `contentId` filter
disappears, candidate counts jump by orders of magnitude, and the comparison
has to be made again on its merits. That is the trigger; nothing short of it is.

## Consequence: store vectors as BSON binData, not arrays

Disk is the binding constraint (a shared 10GB cluster), and the representation
matters more than expected.

Measured with the `bson` serializer at 1536 dimensions:

| Representation | Bytes per chunk | Per dimension |
|---|---|---|
| Array of doubles (Mongoose `[Number]`) | **20,411** | 13.29 |
| `binData` vector, float32 subtype 9 | **6,167** | 4.01 |

**3.31x smaller**, saving ~14 KB per chunk. Matches Atlas's own statement that
binData "requires about three times less disk space in your cluster compared to
embeddings that use a standard float32 array".

The saving is larger than the naive 8-bytes-to-4-bytes arithmetic suggests,
because a BSON array is not a packed buffer: every element carries a type byte,
a **stringified index key** (`"0"` … `"1535"`), and a null terminator. That
overhead is why the array costs 13.29 bytes per dimension rather than 8.

Encoded with `Binary.fromFloat32Array()`, which emits subtype 9 with the
required `0x27` float32 header byte. No precision that matters is lost —
embedding models emit float32; storing them as doubles was widening for nothing.

## Quantization: noted, not implemented

Scalar (int8) and binary (int1) quantization are available and are **not the
right lever for our constraint**, because they compress the wrong thing.

From Atlas's documentation: *"The full fidelity vectors are stored in their own
data structure on disk, and are only referenced during rescoring."* Quantization
reduces the **in-memory index footprint**; the stored documents are unchanged.

| Quantization | RAM cost vs unquantized | Disk impact |
|---|---|---|
| Scalar (int8) | ~1/3.75 (26.7%) | **none** |
| Binary (int1) | ~1/24 (4.2%) | **none** |

Binary is 1/24 rather than 1/32 because the HNSW graph itself is not compressed.

**Pull this lever if index memory ever becomes the binding constraint** — not
disk. Atlas recommends binary quantization *with rescoring* for most embedding
models: the search runs against binary vectors and then re-evaluates the
candidates using the full-fidelity vectors on disk, which is what recovers
accuracy. Recall loss can be further compensated by raising `numCandidates`, at
the cost of query latency.

One caveat for whoever picks this up: Atlas notes that scalar quantization
preserves recall best for *quantization-aware-trained* models (Voyage, Cohere,
Nomic, Jina, Mixedbread). `text-embedding-3-small` is not on that list, so
recall should be measured on Corner's own corpus rather than assumed.
