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

## Unresolved, and material

**Content deduplication means shared storage.** Two users who upload the same
file share one `DocumentContent`, one set of chunks, and one set of generated
audio. A user's hard delete removes *their* library entry and decrements a
reference count; the bytes survive while anyone else still holds the same file.

That is defensible and it is not what a user reading a deletion promise will
assume. It needs an explicit sentence in the Phase 4 policy, and possibly a
product decision. Tracked as `docs/OPEN-QUESTIONS.md` OQ-003, along with the
fact that reference counting is not yet transactional.

**Dedupe is observable.** Upload timing reveals whether a file was already in
the system. Low severity, but it is a real side channel.

## Still to write (Phase 4)

Retention windows, what leaves the device and when, third-party processor list
and their training terms, the deletion SLA, and export.
