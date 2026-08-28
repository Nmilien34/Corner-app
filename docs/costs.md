# Costs

Partial. Phase 4 completes this with the full per-document breakdown; what is
recorded now is the storage decision, because **deployed reality diverged from
what the rest of the docs assume** and that gap is worth writing down before it
is rediscovered from a bill.

## Storage is AWS S3, not Cloudflare R2

`docs/BRIEF.md`, `CONVENTIONS.md`, `README.md` and `storage.service.ts` all name
Cloudflare R2 as the intended default, for one reason: **R2 charges nothing for
egress**. Corner is deployed against **AWS S3**, which does.

This is not a change request. The docs simply need to describe what is running.

### Why the difference matters here specifically

Egress is not a background cost for this product — it is proportional to the
single feature Corner exists for. Listen mode streams generated audio, and
`BRIEF` additionally requires **offline download** of it, so a full file
transfers again per device. Every hour of listening is billable bytes leaving
the bucket.

That inverts the usual shape of a cost line: it grows with *engagement* rather
than with signups or storage. The more the product works, the more it costs.

### Rough per-listening-hour figure

Assumptions, all stated because the result is sensitive to them:

- Speech audio at **64 kbps mono** — reasonable for TTS narration
- S3 egress to internet at **~$0.09/GB** (US regions, standard tier)
- One listen = one transfer; downloads and re-listens on other devices multiply it

```
64 kbps x 3600 s  = 230.4 Mbit = ~28.8 MB per listening hour
28.8 MB = 0.0288 GB x $0.09/GB = ~$0.0026 per listening hour
```

**≈ $0.003 per listening hour, or ~$0.26 per 100 listening hours.**

At 128 kbps it roughly doubles to ~$0.005/hour. On R2 both numbers are **$0**.

Scale it to see where it bites rather than where it starts:

| Monthly listening | S3 egress | R2 egress |
|---|---|---|
| 1,000 hours | ~$3 | $0 |
| 50,000 hours | ~$130 | $0 |
| 500,000 hours | ~$1,300 | $0 |

AWS also provides a standing free egress allowance (100 GB/month at time of
writing), so early usage is likely to cost nothing at all. That is the trap: the
line reads zero through the entire period when the architecture is cheapest to
change, and starts growing exactly when it is hardest.

### What this does and does not justify

It does **not** justify migrating today. The bucket is configured, the storage
service is not yet implemented, and at current volume the difference is a
rounding error against TTS generation — which costs dollars per document, not
fractions of a cent per playback.

It does mean:

- `StorageService` must stay S3-compatible with no AWS-specific types in its
  signature, which is already how it is written. Moving to R2 later should be
  credentials and an endpoint, not a rewrite.
- The egress line belongs on the unit-economics dashboard `UsageEvent` feeds, or
  it will be invisible until it is a bill.
- Revisit when monthly listening hours pass roughly 50,000, or whenever egress
  becomes visible next to TTS spend.

## `STORAGE_REGION` was wrong for S3

**Fixed 2026-08-28.** `render.yaml` hardcoded `STORAGE_REGION: auto` on both
services and `config/env.ts` defaulted to `"auto"`.

`auto` is a Cloudflare R2 convention and **the AWS SDK rejects it**. This was a
live misconfiguration inherited from the R2 assumption, invisible only because
`StorageService` throws `not implemented`, so nothing had ever asked the SDK to
resolve a region. It would have surfaced as the first failure the moment storage
was implemented — at which point it would have looked like a storage bug rather
than a stale default.

Now `us-east-1` in all three places.

## Region alignment — fixed 2026-08-28

The bucket was originally created in **us-east-2** (Ohio) while Atlas and Render
are both in **us-east-1** (N. Virginia). That meant **every object read crossed
an AWS region boundary**.

Cross-region transfer is billed *separately from internet egress* — it is a
second line item, not a discount on the first — and it adds a round trip of
latency to every blob fetch. On the audio path that lands on top of the egress
cost already described above, so the two compound: each streamed segment would
have been billed once to leave us-east-2 and again to leave AWS.

**The bucket has been moved to us-east-1.** This was done while it was
effectively empty, which is the only cheap moment to do it — migrating a bucket
holding real user documents means copying every object (billed), re-signing
every stored key, and a window where `Document.contentId` points at blobs in two
places. The fix cost nothing now and would have been genuinely disruptive later.

`STORAGE_REGION` is now `us-east-1` in `config/env.ts`, both services in
`render.yaml`, and `.env.example`.

## `STORAGE_ENDPOINT` is empty for AWS

The AWS SDK derives its endpoint from the region. `STORAGE_ENDPOINT` is set only
for S3-compatible providers that need an explicit host — Cloudflare R2 being the
one this codebase would plausibly move to. Leaving it empty is correct for the
deployed setup, not an oversight.
