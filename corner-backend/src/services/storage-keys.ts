// Object key scheme.
//
// Keys are derived, never stored as free text, so every caller produces the
// same layout and a prefix listing is always meaningful.
//
// LAYOUT
//   documents/<hash[0:2]>/<hash>/source.<ext>      the uploaded bytes
//   documents/<hash[0:2]>/<hash>/thumb.jpg         first-page thumbnail
//   documents/<hash[0:2]>/<hash>/text/v<n>.txt     normalized full text
//   narrations/<narrationId>/seg-<0000>.mp3        audio segments
//   scripts/<narrationId>.json                     generated podcast script
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

function assertHash(contentHash: string): string {
  if (!HASH_PATTERN.test(contentHash)) {
    throw new Error(`Expected a lowercase sha256 hex digest, got: ${contentHash}`);
  }
  return contentHash;
}

function contentPrefix(contentHash: string): string {
  const hash = assertHash(contentHash);
  return `documents/${hash.slice(0, 2)}/${hash}`;
}

/** Extension is advisory only — content type is authoritative. */
export function sourceKey(contentHash: string, extension = "pdf"): string {
  const safe = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `${contentPrefix(contentHash)}/source.${safe}`;
}

export function thumbnailKey(contentHash: string): string {
  return `${contentPrefix(contentHash)}/thumb.jpg`;
}

export function normalizedTextKey(contentHash: string, parseVersion: number): string {
  return `${contentPrefix(contentHash)}/text/v${parseVersion}.txt`;
}

/** Everything derived from one content hash — what the orphan sweep deletes. */
export function contentDeletePrefix(contentHash: string): string {
  return `${contentPrefix(contentHash)}/`;
}

export function audioSegmentKey(narrationId: string, ordinal: number): string {
  return `narrations/${narrationId}/seg-${String(ordinal).padStart(4, "0")}.mp3`;
}

export function narrationScriptKey(narrationId: string): string {
  return `scripts/${narrationId}.json`;
}

export function narrationDeletePrefix(narrationId: string): string {
  return `narrations/${narrationId}/`;
}
