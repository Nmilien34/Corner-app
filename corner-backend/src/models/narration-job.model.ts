// A request to turn one parse generation into audio.
//
// Keyed on content, not on the user's Document, so two users who uploaded the
// same file share the generated audio instead of paying TTS twice — the same
// dedupe reasoning as document-content.model.ts. requestedBy records who paid
// for it; it is provenance, not ownership.
//
// ENTITLEMENT IS CHECKED ON ACCESS, NEVER ON GENERATION.
//
// Because this collection is content-scoped and deduped, a free user can
// request exactly the {content, version, mode, voice, speed} tuple a paying
// user already generated and get a cache hit. A gate that runs only on the
// path that CREATES a job is therefore bypassable by asking for something that
// already exists — and the more popular the file, the more likely that works.
//
// `voiceTier` records what the artifact requires, so the gate is a property of
// the stored artifact rather than something re-derived from the request. Every
// read path — status, manifest, segment URLs — gates on it. See
// middleware/require-entitlement.middleware.ts.

import type {
  EntitlementTier,
  NarrationMode,
  NarrationStatus,
} from "@corner/shared";
import {
  ENTITLEMENT_TIERS,
  NARRATION_MODES,
  NARRATION_STATUSES,
} from "@corner/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface NarrationJobDocument extends Document<Types.ObjectId> {
  contentId: Types.ObjectId;
  parseVersion: number;
  requestedBy: Types.ObjectId;
  mode: NarrationMode;
  voiceId: string;
  voiceTier: EntitlementTier;
  speed: number;
  status: NarrationStatus;
  progressPercent: number;
  segmentCount: number | null;
  totalDurationSeconds: number | null;
  errorMessage?: string;
  scriptStorageKey?: string;
  ttsSecondsConsumed: number;
  tokensConsumed: number;
  estimatedCostCents: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const narrationJobSchema = new Schema<NarrationJobDocument>(
  {
    contentId: {
      type: Schema.Types.ObjectId,
      ref: "DocumentContent",
      required: true,
    },
    parseVersion: { type: Number, required: true, min: 1 },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    mode: { type: String, enum: NARRATION_MODES, required: true },
    voiceId: { type: String, required: true, trim: true },
    // Captured at generation, enforced on every read. A premium-voice
    // narration stays premium no matter who later asks for it.
    voiceTier: {
      type: String,
      enum: ENTITLEMENT_TIERS,
      required: true,
      default: "free",
    },
    speed: { type: Number, required: true, default: 1, min: 0.5, max: 3 },

    status: {
      type: String,
      enum: NARRATION_STATUSES,
      required: true,
      default: "queued",
    },
    progressPercent: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    segmentCount: { type: Number, default: null, min: 0 },
    totalDurationSeconds: { type: Number, default: null, min: 0 },
    errorMessage: { type: String, trim: true },

    // Podcast mode generates a script before synthesis. Kept in object storage
    // rather than inline: it is large, it is regenerable, and it does not
    // belong in a document that status polling reads every few seconds.
    scriptStorageKey: { type: String, trim: true },

    // Rolled-up cost for this job. The authoritative per-call rows are in
    // UsageEvent; these are the denormalized totals so the job list does not
    // have to aggregate to show what a narration cost.
    ttsSecondsConsumed: { type: Number, required: true, default: 0, min: 0 },
    tokensConsumed: { type: Number, required: true, default: 0, min: 0 },
    estimatedCostCents: { type: Number, required: true, default: 0, min: 0 },

    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

// The dedupe lookup: an identical narration request should find the existing
// job rather than start a second one. Unique because paying twice for the same
// audio is the exact failure the content split exists to prevent.
narrationJobSchema.index(
  { contentId: 1, parseVersion: 1, mode: 1, voiceId: 1, speed: 1 },
  { unique: true },
);
// "My narrations", newest first.
narrationJobSchema.index({ requestedBy: 1, createdAt: -1 });
// Operator view of in-flight and failed work.
narrationJobSchema.index({ status: 1, updatedAt: -1 });

applyApiTransforms(narrationJobSchema);

export const NarrationJobModel = mongoose.model<NarrationJobDocument>(
  "NarrationJob",
  narrationJobSchema,
);
