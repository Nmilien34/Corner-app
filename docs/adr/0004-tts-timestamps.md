# ADR 0004 — TTS provider, resolved on timestamp capability

**Status:** OPEN — numbers only. No provider chosen.
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

| Option | Timings? | $/hr audio | ×OpenAI | $/book (verbatim) | $/episode (podcast) |
|---|---|---|---|---|---|
| **OpenAI `tts-1`** | **none** | 0.743 | 1.00× | 19.88 | 0.375 |
| OpenAI `tts-1-hd` | none | 1.485 | 2.00× | 39.76 | 0.750 |
| **OpenAI + `gpt-4o-mini-transcribe`** | **word** | **0.923** | **1.24×** | **24.70** | **0.466** |
| **OpenAI + Whisper** | **word** | **1.103** | **1.48×** | **29.52** | **0.557** |
| **ElevenLabs Flash** | **character** | 2.475 | **3.33×** | 66.27 | 1.250 |
| ElevenLabs Multilingual | character | 4.950 | 6.67× | 132.55 | 2.500 |
| EL Business overage | character | 5.940 | 8.00× | 159.06 | 3.000 |
| EL Scale overage | character | 8.910 | 12.00× | 238.59 | 4.500 |
| EL Pro overage | character | 11.880 | 16.00× | 318.12 | 6.000 |
| EL Creator overage | character | 14.850 | **20.00×** | 397.64 | 7.500 |

**Forced alignment is materially cheaper than buying timestamps.** Recovering
word timings after generation costs **1.24×–1.48×** OpenAI's base rate. The
cheapest provider that emits them natively is **3.33×**, and the overage rates
most likely to apply at real volume run **12×–20×**.

Against the $5,000 credit grant, in verbatim books: **251** on OpenAI alone,
**~202** with alignment, **75** on ElevenLabs Flash, **12** at Creator overage.

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

Generate audio anywhere, then transcribe it with word timestamps and align
against the known input text.

| Aligner | $/hr audio | Granularity |
|---|---|---|
| `gpt-4o-mini-transcribe` | 0.180 | word |
| `whisper-1` | 0.360 | word |
| ElevenLabs Forced Alignment | same rate as their STT | word |

ElevenLabs also sells alignment standalone (10 h audio / 3 GB / 675,000
character limits), so this strategy does not require choosing them for
generation.

**The costs beyond money:**

- **A pipeline step that can fail on its own.** Generation succeeding and
  alignment failing leaves audio with no timings — a state the schema has to
  represent, and a retry that must not regenerate the audio.
- **Latency.** Transcription runs roughly real-time or faster, so a 30-minute
  chapter adds tens of seconds before the timing map exists. Tolerable for
  chapter-scoped lazy generation (ADR 0003), unacceptable for a whole book.
- **A hard operational limit found while costing this:** OpenAI's audio upload
  cap is **25 MB**, which at the measured 128 kbps is **~26 minutes of audio per
  request**. Chapters longer than that must be split for alignment and
  restitched. That is a real chunking constraint, not a footnote.
- **Word-level, not character-level.** Character offsets must be interpolated
  within a word. For sentence highlighting that is invisible; for
  character-precise highlighting it is not.
- **Alignment can drift from the source text.** The transcript is what the model
  *heard*, not what was sent. Numbers, abbreviations and proper nouns are where
  it diverges, and every divergence is an offset that no longer matches
  `DocumentChunk.anchor`. This is the same silent-wrong-answer class as ADR 0001
  — which is precisely what using one pdf.js on both sides was chosen to avoid.

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

## What is still unknown

- **OQ-011**: whether the $5,000 grant covers audio at all. The probe proved the
  scope works and that *something* paid; it did not prove credits did. If audio
  is excluded, every figure here is billed at full rate from request one.
- **OQ-010**: whether verbatim goes on-device, which could remove the timing
  requirement from cloud TTS entirely.
- **Whether alignment drift is tolerable in practice.** Unmeasured. It would
  need testing on real narration against known source text before the alignment
  route could be trusted.
