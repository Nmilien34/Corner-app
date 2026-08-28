// A to-do the AI found in a document.
//
// Per-user, unlike chunks and audio: the user edits these, checks them off and
// sets their own due dates, so they cannot be shared across everyone who
// uploaded the same file. The extraction that PRODUCES them is content-level
// and cacheable — see docs/OPEN-QUESTIONS.md OQ-004 for how a cached
// extraction is fanned out to a second user without re-paying the LLM.

import type { ActionItemStatus } from "@corner/shared";
import { ACTION_ITEM_STATUSES } from "@corner/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface ActionItemDocument extends Document<Types.ObjectId> {
  documentId: Types.ObjectId;
  ownerId: Types.ObjectId;
  title: string;
  detail?: string;
  sourcePage: number | null;
  sourceChapter: string | null;
  outlineNodeId: string | null;
  sourceChunkId?: Types.ObjectId;
  confidence: number | null;
  suggestedDueDate: Date | null;
  dueDate: Date | null;
  status: ActionItemStatus;
  editedByUser: boolean;
  exportedToReminders: boolean;
  exportedAt?: Date;
  externalReminderId?: string;
  extractionKey: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const actionItemSchema = new Schema<ActionItemDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true, trim: true, maxlength: 500 },
    detail: { type: String, trim: true, maxlength: 4000 },

    // Provenance. BRIEF requires "source page and chapter"; outlineNodeId is
    // the structural join, sourceChapter the human label, sourceChunkId the
    // exact span so "show me where this came from" can highlight rather than
    // just turn to a page.
    sourcePage: { type: Number, default: null, min: 1 },
    sourceChapter: { type: String, default: null, trim: true },
    outlineNodeId: { type: String, default: null, trim: true },
    sourceChunkId: { type: Schema.Types.ObjectId, ref: "DocumentChunk" },

    confidence: { type: Number, default: null, min: 0, max: 1 },

    // Kept apart on purpose: suggestedDueDate is what the document implied,
    // dueDate is what the user chose. Collapsing them means a re-extraction
    // silently overwrites a date the user set.
    suggestedDueDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ACTION_ITEM_STATUSES,
      required: true,
      default: "open",
    },
    // Set once the user touches it. A re-extraction must not clobber an item
    // the user has edited.
    editedByUser: { type: Boolean, required: true, default: false },

    exportedToReminders: { type: Boolean, required: true, default: false },
    exportedAt: { type: Date },
    externalReminderId: { type: String, trim: true },

    // Stable identity for one extracted item within a document, derived from
    // the extraction rather than the ObjectId. Lets a re-run recognise "this is
    // the same to-do" and update it instead of producing a duplicate list.
    extractionKey: { type: String, required: true, trim: true },

    completedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

// The to-dos tab: a user's open items, newest first.
actionItemSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
// Grouped by document and reading order, which is how BRIEF's To-dos stack
// renders them.
actionItemSchema.index({ documentId: 1, sourcePage: 1 });
// Due-date views and reminder sync.
actionItemSchema.index({ ownerId: 1, dueDate: 1 });
// Re-extraction idempotency: same item, same document, updated not duplicated.
actionItemSchema.index({ documentId: 1, extractionKey: 1 }, { unique: true });

applyApiTransforms(actionItemSchema);

export const ActionItemModel = mongoose.model<ActionItemDocument>(
  "ActionItem",
  actionItemSchema,
);
