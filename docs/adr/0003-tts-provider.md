# ADR 0003 — TTS provider: OpenAI

**Status:** Accepted (2026-08-28).
**Decision:** **OpenAI `tts-1`** for narration. ElevenLabs is recorded as a
possible premium tier only, not a general-purpose option.

## The credits change the runway, not the design

Corner holds roughly **$5,000 in OpenAI credits**, valid until approximately
next year. One vendor and one key then cover LLM, embeddings and TTS, which
removes a second billing relationship, a second key to rotate, and a second
failure mode from the pipeline.

That is a runway argument. It is deliberately **not** a design argument, because
what $5,000 buys differs by **53x** depending on which narration mode is used —
and a decision that only looks affordable in one mode is not affordable.

Verified against published pricing on 2026-08-28: `tts-1` at **$15.00 / 1M
characters**, `tts-1-hd` at $30.00, `text-embedding-3-small` at $0.02 / 1M
tokens, `gpt-5-nano` at $0.05 / $0.40 per 1M in/out.

| Mode | Characters | Cost | What $5,000 buys |
|---|---|---|---|
| Verbatim, full book | 1,325,480 | **$19.88** | **~251 books** |
| Podcast episode | 25,000 | **$0.375** | **~13,333 episodes** |

The book figure uses the measured 350-page corpus; the episode figure assumes
~28 minutes of speech. Both are stated so they can be re-derived rather than
trusted.

**53x.** Every design decision below follows from that number, not from the
credits.

## ElevenLabs — premium tier only, and "13x" needs a caveat

Ruled out for general use. But the commonly quoted single multiple is
misleading, and recording it unqualified would mislead whoever revisits this:

| ElevenLabs option | $/1k chars | vs OpenAI `tts-1` |
|---|---|---|
| Flash | $0.05 | **3.3x** |
| Multilingual | $0.10 | 6.7x |
| Scale overage | $0.18 | 12x |
| Pro overage | $0.24 | 16x |
| Creator overage | $0.30 | **20x** |

The spread is **3.3x to 20x**, depending entirely on model and plan tier. ~13x
is a fair mid-range figure for the overage rates most likely to apply at
Corner's volume, but Flash at 3.3x is close enough to be worth re-costing if
voice quality ever becomes the reason users churn.

Recorded as a **premium tier**: a paid upgrade where the user is choosing a
better voice and the price difference is attributable to them, rather than a
default that quietly multiplies unit cost across everyone.

## The three design decisions this forces

### 1. NarrationJob is scoped to a CHAPTER, not a document

Generated **lazily, ahead of the listener** — never eagerly for a whole
document.

At $19.88 per verbatim book, eager whole-document generation means paying for
audio nobody listens to. Most listeners abandon a book partway; on eager
generation Corner has already bought the whole thing. Chapter-scoped lazy
generation means spend tracks consumption, so an abandoned book costs a chapter
rather than a book.

This is a **model change**: `NarrationJob` currently carries a `contentId` and
`parseVersion` and represents a whole document. It needs an outline-node scope
and its uniqueness index has to change with it, since the dedupe key becomes
{content, version, mode, voice, speed, **chapter**}.

*Not implemented — narration remains stubbed.*

### 2. Podcast mode is the primary path; verbatim is the expensive commodity

Podcast is 53x cheaper per document and is also the differentiated product —
an adaptation nobody else offers. Verbatim read-aloud is the commodity feature
every competitor has, and it is the one that costs $19.88 a book.

So the defaults invert from the obvious: podcast is what a user gets by
default, and verbatim is the deliberate, gated, more expensive choice.

Modelled in `docs/costs.md` per document and per listening hour.

### 3. Tiering is an open question, not a decision

On-device verbatim (free, system TTS, poor voices) with cloud podcast (paid,
good voices) is the obvious structure. It is **not** decided — the economics
are attached to `docs/OPEN-QUESTIONS.md` OQ-010 so the decision can be made on
numbers rather than instinct.

## Per listening hour, and where the cost actually sits

At ~150 wpm and ~5.5 characters per word, one hour of speech is ~49,500
characters:

- **TTS generation: $0.743 per listening hour** — paid once
- **S3 egress: $0.0026 per listening hour** — paid every listen

Generation is **286x** the delivery cost. The crossover is ~286 listens of the
same generated audio before egress overtakes generation.

That matters for two earlier decisions. It means the R2-vs-S3 egress analysis in
`docs/costs.md`, while correct, is aimed at the smaller number for narration —
and it means **content-level dedupe of generated audio is worth far more than
the storage it saves**, because the second listener of a popular document costs
$0.0026 instead of $0.743.

## What would change this decision

- **The credits expiring or not covering audio** — see OQ-011, which is
  explicitly unverified.
- **Voice quality causing churn.** ElevenLabs Flash at 3.3x is a different
  conversation from Creator overage at 20x, and is worth re-costing rather than
  dismissing on the headline multiple.
- **Podcast mode failing to land with users**, which would make verbatim the
  primary path and multiply the per-document cost by 53.
