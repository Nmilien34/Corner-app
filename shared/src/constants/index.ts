// Domain enumerations shared by the backend models and (from Phase 3) the app.
//
// Convention from Pepta: declare the tuple `as const`, derive the union from
// it, and hand the tuple straight to Mongoose's `enum`. One source of truth,
// so a schema and its TypeScript type cannot drift apart.

export const DOCUMENT_PARSE_STATUSES = [
  "uploaded",
  "parsing",
  "parsed",
  "failed",
] as const;
export type DocumentParseStatus = (typeof DOCUMENT_PARSE_STATUSES)[number];

/** Drives which action-item extraction prompt runs. See BRIEF "Action items". */
export const DOCUMENT_TYPES = [
  "book",
  "contract",
  "paper",
  "manual",
  "meeting",
  "other",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * What a stored artifact requires in order to be READ.
 *
 * Recorded on the artifact at generation time, not inferred from the request,
 * because content-scoped artifacts are deduped: the second person to ask for a
 * premium narration gets a cache hit, and a gate that only guards creation
 * would wave them through.
 */
export const ENTITLEMENT_TIERS = ["free", "pro"] as const;
export type EntitlementTier = (typeof ENTITLEMENT_TIERS)[number];

export const NARRATION_MODES = ["verbatim", "podcast"] as const;
export type NarrationMode = (typeof NARRATION_MODES)[number];

export const NARRATION_STATUSES = [
  "queued",
  "scripting",
  "synthesizing",
  "ready",
  "failed",
  "canceled",
] as const;
export type NarrationStatus = (typeof NARRATION_STATUSES)[number];

export const ACTION_ITEM_STATUSES = ["open", "done", "dismissed"] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

export const CHAT_ROLES = ["user", "assistant"] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const SUMMARY_SCOPES = ["document", "chapter"] as const;
export type SummaryScope = (typeof SUMMARY_SCOPES)[number];

/** Mirrors Pepta's status vocabulary so entitlement handling reads the same. */
export const SUBSCRIPTION_STATUSES = [
  "free",
  "trialing",
  "active",
  "active_canceled",
  "past_due",
  "canceled",
  "refunded",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const AUTH_PROVIDERS = ["google", "apple", "email"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

// ---- Background jobs --------------------------------------------------------

/** The handlers named in BRIEF "Background jobs". */
export const JOB_TYPES = [
  "parse-document",
  "embed-chunks",
  "generate-narration-script",
  "synthesize-audio-segments",
  "extract-action-items",
  "generate-summary",
  "cleanup-orphaned-blobs",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

/** Same vocabulary as Pepta's complimentary-access cleanup queue. */
export const JOB_STATUSES = [
  "pending",
  "processing",
  "done",
  "retryable_failure",
  "terminal_failure",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

// ---- Usage accounting -------------------------------------------------------

/** The billable operations. One UsageEvent per provider call. */
export const USAGE_FEATURES = [
  "parse",
  "ocr",
  "embed",
  "narration_script",
  "tts",
  "chat",
  "summary",
  "action_items",
] as const;
export type UsageFeature = (typeof USAGE_FEATURES)[number];

/** What `units` counts. Kept explicit so cost rollups never add pages to tokens. */
export const USAGE_UNITS = [
  "pages",
  "tokens_in",
  "tokens_out",
  "characters",
  "tts_seconds",
] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];

// ---- Embeddings -------------------------------------------------------------

/**
 * The embedding model and its output width.
 *
 * Declared here, in shared, rather than in the service, because three things
 * must agree and none of them can detect a disagreement on its own: this
 * constant, the Atlas Vector Search index definition
 * (docs/atlas-vector-index.md), and whatever the provider actually returns.
 *
 * Atlas does NOT validate vector width against the index. A mismatch is
 * accepted silently and returns bad results, so the embedding service asserts
 * its own output against EMBEDDING_DIMENSIONS before writing.
 */
export const EMBEDDING_PROVIDER = "openai" as const;
export const EMBEDDING_MODEL = "text-embedding-3-small" as const;
export const EMBEDDING_DIMENSIONS = 1536 as const;

// ---- Text normalization contract -------------------------------------------

/**
 * Separator inserted between pages in the normalized full text.
 *
 * Part of the extraction contract, not a formatting choice. The server writes
 * it and the client's page indices are computed on the assumption it is
 * exactly this. Changing it shifts every character offset after page 1.
 */
export const PAGE_SEPARATOR = "\n\n";

/**
 * Version of the normalization RULES, independent of the pdfjs-dist version.
 *
 * Bump when the rules themselves change (a different separator, added
 * whitespace handling, hyphenation joining). A pdfjs-dist upgrade that changes
 * output does NOT bump this — that is caught by the version pin instead.
 *
 * Stored on DocumentContent so a document parsed under older rules is
 * identifiable without re-deriving its text.
 */
export const NORMALIZATION_VERSION = 1;
