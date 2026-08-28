// Shared parsed content, keyed by the hash of the file bytes.
//
// [NEW — proposed] This collection is not in BRIEF's model list. It exists
// because the brief's own dedupe requirement cannot be met without it: "if a
// document with that hash has already been parsed/narrated, reuse the derived
// artifacts instead of paying twice". If chunks, embeddings and audio hang off
// a per-user Document, then two users uploading the same PDF either re-pay for
// embedding and TTS, or the app copies rows and blob keys between users at
// upload time. Both are worse than pointing both library entries at one
// content record.
//
// So the split is: DocumentContent is the FILE (shared, deduped, expensive);
// Document is the LIBRARY ENTRY (per user, cheap, renameable). Everything the
// AI pays for hangs off content. Everything the user owns or edits hangs off
// their Document. See docs/OPEN-QUESTIONS.md OQ-003.

import type { DocumentParseStatus, DocumentType } from "@corner/shared";
import { DOCUMENT_PARSE_STATUSES, DOCUMENT_TYPES } from "@corner/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

/**
 * One entry in the document's table of contents.
 *
 * Stored flat with `parentId` rather than nested. A nested tree is the natural
 * shape for a TOC but a poor shape for Mongo: it cannot be indexed by page,
 * and the player, the chunk heading path, and action-item provenance all need
 * to resolve a single node by id without walking the tree.
 *
 * `id` is stable only within a parse generation. A reparse renumbers.
 */
export interface OutlineNodeDocument {
  id: string;
  parentId: string | null;
  title: string;
  level: number;
  page: number;
  /** Offset into the normalized full text where this section starts. */
  charStart: number | null;
}

export interface DocumentContentDocument extends Document<Types.ObjectId> {
  contentHash: string;
  byteSize: number;
  mimeType: string;
  storageKey: string;
  thumbnailKey?: string;
  pageCount: number | null;
  detectedType: DocumentType | null;
  detectedLanguage: string | null;
  outline: OutlineNodeDocument[];
  pageOffsets: number[];
  normalizedTextLength: number | null;
  parseStatus: DocumentParseStatus;
  parseVersion: number;
  parseError?: string;
  parsedAt?: Date;
  ocrApplied: boolean;
  referenceCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const outlineNodeSchema = new Schema<OutlineNodeDocument>(
  {
    id: { type: String, required: true, trim: true },
    parentId: { type: String, default: null, trim: true },
    title: { type: String, required: true, trim: true },
    level: { type: Number, required: true, min: 0 },
    page: { type: Number, required: true, min: 1 },
    charStart: { type: Number, default: null, min: 0 },
  },
  { _id: false },
);

const documentContentSchema = new Schema<DocumentContentDocument>(
  {
    contentHash: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    byteSize: { type: Number, required: true, min: 0 },
    mimeType: { type: String, required: true, trim: true },
    storageKey: { type: String, required: true, trim: true },
    thumbnailKey: { type: String, trim: true },

    pageCount: { type: Number, default: null, min: 0 },
    detectedType: { type: String, enum: DOCUMENT_TYPES, default: null },
    detectedLanguage: { type: String, trim: true, default: null },

    outline: { type: [outlineNodeSchema], default: [] },

    // Char offset at which each page begins in the normalized full text.
    // pageOffsets[0] is page 1. This is the lookup table that turns a chunk's
    // document-wide charStart/charEnd into a page-local span, which is what
    // sentence highlighting and tappable citations both need. Cheap to store,
    // impossible to reconstruct later without a full reparse.
    pageOffsets: { type: [Number], default: [] },
    normalizedTextLength: { type: Number, default: null, min: 0 },

    parseStatus: {
      type: String,
      enum: DOCUMENT_PARSE_STATUSES,
      required: true,
      default: "uploaded",
    },
    // Incremented by a reparse (OCR fallback, better extractor). Chunks and
    // audio carry the generation they were built from, so a reparse writes a
    // new generation alongside the old one and the swap is atomic. Without
    // this, a reparse silently invalidates every live anchor mid-read.
    parseVersion: { type: Number, required: true, default: 1, min: 1 },
    parseError: { type: String, trim: true },
    parsedAt: { type: Date },
    ocrApplied: { type: Boolean, required: true, default: false },

    // How many Documents point here. Reaching 0 makes the blob and every
    // derived artifact eligible for cleanup-orphaned-blobs. Deleting content
    // while another user still references it is the failure this prevents.
    referenceCount: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

// The dedupe lookup. Unique: one content record per distinct file.
documentContentSchema.index({ contentHash: 1 }, { unique: true });
// Cleanup sweep: unreferenced content, oldest first.
documentContentSchema.index({ referenceCount: 1, updatedAt: 1 });
// Operator view of stuck or failed parses.
documentContentSchema.index({ parseStatus: 1, updatedAt: -1 });

applyApiTransforms(documentContentSchema);

export const DocumentContentModel = mongoose.model<DocumentContentDocument>(
  "DocumentContent",
  documentContentSchema,
);
