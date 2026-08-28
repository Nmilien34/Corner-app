// One turn in a document conversation, with the citations that justify it.

import type { ChatRole } from "@corner/shared";
import { CHAT_ROLES } from "@corner/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

/**
 * A tappable citation.
 *
 * Carries the chunk reference AND a denormalized page plus span. The chunk ref
 * alone would mean a join on every message render, and would break outright
 * once a reparse retires that generation — a citation in last week's thread
 * must still open to a page even if the chunk it came from no longer exists.
 */
export interface ChatCitationDocument {
  chunkId: Types.ObjectId | null;
  page: number;
  charStart: number;
  charEnd: number;
  snippet: string;
}

export interface ChatMessageDocument extends Document<Types.ObjectId> {
  threadId: Types.ObjectId;
  documentId: Types.ObjectId;
  ownerId: Types.ObjectId;
  role: ChatRole;
  content: string;
  citations: ChatCitationDocument[];
  parseVersion: number | null;
  tokensIn: number;
  tokensOut: number;
  createdAt: Date;
  updatedAt: Date;
}

const chatCitationSchema = new Schema<ChatCitationDocument>(
  {
    chunkId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentChunk",
      default: null,
    },
    page: { type: Number, required: true, min: 1 },
    charStart: { type: Number, required: true, min: 0 },
    charEnd: { type: Number, required: true, min: 0 },
    snippet: { type: String, required: true, maxlength: 1000 },
  },
  { _id: false },
);

const chatMessageSchema = new Schema<ChatMessageDocument>(
  {
    threadId: {
      type: Schema.Types.ObjectId,
      ref: "ChatThread",
      required: true,
    },
    // Denormalized from the thread so document-scoped reads and the hard
    // delete do not have to resolve threads first.
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "Document",
      required: true,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    role: { type: String, enum: CHAT_ROLES, required: true },
    content: { type: String, required: true },
    citations: { type: [chatCitationSchema], default: [] },

    // Which parse generation answered. An answer cited against a retired
    // generation is still readable, but must not be silently re-anchored.
    parseVersion: { type: Number, default: null, min: 1 },

    tokensIn: { type: Number, required: true, default: 0, min: 0 },
    tokensOut: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

// Thread history in order — the only read path that matters.
chatMessageSchema.index({ threadId: 1, createdAt: 1 });
// Hard delete of a document takes its messages with it.
chatMessageSchema.index({ documentId: 1 });
// Daily chat quota is counted from here.
chatMessageSchema.index({ ownerId: 1, createdAt: -1 });

applyApiTransforms(chatMessageSchema);

export const ChatMessageModel = mongoose.model<ChatMessageDocument>(
  "ChatMessage",
  chatMessageSchema,
);
