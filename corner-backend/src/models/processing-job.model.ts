// The generic background queue.
//
// Mongo-backed rather than Redis/BullMQ, per BRIEF: a Redis instance is a
// fixed monthly cost on Render and an atomic findOneAndUpdate lease does the
// same job at Corner's volume. Neither reference app runs Redis, so there was
// nothing to match. The lease/attempt/backoff shape is lifted from Pepta's
// complimentary-access cleanup queue, which is the one real precedent either
// repo has for durable retryable work.
//
// The claim is a single atomic operation:
//
//   findOneAndUpdate(
//     { status: "pending", nextRunAt: { $lte: now } },
//     { $set: { status: "processing", leaseId, leaseExpiresAt }, $inc: { attempts: 1 } },
//     { sort: { priority: -1, nextRunAt: 1 }, new: true },
//   )
//
// A worker that dies mid-job leaves leaseExpiresAt in the past; the reaper
// returns it to pending. That is why the lease is a timestamp and not a
// boolean — a boolean cannot expire, so a crashed worker would strand the job
// forever.

import type { JobStatus, JobType } from "@corner/shared";
import { JOB_STATUSES, JOB_TYPES } from "@corner/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface ProcessingJobDocument extends Document<Types.ObjectId> {
  type: JobType;
  payload: Record<string, unknown>;
  dedupeKey: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  nextRunAt: Date;
  leaseId?: string;
  leaseExpiresAt?: Date;
  lastError?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const processingJobSchema = new Schema<ProcessingJobDocument>(
  {
    type: { type: String, enum: JOB_TYPES, required: true },

    // Deliberately schemaless. Each handler owns and validates its own payload
    // shape with a Zod schema at the handler boundary; encoding every job's
    // fields here would make the queue a union of unrelated documents.
    payload: { type: Schema.Types.Mixed, required: true, default: {} },

    // Caller-supplied identity for the work, e.g.
    // "parse-document:<contentId>:v1". The unique index on it is the thing
    // that stops a double-tap, a retried request and a resumed upload from
    // each enqueueing the same expensive parse. This is a cost control, not
    // just hygiene.
    dedupeKey: { type: String, required: true, trim: true },

    status: {
      type: String,
      enum: JOB_STATUSES,
      required: true,
      default: "pending",
    },
    // Higher runs first. Interactive work (chat, a narration the user is
    // waiting on) should not queue behind a batch reindex.
    priority: { type: Number, required: true, default: 0 },

    attempts: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 5, min: 1 },
    // Also the backoff mechanism: a retryable failure sets this forward.
    nextRunAt: { type: Date, required: true, default: () => new Date() },

    leaseId: { type: String, trim: true },
    leaseExpiresAt: { type: Date },

    lastError: { type: String, trim: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

// THE poll query. Field order matches the claim's filter and sort.
processingJobSchema.index({ status: 1, nextRunAt: 1, priority: -1 });
// The reaper: jobs whose worker died holding the lease.
processingJobSchema.index({ leaseExpiresAt: 1 });
// Enqueue idempotency. Partial so completed jobs do not block a legitimate
// re-run of the same work later.
processingJobSchema.index(
  { type: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "processing", "retryable_failure"] },
    },
  },
);
// Operator triage of the dead-letter tail.
processingJobSchema.index({ status: 1, updatedAt: -1 });

applyApiTransforms(processingJobSchema);

export const ProcessingJobModel = mongoose.model<ProcessingJobDocument>(
  "ProcessingJob",
  processingJobSchema,
);
