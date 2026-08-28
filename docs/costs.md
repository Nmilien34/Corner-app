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

## `STORAGE_REGION` is wrong for S3

`render.yaml` hardcodes `STORAGE_REGION: auto` on both services, and
`config/env.ts` defaults it to `"auto"`.

`auto` is an R2 convention. **The AWS SDK requires a real region name** — the
deployed bucket is `us-east-2`. This is a live misconfiguration inherited from
the R2 assumption, and it is currently invisible because `StorageService` throws
`not implemented`, so nothing has ever asked the SDK to resolve a region.

It will surface as the first failure the moment storage is implemented.

## Region alignment

Atlas and Render are both in **us-east-1** (N. Virginia); the S3 bucket is in
**us-east-2** (Ohio). Cross-region transfer between AWS regions is billed
separately from internet egress and adds latency to every blob read. Worth
aligning when the bucket is next revisited — not urgent, but free to fix now and
not free later.
