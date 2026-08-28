# ADR 0004 — TTS provider, resolved on timestamp capability

**Status:** **ACCEPTED (2026-08-28). We do not buy timestamps.**
**Supersedes the provider half of ADR 0003**, which picked OpenAI on cost before
the timing requirement was examined.

Follow-along highlighting needs per-segment timing (`AudioSegment.timingMap`),
and that requirement — not price — is what actually separates these options.

All pricing verified against provider documentation on 2026-08-28. Nothing here
is inferred from the earlier ADR.

---

## The finding that reorders everything

**OpenAI's TTS returns no alignment data of any kind.**

Verified at `developers.openai.com/api/docs/guides/text-to-speech`: the endpoint
supports `mp3`, `opus`, `aac`, `flac`, `wav` and `pcm`, and **every one returns
audio bytes only**. No word timings, no character timings, no metadata channel.
There is no format or parameter that adds them.

So the choice is not "which TTS" but **"which of three strategies produces
timings"**:

1. Pay a provider that emits them (ElevenLabs)
2. Recover them after generation (forced alignment)
3. Do without them

## Cost per hour of generated audio

At ~150 wpm and ~5.5 characters per word, one hour of speech ≈ **49,500
characters**. Book = the measured 350-page corpus (1,325,480 chars ≈ **26.8
hours** of audio). Episode = ~25,000 chars ≈ **30 minutes**.

| Option | Timings | Anchored to our text? | $/hr | ×base | $/book | $/episode |
|---|---|---|---|---|---|---|
| **OpenAI `tts-1`** | **none** | — | 0.743 | 1.00× | 19.88 | 0.375 |
| OpenAI `tts-1-hd` | none | — | 1.485 | 2.00× | 39.76 | 0.750 |
| **+ WhisperX** (self-hosted) | word | **yes, by construction** | ~0.743 + compute | ~1.00× | ~19.88 + compute | ~0.375 + compute |
| **+ ElevenLabs Forced Alignment** | word | **yes, by construction** | **0.963** | **1.30×** | **25.77** | **0.486** |
| + `gpt-4o-mini-transcribe` | word | **no — transcription** | 0.923 | 1.24× | 24.70 | 0.466 |
| + `whisper-1` | word | **no — transcription** | 1.103 | 1.48× | 29.52 | 0.557 |
| **ElevenLabs Flash** | **character, native** | yes | 2.475 | **3.33×** | 66.27 | 1.250 |
| EL Multilingual | character, native | yes | 4.950 | 6.67× | 132.55 | 2.500 |
| EL Business → Creator overage | character, native | yes | 5.94–14.85 | 8×–**20×** | 159–398 | 3.00–7.50 |

**Forced alignment costs 1.00×–1.30×. Buying native timestamps costs 3.33× at
best and 8×–20× at realistic overage rates.**

### Correction: forced alignment is not transcription

An earlier revision of this ADR costed the cheap option as *transcription* and
objected that it "transcribes what the model heard, not what was sent", making
drift a real risk. **That objection was misapplied and is withdrawn.**

Drift is a property of transcription, not of alignment. Corner always knows the
exact script text it sent to TTS, so the correct tool takes **known text + audio
in, and returns timings for that text**. It cannot produce different text
because it is not producing text at all.

That distinction also changes *which* tools qualify:

- **Forced alignment** — ElevenLabs' dedicated endpoint, or WhisperX
  self-hosted. Output is anchored to our text by construction.
- **Transcription** — `whisper-1` and `gpt-4o-transcribe` are speech-to-text.
  **OpenAI offers no forced-alignment endpoint**, so "OpenAI + Whisper" is a
  transcription path and the drift objection genuinely applies to it. Those rows
  are kept and labelled, not deleted, because the distinction is the point.

This is the same principle as ADR 0001: never let two systems independently
produce text that then has to match. Forced alignment does not; transcription
does.

**What survives the correction:** the **25 MB / ~26 minutes at 128 kbps** upload
constraint is real either way, so chapters longer than that must be split and
restitched.

## What each option actually gives you

### OpenAI TTS — no timings, cheapest, already integrated

Verified working with the restricted `corner-prod` key. Returns MPEG 128 kbps
24 kHz mono (measured, not assumed). Nothing else to say — the audio is fine and
the timing question is simply not addressed.

### ElevenLabs — character-level, natively

Verified at `elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps`.
The `with-timestamps` endpoints return `audio_base64` plus `alignment` and
`normalized_alignment` objects containing `characters`,
`character_start_times_seconds` and `character_end_times_seconds`.

**Character-level, which is finer than Corner needs and finer than word-level
alignment provides.** It maps directly onto `DocumentChunk.anchor`'s character
space with no interpolation — the cleanest possible fit for the schema, and the
only option where timings and text share a coordinate system by construction.

Keep **Flash at 3.33× visible**: it is the option worth re-costing if voice
quality turns out to drive churn, and it is a very different conversation from
the 20× overage figure.

### Any TTS + forced alignment — decouples provider from timing

Generate audio anywhere, then align it against **the script we already have**.

| Aligner | $/hr audio | Kind |
|---|---|---|
| WhisperX (self-hosted) | compute only | forced alignment |
| ElevenLabs Forced Alignment | 0.22 | forced alignment |
| `gpt-4o-mini-transcribe` | 0.18 | transcription |
| `whisper-1` | 0.36 | transcription |

ElevenLabs sells alignment standalone (10 h audio / 3 GB / 675,000 character
limits), so this strategy does not require choosing them for generation.

**The costs beyond money:**

- **A pipeline step that can fail on its own.** Generation succeeding and
  alignment failing leaves audio with no timings — a state the schema must
  represent, and a retry that must not regenerate the audio.
- **Latency.** Alignment runs roughly real-time or faster, so a 30-minute
  chapter adds tens of seconds before the timing map exists. Tolerable for
  chapter-scoped lazy generation (ADR 0003); unacceptable for a whole book.
- **The 25 MB cap — ~26 minutes of audio per request** at the measured 128 kbps.
  Longer chapters must be split and restitched. A real chunking constraint.
- **Word-level, not character-level.** Character offsets are interpolated within
  a word. Invisible for sentence highlighting; not for character-precise work.

---

## Does the timing requirement survive a podcast-first product?

**Largely not — and this is the load-bearing question, not the pricing table.**

`AudioSegment.timingMap` exists to highlight the sentence being read. That
requires the audio to correspond to text on the page.

- **Verbatim** reads the document. Highlighting is the feature.
- **Podcast mode** is a *generated adaptation* — an intro, a plain-language
  walkthrough, takeaways. **It does not correspond to document text at all**,
  so there is nothing to highlight and timings buy nothing. `tts.service.ts`
  already says podcast mode returns no cues.

ADR 0003 made podcast the primary path, on the grounds that it is 53× cheaper
and is the differentiated half of the product. If that holds, **timestamp
capability is only needed for verbatim — the expensive commodity path.**

Which produces a compounding worth seeing plainly:

| | Podcast (primary) | Verbatim (commodity) |
|---|---|---|
| Needs timings? | **no** | yes |
| OpenAI, no timings | $0.375/episode | $19.88/book |
| ElevenLabs Flash | $1.250/episode | $66.27/book |
| OpenAI + alignment | — *(unnecessary)* | $29.52/book |

Paying **3.33×–20× more per character** for native timestamps means paying it on
the mode that is **already 53× more expensive**, to serve the feature every
competitor already has — while the differentiated mode gains nothing from it.

**And it may evaporate entirely.** OQ-010 asks whether verbatim should be
on-device. If it should, the platform TTS engines supply their own word-boundary
callbacks, and Corner needs no timestamp capability from any cloud provider.
That question is unresolved, and it is upstream of this one.

---

## DECISION

**We do not buy timestamps.**

### Podcast mode ships on OpenAI `tts-1`, with no timing data

It is the differentiated feature, it is ~53× cheaper per document, and
**highlighting does not apply to it at all** — a generated adaptation has no
corresponding text on the page to highlight. Timing data would be bought and
unused.

### Verbatim, and therefore follow-along highlighting, is DEFERRED

Blocked on OQ-010. On-device verbatim would supply word boundaries from the
platform for free and **delete this requirement entirely** — no cloud provider
needs to emit or recover timings.

Deferring costs nothing: verbatim is the commodity half, every competitor has
it, and it is the expensive path. Building it before OQ-010 is answered risks
paying for timestamp capability that on-device TTS would have provided free.

### If verbatim later ships cloud-side, forced alignment is the path

At **1.00×–1.30×** it is the cheapest option that produces timings anchored to
our text. WhisperX self-hosted if the compute is already there; ElevenLabs
Forced Alignment at $0.22/hr if not.

**ElevenLabs stays recorded as a premium option only** — a paid upgrade where
the user is choosing a better voice and the cost is attributable to them, not a
default that multiplies unit cost across everyone. Flash at 3.33× remains the
figure to re-cost if voice quality turns out to drive churn.

### What this decision does not do

It does not choose a verbatim provider. That decision is deferred with the
feature, and OQ-010 is upstream of it.

## What is still unknown

- **OQ-011**: whether the $5,000 grant covers audio at all. The probe proved the
  scope works and that *something* paid; it did not prove credits did. If audio
  is excluded, every figure here is billed at full rate from request one.
- **OQ-010**: whether verbatim goes on-device, which could remove the timing
  requirement from cloud TTS entirely.
- **Whether alignment drift is tolerable in practice.** Unmeasured. It would
  need testing on real narration against known source text before the alignment
  route could be trusted.
