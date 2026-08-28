# Corner — Open Questions

Decisions that are **not** settled. Nothing here is resolved; each entry records
the tradeoff, the candidate answers, and when the decision is actually needed.

Rule of this file: never invent a convention silently. If the reference apps do
not answer something, guess, mark the guess `[NEW — proposed]` in
`CONVENTIONS.md`, and log the open question here.

Status values: `OPEN` (no decision), `DECIDED` (record the outcome and date
inline, do not delete the entry).

---

## OQ-001 — ATT prompt timing for Corner

**Status:** OPEN
**Needed by:** before the first TestFlight build. **Not** a scaffold-time decision.
**Depends on:** [OQ-002](#oq-002--whether-corner-needs-att-at-launch-at-all) — if AppsFlyer is deferred, this question is moot.

### What is already settled

Pepta's ATT fix is correct and Corner inherits it (`CONVENTIONS.md` §App Tracking
Transparency). Two properties are not up for debate:

- The prompt is **auth-independent** — it must not sit behind a code path that
  requires a signed-in user.
- The prompt is **foreground-active gated with retry** — iOS silently drops the
  dialog if it is requested before the app is fully active, resolving
  `undetermined` with no UI and no error.

Both came out of a real Guideline 2.1 rejection on Pepta (2026-07-20, 1.0.1 (13)).
Neither is in question here.

### What is open

*When* within a correct implementation the prompt fires. Corner's first-run shape
differs from Pepta's in a way that changes the answer:

- **Pepta**: the user enters an onboarding funnel. There is a natural stretch of
  screens before any payoff, and the prompt can sit in it.
- **Corner**: the user opens a PDF. The value is delivered almost immediately,
  and there is no funnel to hide a prompt inside.

The tradeoff is direct and has no free option:

| Option | App Review risk | Opt-in rate |
|---|---|---|
| Fire on cold start, before any value is delivered | **Lowest** — a reviewer on a fresh install always sees it | **Worst** — the ask lands before the user knows what the app is |
| Fire after first value delivered | Higher — a reviewer who never opens a document never sees it, which is exactly how the Pepta rejection happened | Better — the ask lands in context |

Opt-in rate is not a soft metric here. It determines whether IDFA-based
attribution works at all, which determines whether Meta postbacks are usable,
which is the reason AppsFlyer is in the stack. A technically-correct prompt with
a poor opt-in rate buys the review surface without the attribution.

### Candidate

Fire after the first document opens, with a **pre-prompt** explaining why the
permission is being asked, **but** guaranteed to fire on a fresh install with no
auth and no document opened, provided the app has been foregrounded long enough.

The guarantee is the load-bearing part. It is what separates this from the
pattern that got Pepta rejected: the deferred path is the common case, and the
unconditional timer is the backstop that ensures a reviewer who only launches the
app and puts it down still sees the dialog. If the candidate is adopted, the
backstop needs a defined threshold and its own test, in the same style as
`attPrompt.test.ts` — the existing test drives the suppression-and-retry path
through injected collaborators, so a time-based backstop must be injectable too
rather than reaching for a real timer.

### Open sub-questions if the candidate is taken

- What is the backstop threshold, and is it wall-clock foreground time or
  session count?
- Does the pre-prompt suppress the real dialog if declined, or is it purely
  explanatory? A pre-prompt that can permanently prevent the system dialog
  reintroduces the reviewer-never-sees-it failure.
- Does opening a document from a share intent or file handler count as
  "first document opened"?

---

## OQ-002 — Whether Corner needs ATT at launch at all

**Status:** OPEN
**Needed by:** before AppsFlyer is wired, because it decides whether it is wired.
**Blocks:** [OQ-001](#oq-001--att-prompt-timing-for-corner).

### Framing

ATT is not required by Corner's own feature set. It is required *only* because
AppsFlyer wants IDFA. Remove the IDFA dependency and the entire ATT surface —
prompt timing, the rejection risk, the usage-description string, and the tracking
section of the privacy label — leaves the day-one review surface.

So the real question is upstream of OQ-001: does Corner ship with paid
acquisition on day one?

### Both sides

**Defer AppsFlyer.**

- Removes ATT from the review surface entirely. No prompt, no timing question, no
  repeat of the Guideline 2.1 failure mode on a first submission.
- Simplifies the App Privacy label: no "Data Used to Track You" section, which is
  the section that requires the most care to fill in correctly.
- Less first-submission surface generally, which matters most on a first
  submission where the app has no review history.

**Ship AppsFlyer now.**

- Attribution has no backfill. Installs that happen before the SDK is integrated
  are permanently unattributed, so the first paid campaign runs without a clean
  organic baseline to measure lift against.
- Integrating later means shipping ATT into an app that already has users, where
  the prompt arrives on an update rather than on a fresh install — a different
  and less-tested path than the one Pepta's implementation was built for.

### Constraint if AppsFlyer is scaffolded now

Not a decision, a condition on one of the outcomes: if AppsFlyer is scaffolded
before this is settled, it must sit **behind a flag that can ship off**. Off must
mean the SDK does not initialise and the ATT prompt does not fire — not merely
that events are dropped after the fact. A flag that still triggers the permission
dialog does not remove the review surface and therefore does not buy anything
this question is asking for.

Note that this interacts with the analytics fan-out in `CONVENTIONS.md`:
`funnelEvents.ts` is the single fan-out point to both AppsFlyer and PostHog, and
`posthogFanOut.test.ts` asserts a broken PostHog cannot break the AppsFlyer send.
The inverse needs to hold too — a disabled AppsFlyer must not break the PostHog
send, and PostHog carries no IDFA dependency, so product analytics should be
unaffected by whichever way this lands.

### What this does not decide

Whether Corner uses PostHog. It does — that is settled in `CONVENTIONS.md` and is
independent of IDFA and ATT.

---

## OQ-003 — Per-user Document vs shared DocumentContent

**Status:** OPEN — but a decision was **implemented** in Phase 2 rather than deferred, because the models could not be written without one. Recorded here so it is reviewable, not so it is undecided.
**Needed by:** now. Changing it after routes exist is a migration, not an edit.

### The problem

`BRIEF` lists `Document` with a `contentHash` and `DocumentChunk` with a "document ref", and separately requires content-hash dedupe: "if a document with that hash has already been parsed/narrated, reuse the derived artifacts instead of paying twice."

Those two cannot both hold. If chunks, embeddings, audio and summaries hang off a per-user `Document`, then two users uploading the same PDF either re-pay for embedding and TTS, or the app copies rows and blob keys between users at upload time. This is an internal inconsistency in the brief, not a brief-vs-`CONVENTIONS.md` conflict.

### What was implemented

A split, marked `[NEW — proposed]` in `document-content.model.ts`:

- **`DocumentContent`** — the file. Keyed unique on `contentHash`. Owns the blob, page count, outline, `pageOffsets`, parse status and `parseVersion`. Everything expensive hangs off it: `DocumentChunk`, `NarrationJob`, `AudioSegment`, `DocumentSummary`.
- **`Document`** — the library entry. Per user. Owns the user's filename, tags, favourite, reading progress. Cheap to create and to hard-delete.
- `DocumentContent.referenceCount` tracks how many `Document`s point at it. Zero makes the blob and derived artifacts eligible for `cleanup-orphaned-blobs`.

### RESOLVED — reference counting replaced by a sweep

`referenceCount` is **gone**. It was a mutable counter incremented and decremented by two racing code paths: a delete could reach zero while a concurrent upload was creating a new reference, and the blob would be swept out from under a live library entry. Making that safe needed a transaction around every upload and every delete.

`cleanup-orphaned-blobs` now asks the question at sweep time instead — which `DocumentContent` has no `Document` pointing at it, and has been that way longer than `ORPHAN_GRACE_HOURS` (default 24). Correct by construction, no counter to drift, and the age threshold protects the window between creating content and creating its `Document` without any lock ordering. `DocumentContent` carries a `{updatedAt}` index for the scan; `Document.contentId` is already indexed for the anti-join.

### RESOLVED — the dedupe check must not be observable

`POST /v1/documents/upload-url` is described in `BRIEF` as "presigned upload target + content-hash dedupe check". Server-side dedupe stays; **the check must not be observable by the client**.

A response that varied on whether the hash was already known would let anyone probe for the existence of a specific document by hashing a candidate file and asking. Confirming that a particular severance agreement, diagnosis letter or court filing exists in Corner is a disclosure even though no bytes are returned. That is a real leak class, and Corner's corpus is exactly the corpus where it matters.

The contract is therefore fixed at one shape: always 200, always a usable upload target, no `cached`/`deduped`/`exists` field, and no difference in what the client does next. The client always uploads; the server discards bytes it already has, at registration, invisibly. This is pinned in `uploadUrlResponseSchema` in `@corner/shared` and restated on `StorageService.createPresignedUpload`, because it is the kind of property a later "optimization" removes by accident.

Exploitation is unlikely at current scale — it needs an attacker who already has the candidate file and wants to confirm you hold it. But the fix is free today and expensive after a released client depends on the response shape, which is why it is settled now rather than logged for later.

### Still open

- **Deletion semantics.** Shared content means one user's hard delete must not destroy another user's copy. That is handled, and it also means "delete my document" does not destroy the bytes while anyone else holds the same file. Defensible; not what a user reading a deletion promise assumes. `PRIVACY.md` now states it precisely, but whether it is the right *product* answer is undecided.
- **Cross-user timing inference.** Even with an identical response shape, a deduped upload could in principle be distinguished by how fast later processing completes — a document that is already parsed reaches `parsed` immediately. Lower severity than a response-shape leak and harder to fix without deliberately delaying work. Unaddressed.

---

## OQ-004 — Action-item extraction is per-user but should be paid for once

**Status:** OPEN
**Needed by:** before the `extract-action-items` handler is written.

`ActionItem` is per-user, and has to be: the user edits titles, sets due dates, checks items off. Those cannot be shared.

But the LLM extraction that *produces* the list is content-level — the same contract yields the same obligations for everyone — and it is one of the more expensive calls in the app. So the second user to open a given file should not pay for it again.

The likely shape is a cached content-level extraction result, fanned out into per-user `ActionItem` rows on first open. That is not implemented: nothing currently stores a content-level extraction. `ActionItem.extractionKey` exists and is uniquely indexed per document, so the fan-out has stable identity to write against, but the cache itself is undesigned.

Open: where the cached extraction lives (its own collection, or on `DocumentContent`), and whether re-running extraction on a newer model invalidates per-user edits (it must not — `editedByUser` exists for this, but the merge rule is unwritten).

---

## OQ-005 — Embedding provider and vector dimensions

**Status:** **RESOLVED** — OpenAI `text-embedding-3-small`, 1536 dimensions, cosine.
**Decided:** 2026-08-28. Full reasoning in `docs/atlas-vector-index.md`.

Pinned in code as `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` / `EMBEDDING_DIMENSIONS` in `@corner/shared` so the service, the index definition and the doc cannot drift apart. `-3-large` was considered and rejected: 6.5x the price for a gain that does not materialize when retrieval is scoped to a single document by the mandatory `contentId` filter.

The worker now checks the index at startup and warns loudly if it is missing or still building, rather than letting a deploy look healthy and fail at the first chat message.

Residual risk kept on the record: Atlas does **not** validate vector width against the index — a mismatch is accepted silently and returns bad results. The embedding service must assert its own output width against `EMBEDDING_DIMENSIONS` before writing. Changing dimensions later is a create-reindex-swap migration, not an edit.

<details><summary>Original framing</summary>

**Was:** OPEN
**Needed by:** before the Atlas Vector Search index is created, which is before chat works at all.

`docs/atlas-vector-index.md` uses `numDimensions: 1536` as a placeholder. It must match the real output width of the chosen embedding model, and Atlas will not report a mismatch — it accepts the index and returns bad results.

`DocumentChunk` records `embeddingModel` and `embeddingDimensions` per chunk so a model change is detectable and re-embeddable incrementally rather than being a silent corpus-wide corruption. Changing dimensions after launch means creating a second index, re-embedding into it, and swapping — not an in-place edit.

Undecided: provider, model, dimensions, and whether chunk size should be tuned to the model's context rather than the 512-ish default assumption baked into nothing yet.

</details>

**Still open from that framing:** chunk size is still not tuned to the model. `ChunkingService.chunk` takes `targetTokens` and `overlapTokens` with no defaults chosen.

---

## OQ-006 — Quota counters use period keys, not reset dates

**Status:** OPEN — implemented as described, flagged for review.
**Needed by:** before quota middleware is written.

`BRIEF` says `User` carries "quota counters with a reset date", but the three allowances it specifies do not share a period: pages parsed and TTS seconds are monthly, chat messages are daily. One reset date cannot express that.

Implemented instead: each counter stores the **period key** it was last written in (`"2026-08"`, `"2026-08-28"`). If the stored key is not the current key, the counter is stale and reads as zero. The reset is implicit — no cron job, no window where a job has not fired yet and a user gets a free month, and no race between a reset writer and a concurrent consume.

Open: the period keys are UTC. A user in UTC-8 gets their daily chat quota back at 4pm local. Pepta already solved a version of this with a timezone parameter on request; whether Corner needs the same, or whether UTC is acceptable for a quota rather than a health log, is undecided.

---

## OQ-007 — Does serving cached audio consume TTS quota?

**Status:** OPEN — deliberately not resolved in the scaffold.
**Needed by:** before quota enforcement is wired to the narration path.

Corner deduplicates generated audio across users. When a second user requests a narration that already exists, Corner spends nothing: no TTS call, no LLM call, just a manifest and some presigned URLs.

So when user B streams 40 minutes of audio that user A paid to generate, what should happen to B's TTS quota?

**The lean is: quota tracks generation, entitlement gates access.** Under that reading B's quota is untouched — quota exists to bound what Corner SPENDS, and Corner spent nothing — while B's entitlement is still checked in full on the read, so a free user is refused regardless of how cheap serving them would be. That keeps the two mechanisms answering the two different questions they were built for, and it is why `UsageService.record` and `UsageService.consumeQuota` are separate calls rather than one: coupling them would settle this question by accident.

**The counter-argument is real enough to keep this open.** Quota is also a fairness and abuse bound, not purely a cost bound. A popular public textbook could be narrated once and then streamed by unlimited free-tier-adjacent users at zero quota cost, and bandwidth is not free even when generation is. If quota is the only lever limiting consumption, exempting cache hits removes the lever exactly where volume concentrates.

Not resolved here. What the scaffold does is keep both answers reachable: quota consumption is an explicit separate call, so making cached reads consume quota is a one-line change at the call site rather than an unpicking of coupled logic.

Related: this only bites where an artifact is content-scoped and shared — narration audio, summaries, and the cached action-item extraction. It does not apply to chat, which spends an LLM call per message no matter who asks.

---

## OQ-008 — ComPDFKit licence quote (priced fallback for the renderer)

**Status:** OPEN — **not being pursued.** Requesting the quote was explicitly reversed on 2026-08-28: it is a sales conversation for a fallback the spike may make unnecessary. The questions below stay on record so the quote can be requested later without re-deriving them.
**Needed by:** only if the pdf.js memory ceiling proves fatal. Not on the critical path.

`docs/adr/0001-pdf-renderer.md` names ComPDFKit as the priced fallback. It has **no public pricing** — every tier is quote-only, and the referenced "Community License" for start-ups carries no published figure (verified at `compdf.com/pricing`, 2026-08-28).

A quote has not been requested, because doing so means submitting company and contact details plus app volume and deployment model to a vendor's sales team — information only the product owner can supply, and an outward-facing action worth taking deliberately.

When requesting it, ask for: the Community tier figure and its eligibility limits; perpetual vs subscription; whether the licence is per-bundle-ID (Corner ships `ai.boltzman.corner` on two platforms); and whether the React Native binding costs more than the native SDKs. A 30-day watermark-free production trial key is available and would let the fallback be measured on the same corpus before any money is committed.

---

## Backlog not yet migrated

`CONVENTIONS.md` §"Conventions absent from both references" carries a list of
`[NEW — proposed]` items accepted at the Phase 0 gate (job queue, vector search,
quotas, provider interfaces, R2, retention, sepia theme, and others). Those are
approved directions rather than open questions, but any that turn out to need a
real decision should be promoted into this file as they are hit.
