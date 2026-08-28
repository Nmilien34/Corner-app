// Document and per-chapter summaries.
//
// [NEW — proposed] Not in BRIEF's model list, but BRIEF defines both a
// `generate-summary` job handler and a `POST /v1/documents/:id/summary`
// endpoint, and neither has anywhere to write without this. Added rather than
// left implicit.
//
// Content-scoped like chunks and audio: a summary of a file is the same
// summary for everyone who uploaded it, so it is generated once.
//
// GATED READ. Being content-scoped makes this cache-hittable by a user who did
// not pay to generate it, exactly as with NarrationJob. Summaries are a paid
// feature, so the read path gates on entitlement — the absence of a generation
// cost for THIS user is not evidence of entitlement.

import type { SummaryScope } from "@corner/shared";
import { SUMMARY_SCOPES } from "@corner/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface GlossaryTermDocument {
  term: string;
  definition: string;
  firstPage: number | null;
}

export interface DocumentSummaryDocument extends Document<Types.ObjectId> {
  contentId: Types.ObjectId;
  parseVersion: number;
  scope: SummaryScope;
  /** null for a whole-document summary; an outline node id for a chapter. */
  outlineNodeId: string | null;
  headingPath: string[];
  summary: string;
  keyPoints: string[];
  glossary: GlossaryTermDocument[];
  providerModel?: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: Date;
  updatedAt: Date;
}

const glossaryTermSchema = new Schema<GlossaryTermDocument>(
  {
    term: { type: String, required: true, trim: true },
    definition: { type: String, required: true, trim: true },
    firstPage: { type: Number, default: null, min: 1 },
  },
  { _id: false },
);

const documentSummarySchema = new Schema<DocumentSummaryDocument>(
  {
    contentId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentContent",
      required: true,
    },
    parseVersion: { type: Number, required: true, min: 1 },
    scope: { type: String, enum: SUMMARY_SCOPES, required: true },
    outlineNodeId: { type: String, default: null, trim: true },
    headingPath: { type: [String], default: [] },

    summary: { type: String, required: true },
    keyPoints: { type: [String], default: [] },
    glossary: { type: [glossaryTermSchema], default: [] },

    // See usage-event.model.ts: `model` collides with Document.model().
    providerModel: { type: String, trim: true },
    tokensIn: { type: Number, required: true, default: 0, min: 0 },
    tokensOut: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

// One summary per scope per parse generation. The partial expression lets the
// document-level summary (outlineNodeId null) coexist with chapter summaries,
// which a plain unique index would collide on across multiple nulls.
documentSummarySchema.index(
  { contentId: 1, parseVersion: 1, scope: 1, outlineNodeId: 1 },
  { unique: true },
);
documentSummarySchema.index({ contentId: 1, parseVersion: 1 });

applyApiTransforms(documentSummarySchema);

export const DocumentSummaryModel = mongoose.model<DocumentSummaryDocument>(
  "DocumentSummary",
  documentSummarySchema,
);
