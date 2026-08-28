// One synthesized chunk of audio, plus the timing data that drives
// follow-along highlighting.
//
// Segments are written one at a time as TTS completes, so a failed job resumes
// instead of re-synthesizing what it already paid for.

import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

/**
 * One text span aligned to an audio offset.
 *
 * This is what makes "highlight the sentence being read" work. The span is
 * expressed in the SAME document-wide character coordinates as
 * DocumentChunk.anchor, so a player position resolves to a text range and then
 * to a page through DocumentContent.pageOffsets — one coordinate system for
 * narration, citations and action items rather than three.
 *
 * Populated only for verbatim mode. Podcast mode is a generated script that
 * does not correspond to document text, so its segments carry no cues and the
 * reader does not follow along. Structure is defined now per BRIEF; the
 * synthesis that fills it is Phase 2 service work.
 */
export interface TimingCueDocument {
  /** Seconds from the start of THIS segment's audio file. */
  startSeconds: number;
  endSeconds: number;
  /** Half-open [charStart, charEnd) into the normalized full text. */
  charStart: number;
  charEnd: number;
}

export interface AudioSegmentDocument extends Document<Types.ObjectId> {
  narrationId: Types.ObjectId;
  ordinal: number;
  chapterTitle: string | null;
  outlineNodeId: string | null;
  storageKey: string;
  durationSeconds: number;
  /** Offset of this segment within the full narration, for a global scrubber. */
  startOffsetSeconds: number;
  timingMap: TimingCueDocument[];
  byteSize: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const timingCueSchema = new Schema<TimingCueDocument>(
  {
    startSeconds: { type: Number, required: true, min: 0 },
    endSeconds: { type: Number, required: true, min: 0 },
    charStart: { type: Number, required: true, min: 0 },
    charEnd: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const audioSegmentSchema = new Schema<AudioSegmentDocument>(
  {
    narrationId: {
      type: Schema.Types.ObjectId,
      ref: "NarrationJob",
      required: true,
    },
    ordinal: { type: Number, required: true, min: 0 },
    chapterTitle: { type: String, default: null, trim: true },
    // Joins to DocumentContent.outline[].id so player chapters and reader
    // chapters are the same thing, not two string-matched lists.
    outlineNodeId: { type: String, default: null, trim: true },

    storageKey: { type: String, required: true, trim: true },
    durationSeconds: { type: Number, required: true, min: 0 },
    startOffsetSeconds: { type: Number, required: true, default: 0, min: 0 },

    // Can be long for a full chapter. Deselected from ordinary reads: the
    // manifest needs durations and keys, and only the active segment needs
    // cues, so loading every cue to render a chapter list is pure waste.
    timingMap: { type: [timingCueSchema], default: [], select: false },

    byteSize: { type: Number, default: null, min: 0 },
  },
  { timestamps: true, versionKey: false },
);

// Manifest read, and the uniqueness that makes a retried synthesis idempotent.
audioSegmentSchema.index({ narrationId: 1, ordinal: 1 }, { unique: true });

// timingMap is deselected AND omitted from the API shape, for the same reason
// DocumentChunk.embedding is: deselection stops it loading, the omit list stops
// it serializing when something loads it deliberately. The manifest endpoint
// returns cues explicitly rather than getting them by accident.
applyApiTransforms(audioSegmentSchema, ["timingMap"]);

export const AudioSegmentModel = mongoose.model<AudioSegmentDocument>(
  "AudioSegment",
  audioSegmentSchema,
);
