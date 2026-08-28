// One row per billable provider call. This is the collection that answers
// "what does a user actually cost me", which BRIEF wants readable without
// reverse-engineering a provider invoice.
//
// Append-only and never TTL'd. Same reasoning as Pepta's payment receipts: a
// record you aggregate margin from cannot quietly expire, or last quarter's
// unit economics silently changes shape.

import type { UsageFeature, UsageUnit } from "@corner/shared";
import { USAGE_FEATURES, USAGE_UNITS } from "@corner/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { applyApiTransforms } from "./model-utils";

export interface UsageEventDocument extends Document<Types.ObjectId> {
  ownerId: Types.ObjectId;
  feature: UsageFeature;
  unit: UsageUnit;
  units: number;
  provider: string;
  providerModel?: string;
  estimatedCostCents: number;
  contentId?: Types.ObjectId;
  documentId?: Types.ObjectId;
  jobId?: Types.ObjectId;
  billingPeriod: string;
  billingDay: string;
  occurredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const usageEventSchema = new Schema<UsageEventDocument>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    feature: { type: String, enum: USAGE_FEATURES, required: true },
    // Explicit unit so a rollup can never add pages to tokens. A single
    // `units` number with an implied meaning is how that mistake happens.
    unit: { type: String, enum: USAGE_UNITS, required: true },
    units: { type: Number, required: true, min: 0 },

    provider: { type: String, required: true, trim: true },
    // NOT `model`: Mongoose's Document interface already defines a `model()`
    // method, so a field of that name fails to compile against Document<T>.
    providerModel: { type: String, trim: true },

    // Integer cents, never floats. Estimated at write time from the rate card
    // in effect, because the provider's own number arrives weeks later on an
    // invoice that cannot be attributed back to a user.
    estimatedCostCents: { type: Number, required: true, min: 0 },

    // Attribution. contentId is the deduped file, so cost-per-file across all
    // users is answerable; documentId is the library entry that triggered it.
    contentId: { type: Schema.Types.ObjectId, ref: "DocumentContent" },
    documentId: { type: Schema.Types.ObjectId, ref: "Document" },
    jobId: { type: Schema.Types.ObjectId, ref: "ProcessingJob" },

    // Precomputed period keys, UTC. "2026-08" and "2026-08-28".
    //
    // Stored rather than derived so monthly and daily aggregation is an index
    // scan on a string prefix instead of a $expr over a date on every read.
    // This is the difference between the cost dashboard being a query and
    // being a batch job.
    billingPeriod: { type: String, required: true, trim: true },
    billingDay: { type: String, required: true, trim: true },

    occurredAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, versionKey: false },
);

// "What did this user cost me this month, by feature" — the primary question.
usageEventSchema.index({ ownerId: 1, billingPeriod: 1, feature: 1 });
// A user's raw usage timeline, newest first.
usageEventSchema.index({ ownerId: 1, occurredAt: -1 });
// Fleet-wide cost rollups by month and by feature, across all users.
usageEventSchema.index({ billingPeriod: 1, feature: 1 });
// Cost attributed to one deduped file, across every user who uploaded it —
// how you find out a popular textbook is eating the margin.
usageEventSchema.index({ contentId: 1, occurredAt: -1 });

applyApiTransforms(usageEventSchema);

export const UsageEventModel = mongoose.model<UsageEventDocument>(
  "UsageEvent",
  usageEventSchema,
);
