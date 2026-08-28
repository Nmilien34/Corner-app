// Request/response contracts shared by the API and (from Phase 3) the client.
//
// Public contracts live here, not in route-local files, so the two packages
// cannot drift. Provider-private payload shapes (a RevenueCat webhook body,
// say) stay next to their adapter — they are never a client contract.

import { z } from "zod";

import {
  ACTION_ITEM_STATUSES,
  DOCUMENT_TYPES,
  NARRATION_MODES,
  SUMMARY_SCOPES,
} from "../constants";

export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a 24-character hex id");

export const idParamSchema = z.object({ id: objectIdSchema });
export const jobIdParamSchema = z.object({ jobId: objectIdSchema });

// ---- Auth -------------------------------------------------------------------

export const anonymousAuthRequestSchema = z.object({
  deviceId: z.string().min(8).max(200),
  locale: z.string().max(20).optional(),
});

export const upgradeAuthRequestSchema = z.object({
  provider: z.enum(["google", "apple", "email"]),
  idToken: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

// ---- Documents --------------------------------------------------------------

/**
 * Upload target request.
 *
 * The response to this deliberately does NOT reveal whether the content
 * already exists — see uploadUrlResponseSchema.
 */
export const uploadUrlRequestSchema = z.object({
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(200),
  byteSize: z.number().int().positive(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/, "Expected a lowercase sha256 hex digest"),
});

/**
 * PRIVACY-CRITICAL SHAPE. Read the comment before changing this.
 *
 * BRIEF describes this endpoint as "presigned upload target + content-hash
 * dedupe check". Server-side dedupe stays; the CHECK must not be observable.
 *
 * A response that varied on whether the hash was already known would let any
 * client probe for the existence of a specific file by hashing a candidate and
 * asking. Corner's corpus is contracts, medical records and legal filings, so
 * "does this exact document exist in your system" is a question the API must
 * be unable to answer. Confirming a specific severance agreement, diagnosis
 * letter or filing is a disclosure even though no bytes are returned.
 *
 * Therefore: exactly one response shape, always 200, always a usable upload
 * target, no `cached`/`deduped`/`exists` field, and no variation in what the
 * client does next. The client always uploads. The server discards bytes it
 * already has, at registration, where the client cannot see it.
 *
 * This costs one redundant upload on a dedupe hit. That is the price of the
 * property, it is small, and it is the reason this is fixed now rather than
 * after the API ships and the shape is load-bearing for a released client.
 */
export const uploadUrlResponseSchema = z.object({
  uploadUrl: z.string().url(),
  storageKey: z.string().min(1),
  expiresAt: z.string().datetime(),
});

export const registerDocumentRequestSchema = z.object({
  filename: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(200),
  byteSize: z.number().int().positive(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  storageKey: z.string().min(1),
});

export const listDocumentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  sort: z
    .enum(["updatedAt", "createdAt", "filename", "byteSize"])
    .default("updatedAt"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  favorite: z.coerce.boolean().optional(),
  tag: z.string().max(64).optional(),
  search: z.string().max(200).optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
});

export const updateDocumentRequestSchema = z
  .object({
    filename: z.string().min(1).max(512).optional(),
    tags: z.array(z.string().max(64)).max(50).optional(),
    favorite: z.boolean().optional(),
    readingProgress: z
      .object({
        page: z.number().int().min(1),
        fraction: z.number().min(0).max(1),
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export const documentTextQuerySchema = z.object({
  pageStart: z.coerce.number().int().min(1).default(1),
  pageEnd: z.coerce.number().int().min(1).optional(),
});

// ---- Narration --------------------------------------------------------------

export const startNarrationRequestSchema = z.object({
  mode: z.enum(NARRATION_MODES),
  voiceId: z.string().min(1).max(100),
  speed: z.number().min(0.5).max(3).default(1),
});

// ---- Action items -----------------------------------------------------------

export const updateActionItemRequestSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    detail: z.string().max(4000).optional(),
    dueDate: z.string().datetime().nullable().optional(),
    status: z.enum(ACTION_ITEM_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

// ---- Chat and summary -------------------------------------------------------

export const chatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  threadId: objectIdSchema.optional(),
});

export const chatHistoryQuerySchema = z.object({
  threadId: objectIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const summaryRequestSchema = z.object({
  scope: z.enum(SUMMARY_SCOPES).default("document"),
  outlineNodeId: z.string().max(100).optional(),
});

export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;
export type RegisterDocumentRequest = z.infer<typeof registerDocumentRequestSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
export type StartNarrationRequest = z.infer<typeof startNarrationRequestSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
