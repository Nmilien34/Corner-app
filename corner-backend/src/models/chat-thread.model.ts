// A user's conversation with one document.
//
// BRIEF lists "ChatMessage / ChatThread" as a single bullet without saying
// whether that is one collection or two. Two, because a thread is read on its
// own (list threads, resume the last one) and messages are append-only and
// unbounded — embedding them would grow one document without limit and rewrite
// the whole array on every reply.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface ChatThreadDocument extends Document<Types.ObjectId> {
  documentId: Types.ObjectId;
  ownerId: Types.ObjectId;
  title: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const chatThreadSchema = new Schema<ChatThreadDocument>(
  {
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: null, trim: true, maxlength: 200 },
    messageCount: { type: Number, required: true, default: 0, min: 0 },
    lastMessageAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

// Resume the conversation for a document.
chatThreadSchema.index({ documentId: 1, ownerId: 1, lastMessageAt: -1 });
chatThreadSchema.index({ ownerId: 1, lastMessageAt: -1 });

applyApiTransforms(chatThreadSchema);

export const ChatThreadModel = mongoose.model<ChatThreadDocument>(
  "ChatThread",
  chatThreadSchema,
);
