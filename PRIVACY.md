# Privacy

**Status: incomplete.** The user-facing privacy policy is written in Phase 4.
This file currently records only what the data model has already committed to,
so those decisions are not re-litigated silently later.

Corner holds contracts, medical records and legal filings. This is not a
generic utility's privacy posture.

## What the schema already guarantees

**Documents hard-delete.** There is no soft-delete middleware on any
document-side collection. `model-utils.applySoftDeleteQueryMiddleware` is
applied to `User` only, and carries an explicit warning against reaching for it
elsewhere — a soft delete there would leave contract and medical-record text in
Mongo after the user believed it was gone.

**User records soft-delete**, so an accidental deletion is recoverable and
entitlement history survives.

**Embeddings and timing maps never serialize.** `DocumentChunk.embedding` and
`AudioSegment.timingMap` are both `select: false` *and* omitted from the API
transform at the model. Two independent mechanisms, because one of them
failing silently is how document content leaks into a response.

**Analytics carries no document content.** Enforced by a ported allowlist test,
not by convention — see `CONVENTIONS.md` → Analytics. Document titles,
filenames, extracted text, action-item content and chat messages are all user
content and none may become an event or person property.

## What deletion actually does

Precision matters here, because "delete" is a promise.

**Deleting a document destroys, immediately and irreversibly:**

- the user's library entry — their filename, tags, favourite, reading progress
- their annotations
- their action items for that document, including ones they edited
- their chat threads and messages about it, including the cited excerpts stored
  on those messages

All of it is a hard delete. There is no soft-delete middleware on any
document-side collection, and `model-utils.applySoftDeleteQueryMiddleware`
carries an explicit warning against adding one.

**What survives is the file's parsed content, and only while somebody else is
still using it.** Corner deduplicates by content hash: two people who upload the
same file share one parsed copy, one set of chunks, one set of generated audio.
Deleting your library entry does not destroy that shared copy while another
person's library still points at it.

The distinction that makes this defensible is that **what survives is no longer
attributable to the deleted user.** The shared content record has no owner
field, holds no reference to who uploaded it, and retains no trace of the
deleted library entry. Nothing links it back. What remains is a parsed file
other people are actively using — not a copy of *your* document.

**When nobody is using it, it goes.** `cleanup-orphaned-blobs` finds content
that no library entry points at and that has been unreferenced longer than the
grace period, then deletes the blob and every derived artifact — chunks,
embeddings, audio, summaries. If you were the only person holding a file,
deleting it removes the content too, on the next sweep rather than
synchronously.

## Unresolved, and material

**Whether the above is the right product answer** is undecided, even though it
is precisely implemented. A user told "deleted" may reasonably assume "the bytes
are gone now", not "the bytes are gone once nobody else has this file". Tracked
as `docs/OPEN-QUESTIONS.md` OQ-003.

**Deletion is not synchronous for shared content.** The sweep is periodic and
grace-gated, so there is a window — hours — between the last reference
disappearing and the blob being destroyed. The Phase 4 policy must state a
deletion SLA rather than implying immediacy.

**Timing may still leak dedupe.** The upload API is deliberately shaped so a
client cannot tell whether content already existed (OQ-003), but a
previously-parsed document reaches `parsed` status faster than a cold one. That
residual side channel is unaddressed.

## Still to write (Phase 4)

Retention windows, what leaves the device and when, the third-party processor
list and their training terms, the deletion SLA, and export.
