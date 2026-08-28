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

## Deployment topology — corrected 2026-08-28

An earlier revision of this file asserted that Atlas and Render were both in
us-east-1 and that the bucket should match them. **Two of those three claims
were wrong.** Verified:

| Component | Region | How verified |
|---|---|---|
| Render | **Oregon** | Render dashboard, 6 services |
| Atlas | **us-east-1** (N. Virginia) | Atlas cluster page; corroborated by the shard host resolving through `compute-1.amazonaws.com`, us-east-1's legacy EC2 domain |
| S3 `corner-documents` | **us-east-2** (Ohio) | bucket config |

Three regions, none matching. That is deliberate, not drift.

### Why inter-region is the right call here

Worker-to-S3 traffic crosses regions at roughly **$0.02/GB**. The instinct is to
co-locate, but it does not pay for itself:

**The dominant cost is unaffected by region.** Audio streaming to phones is
internet egress no matter which region it leaves from — roughly $0.09/GB, and
the figures earlier in this file are unchanged. Inter-region only touches the
worker's own reads and writes: pulling a source PDF to parse, pushing generated
audio and thumbnails back. Each document is fetched a handful of times during
processing, then served to users thousands of times. The inter-region line is a
rounding error on a rounding error.

**Recreating an empty bucket is not free either.** The bucket already has its
IAM user, scoped policy, CORS rule, encryption and public-access blocks
configured. Rebuilding all of that to save cents per gigabyte on the smaller
half of the traffic is work with a negative return.

**Revisit if** the worker starts reading source documents repeatedly rather than
once per parse — a re-embedding sweep over the whole corpus, say. That would
invert the ratio, and at that point moving the bucket is worth costing out.

### `STORAGE_ENDPOINT` stays empty

The SDK derives the virtual-hosted URL from the region. Setting an explicit
endpoint pushes the SDK toward **path-style** addressing, which breaks
presigned signatures. Empty is correct for AWS; set it only for S3-compatible
providers that require an explicit host.

## Bucket CORS is load-bearing

The bucket's CORS rule exposes `Accept-Ranges` and `Content-Range`. That is not
cosmetic: **pdf.js streams PDFs using HTTP range requests**, fetching only the
byte ranges for pages being viewed, which is what lets a 350-page document open
without downloading the whole file and is the foundation of the reader's
virtualization.

Without those headers exposed, the browser hides them, pdf.js cannot tell
ranges are supported, and it **silently falls back to downloading the entire
file**. Nothing errors. The symptom is a slow first page and a memory spike on
large documents — which reads as "the reader is slow", not "someone edited a
CORS rule".

The same warning is on `REQUIRED_CORS_EXPOSE_HEADERS` in
`corner-backend/src/services/storage.service.ts`, where anyone changing storage
configuration will encounter it.
