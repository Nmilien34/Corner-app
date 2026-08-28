// The retrieval and citation unit. Narration, action items and chat all read
// through this collection, so the anchor shape here is the load-bearing
// decision in the whole schema.
//
// ANCHOR DESIGN
//
// Every chunk carries both a page range and a character range:
//
//   pageStart/pageEnd  1-based, inclusive. What the UI jumps to.
//   charStart/charEnd  offsets into the NORMALIZED FULL TEXT of the parse
//                      generation, not into a page. Half-open [start, end).
//
// Document-wide offsets rather than page-local ones, because a chunk routinely
// straddles a page break; page-local offsets would force every chunk to carry
// a list of per-page spans, and every consumer to reassemble them. With
// document-wide offsets a chunk is one slice, and DocumentContent.pageOffsets
// converts any offset back to a page when the UI needs to draw on one.
//
// This is what each consumer needs from it:
//   - verbatim narration  a text span to highlight, resolved to a page
//   - action items        "source page and chapter"
//   - chat citations      a tappable page plus the span that justified it
//   - summaries           chapter grouping
//
// headingPath is denormalized onto the chunk on purpose. Resolving the chapter
// through the outline on every read would be a second query on the hottest
// path in the app, and the outline is immutable within a parse generation, so
// there is nothing to drift.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface ChunkAnchorDocument {
  pageStart: number;
  pageEnd: number;
  charStart: number;
  charEnd: number;
}

export interface DocumentChunkDocument extends Document<Types.ObjectId> {
  contentId: Types.ObjectId;
  parseVersion: number;
  ordinal: number;
  text: string;
  anchor: ChunkAnchorDocument;
  headingPath: string[];
  outlineNodeId: string | null;
  tokenCount: number;
  embedding?: number[];
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const chunkAnchorSchema = new Schema<ChunkAnchorDocument>(
  {
    pageStart: { type: Number, required: true, min: 1 },
    pageEnd: { type: Number, required: true, min: 1 },
    charStart: { type: Number, required: true, min: 0 },
    charEnd: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const documentChunkSchema = new Schema<DocumentChunkDocument>(
  {
    contentId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentContent",
      required: true,
    },
    // Chunks belong to a parse generation. A reparse writes generation N+1
    // beside N so an in-flight reader's anchors stay valid until the swap.
    parseVersion: { type: Number, required: true, min: 1 },
    ordinal: { type: Number, required: true, min: 0 },

    text: { type: String, required: true },
    anchor: { type: chunkAnchorSchema, required: true },

    // ["Chapter 3", "3.2 Termination"] — denormalized from the outline.
    headingPath: { type: [String], default: [] },
    // Stable within the parse generation; joins back to
    // DocumentContent.outline[].id so the player, the action-item list and the
    // summary all group by the same node instead of matching heading strings.
    outlineNodeId: { type: String, default: null, trim: true },

    tokenCount: { type: Number, required: true, min: 0 },

    // select:false keeps vectors off every ordinary read. A chunk list for a
    // 400-page book would otherwise drag hundreds of thousands of floats
    // through the app for no reason.
    embedding: { type: [Number], select: false },
    // Recorded per chunk, not per content: re-embedding a corpus on a new
    // model is incremental, and mixed-model vectors in one index are a silent
    // correctness bug that is otherwise invisible.
    embeddingModel: { type: String, trim: true },
    embeddingDimensions: { type: Number, min: 1 },
    embeddedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

// Ordered read of one parse generation, and the uniqueness that stops a
// retried embed job from writing a chunk twice.
documentChunkSchema.index(
  { contentId: 1, parseVersion: 1, ordinal: 1 },
  { unique: true },
);
// GET /v1/documents/:id/text by page range, and citation resolution.
documentChunkSchema.index({
  contentId: 1,
  parseVersion: 1,
  "anchor.pageStart": 1,
});
// Finds chunks still awaiting vectors, for embed-chunks and for resume.
documentChunkSchema.index(
  { contentId: 1, parseVersion: 1, embeddedAt: 1 },
  { partialFilterExpression: { embeddedAt: { $exists: false } } },
);

// embedding is omitted from the API shape as well as deselected from reads.
// The two do different jobs: select:false stops it being loaded, this stops it
// being serialized when something loads it deliberately (the embed job does)
// and then hands the document to a response. See model-utils.applyApiTransforms
// for the production incident that motivates the omit list.
applyApiTransforms(documentChunkSchema, ["embedding"]);

// NOTE: the Atlas Vector Search index on `embedding` CANNOT be created from
// code. It is defined in docs/atlas-vector-index.md and must be created by
// hand in the Atlas UI or CLI. A deploy that skips it fails at query time, not
// at boot.
export const DocumentChunkModel = mongoose.model<DocumentChunkDocument>(
  "DocumentChunk",
  documentChunkSchema,
);
