// Object key scheme.
//
// Keys are derived, never stored as free text, so every caller produces the
// same layout and a prefix listing is always meaningful.
//
// LAYOUT — everything lives under a single corner/ root:
//   corner/documents/<hash[0:2]>/<hash>/source.<ext>   the uploaded bytes
//   corner/documents/<hash[0:2]>/<hash>/thumb.jpg      first-page thumbnail
//   corner/documents/<hash[0:2]>/<hash>/text/v<n>.txt  normalized full text
//   corner/narrations/<narrationId>/seg-<0000>.mp3     audio segments
//   corner/scripts/<narrationId>.json                  generated podcast script
//
// THE corner/ ROOT IS DEFENCE IN DEPTH, not organisation. Corner now has a
// dedicated bucket with its own IAM user scoped to it, so today the prefix
// buys nothing. It matters for the cases that arrive later: a bucket reused
// for a second purpose, a credential widened in a hurry, or an orphan sweep
// pointed at the wrong place. Confining every key to one root means the sweep
// can never enumerate anything Corner did not write, whatever the bucket
// policy happens to say that week.
//
// assertCornerKey() below is what makes it a guarantee rather than a habit.
//
// CONTENT-HASH ADDRESSING, NOT PER-USER PATHS. Objects live under the content
// hash because DocumentContent is shared across everyone who uploaded the same
// file. A per-user prefix would make the same bytes exist once per uploader,
// defeating the dedupe the whole schema is built around, and would leave the
// orphan sweep unable to tell whether a blob is still referenced.
//
// The two-character fan-out directory exists because S3 partitions by key
// prefix. Hundreds of thousands of siblings under one prefix throttles; 256
// buckets of them does not.
//
// PARSE GENERATION IN THE TEXT KEY. Derived text is versioned by parseVersion
// so a reparse writes alongside the old generation rather than over it — the
// same atomic-swap property DocumentChunk.parseVersion provides in Mongo.

const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Every object Corner writes lives under this. Nothing may escape it. */
export const CORNER_ROOT = "corner/";

/**
 * Guards the invariant instead of trusting callers to remember it.
 *
 * Every key builder returns through here, so a future builder that forgets the
 * root fails immediately rather than quietly writing to the bucket's top level
 * where the sweep's prefix guard cannot see it.
 */
export function assertCornerKey(key: string): string {
  if (!key.startsWith(CORNER_ROOT) || key.includes("..")) {
    throw new Error(`Storage key escapes ${CORNER_ROOT}: ${key}`);
  }
  return key;
}

function assertHash(contentHash: string): string {
  if (!HASH_PATTERN.test(contentHash)) {
    throw new Error(`Expected a lowercase sha256 hex digest, got: ${contentHash}`);
  }
  return contentHash;
}

function contentPrefix(contentHash: string): string {
  const hash = assertHash(contentHash);
  return `${CORNER_ROOT}documents/${hash.slice(0, 2)}/${hash}`;
}

/** Extension is advisory only — content type is authoritative. */
export function sourceKey(contentHash: string, extension = "pdf"): string {
  const safe = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return assertCornerKey(`${contentPrefix(contentHash)}/source.${safe}`);
}

export function thumbnailKey(contentHash: string): string {
  return assertCornerKey(`${contentPrefix(contentHash)}/thumb.jpg`);
}

export function normalizedTextKey(contentHash: string, parseVersion: number): string {
  return assertCornerKey(`${contentPrefix(contentHash)}/text/v${parseVersion}.txt`);
}

/** Everything derived from one content hash — what the orphan sweep deletes. */
export function contentDeletePrefix(contentHash: string): string {
  return assertCornerKey(`${contentPrefix(contentHash)}/`);
}

export function audioSegmentKey(narrationId: string, ordinal: number): string {
  return assertCornerKey(`${CORNER_ROOT}narrations/${narrationId}/seg-${String(ordinal).padStart(4, "0")}.mp3`);
}

export function narrationScriptKey(narrationId: string): string {
  return assertCornerKey(`${CORNER_ROOT}scripts/${narrationId}.json`);
}

export function narrationDeletePrefix(narrationId: string): string {
  return assertCornerKey(`${CORNER_ROOT}narrations/${narrationId}/`);
}
