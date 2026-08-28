// Anonymous-first identity. A user exists from first launch with nothing but a
// device ID; email and a provider can be attached later without changing the
// record (BRIEF "Accounts": no signup wall).

import type { AuthProvider, SubscriptionStatus } from "@corner/shared";
import { AUTH_PROVIDERS, SUBSCRIPTION_STATUSES } from "@corner/shared";
import mongoose, { Schema } from "mongoose";
import type { Document, Types } from "mongoose";
import { dayKey, monthKey } from "../lib/billing-period";
import { applyApiTransforms, applySoftDeleteQueryMiddleware } from "./model-utils";

export interface LinkedAuthProviderDocument {
  provider: AuthProvider;
  providerUserId: string;
  linkedAt: Date;
}

export interface UserEntitlementDocument {
  status: SubscriptionStatus;
  expiresAt: Date | null;
  willRenew: boolean;
  revenueCatCustomerId?: string;
  revenueCatAppUserIds: string[];
  lastVerifiedAt: Date | null;
  verificationState?: "verified" | "stale" | "unavailable";
}

/**
 * Quota counters.
 *
 * BRIEF says "quota counters with a reset date", but the three allowances it
 * specifies do not share a period: pages and TTS are monthly, chat is daily.
 * A single reset date cannot express that.
 *
 * So each counter stores the PERIOD KEY it was last written in ("2026-08",
 * "2026-08-28") rather than a date it expires. Reading is: if the stored key
 * is not the current key, the counter is stale and reads as zero. That makes
 * the reset implicit — no cron job to run, no window where a job has not fired
 * yet and a user gets a free month, and no race between the reset writer and a
 * concurrent consume. Marked [NEW — proposed]; see docs/OPEN-QUESTIONS.md.
 */
export interface UserQuotaDocument {
  pagesParsedPeriod: string;
  pagesParsed: number;
  ttsSecondsPeriod: string;
  ttsSeconds: number;
  chatMessagesDay: string;
  chatMessages: number;
}

export interface UserDocument extends Document<Types.ObjectId> {
  deviceId: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
  authProviders: LinkedAuthProviderDocument[];
  entitlement: UserEntitlementDocument;
  quota: UserQuotaDocument;
  locale?: string;
  lastSeenAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const linkedAuthProviderSchema = new Schema<LinkedAuthProviderDocument>(
  {
    provider: { type: String, enum: AUTH_PROVIDERS, required: true },
    providerUserId: { type: String, required: true, trim: true },
    linkedAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const entitlementSchema = new Schema<UserEntitlementDocument>(
  {
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      required: true,
      default: "free",
      index: true,
    },
    expiresAt: { type: Date, default: null },
    willRenew: { type: Boolean, required: true, default: false },
    revenueCatCustomerId: { type: String, trim: true, index: true, sparse: true },
    revenueCatAppUserIds: { type: [String], default: [], index: true },
    lastVerifiedAt: { type: Date, default: null },
    verificationState: {
      type: String,
      enum: ["verified", "stale", "unavailable"],
    },
  },
  { _id: false },
);

// The period keys default to the CURRENT period, not to an empty string.
//
// Two reasons, one of them load-bearing. Semantically, a new user genuinely
// has "0 consumed in this period", which is what the pair now says. And
// mechanically, Mongoose treats an empty string as failing `required: true` —
// `required` tests truthiness, not presence — so `required: true` with
// `default: ""` makes the subdocument unconstructable and User.create() throws
// on every anonymous signup.
const quotaSchema = new Schema<UserQuotaDocument>(
  {
    pagesParsedPeriod: {
      type: String,
      required: true,
      default: () => monthKey(),
      trim: true,
    },
    pagesParsed: { type: Number, required: true, default: 0, min: 0 },
    ttsSecondsPeriod: {
      type: String,
      required: true,
      default: () => monthKey(),
      trim: true,
    },
    ttsSeconds: { type: Number, required: true, default: 0, min: 0 },
    chatMessagesDay: {
      type: String,
      required: true,
      default: () => dayKey(),
      trim: true,
    },
    chatMessages: { type: Number, required: true, default: 0, min: 0 },
  },
  { _id: false },
);

const userSchema = new Schema<UserDocument>(
  {
    // Primary identity from first launch. Opaque, client-generated, stored in
    // secure storage on the device (CONVENTIONS.md departs from both reference
    // apps here: Corner holds contracts and medical records).
    deviceId: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    emailVerified: { type: Boolean, required: true, default: false },
    displayName: { type: String, trim: true },
    authProviders: { type: [linkedAuthProviderSchema], default: [] },
    entitlement: {
      type: entitlementSchema,
      required: true,
      default: () => ({}),
    },
    quota: { type: quotaSchema, required: true, default: () => ({}) },
    locale: { type: String, trim: true },
    lastSeenAt: { type: Date, required: true, default: () => new Date() },
    // User records soft-delete so an accidental deletion is recoverable and
    // so entitlement history survives. Their DOCUMENTS hard-delete — see
    // model-utils.applySoftDeleteQueryMiddleware.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, versionKey: false },
);

userSchema.index({ deviceId: 1 }, { unique: true });
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: "string" },
      emailVerified: true,
    },
  },
);
userSchema.index(
  {
    "authProviders.provider": 1,
    "authProviders.providerUserId": 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "authProviders.provider": { $exists: true },
      "authProviders.providerUserId": { $exists: true },
    },
  },
);

applySoftDeleteQueryMiddleware(userSchema);
applyApiTransforms(userSchema);

export const UserModel = mongoose.model<UserDocument>("User", userSchema);
