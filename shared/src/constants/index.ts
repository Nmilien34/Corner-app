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
