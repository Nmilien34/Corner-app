// A user's library entry: their name for a file, their tags, their place in it.
//
// The bytes and everything derived from them live on DocumentContent, shared
// across every user who uploaded the same file (see document-content.model.ts).
// This record is deliberately cheap: deleting it costs nothing and never
// destroys another user's parse.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

/** Where the reader was when the user last closed the document. */
export interface ReadingProgressDocument {
  page: number;
  /** 0..1 through the document, for a progress bar without a page count. */
  fraction: number;
  updatedAt: Date | null;
}

export interface DocumentRecordDocument extends Document<Types.ObjectId> {
  ownerId: Types.ObjectId;
  contentId: Types.ObjectId;
  filename: string;
  tags: string[];
  favorite: boolean;
  readingProgress: ReadingProgressDocument;
  lastOpenedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const readingProgressSchema = new Schema<ReadingProgressDocument>(
  {
    page: { type: Number, required: true, default: 1, min: 1 },
    fraction: { type: Number, required: true, default: 0, min: 0, max: 1 },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

const documentSchema = new Schema<DocumentRecordDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    contentId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentContent",
      required: true,
    },
    // The user's own name for the file. Renaming must not touch content, and
    // two users who uploaded the same PDF may well call it different things.
    filename: { type: String, required: true, trim: true, maxlength: 512 },
    tags: { type: [String], default: [] },
    favorite: { type: Boolean, required: true, default: false },
    readingProgress: {
      type: readingProgressSchema,
      required: true,
      default: () => ({}),
    },
    lastOpenedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

// The library list: BRIEF asks for owner + updatedAt explicitly.
documentSchema.index({ ownerId: 1, updatedAt: -1 });
// Filename search and name sort within a user's library.
documentSchema.index({ ownerId: 1, filename: 1 });
// Favourites and tag filters.
documentSchema.index({ ownerId: 1, favorite: 1, updatedAt: -1 });
documentSchema.index({ ownerId: 1, tags: 1 });
// Reverse lookup for reference counting and cleanup.
documentSchema.index({ contentId: 1 });
// A user re-uploading a file they already have should update, not duplicate.
documentSchema.index({ ownerId: 1, contentId: 1 }, { unique: true });

applyApiTransforms(documentSchema);

// Model name is "Document" per Pepta's PascalCase-singular convention. The
// interface is DocumentRecordDocument rather than DocumentDocument because
// Mongoose already exports a `Document` type that this file imports.
export const DocumentModel = mongoose.model<DocumentRecordDocument>(
  "Document",
  documentSchema,
);
