// Records consumption and estimated cost for every AI call.
//
// An untracked provider call is an invisible cost, and the point of UsageEvent
// is that unit economics is a query rather than an inference from a provider
// invoice arriving weeks later.

import type { UsageFeature, UsageUnit } from "@corner/shared";
import { EMBEDDING_MODEL } from "@corner/shared";
import type { Types } from "mongoose";

import { dayKey, monthKey } from "../lib/billing-period";
import { UsageEventModel, UserModel } from "../models";

export interface RecordUsageInput {
  ownerId: string | Types.ObjectId;
  feature: UsageFeature;
  unit: UsageUnit;
  units: number;
  provider: string;
  providerModel?: string;
  contentId?: string | Types.ObjectId;
  documentId?: string | Types.ObjectId;
  jobId?: string | Types.ObjectId;
}

export interface UsageService {
  record(input: RecordUsageInput): Promise<void>;
  consumeQuota(input: {
    ownerId: string | Types.ObjectId;
    kind: "pages" | "ttsSeconds" | "chatMessages";
    amount: number;
  }): Promise<void>;
  estimateCostCents(input: {
    unit: UsageUnit;
    units: number;
    providerModel?: string;
  }): number;
}

/**
 * Rate card, in cents per unit. Versioned as a literal on purpose.
 *
 * A price change should be a reviewable diff, and historical estimates should
 * stay reproducible — reading live pricing would silently rewrite what last
 * quarter appeared to cost.
 *
 * text-embedding-3-small: $0.02 per 1M input tokens = 0.000002 cents/token.
 */
const RATE_CARD: Record<string, Partial<Record<UsageUnit, number>>> = {
  [EMBEDDING_MODEL]: { tokens_in: 0.02 / 1_000_000 * 100 },
};

export function createUsageService(): UsageService {
  return {
    async record(input) {
      const now = new Date();
      await UsageEventModel.create({
        ownerId: input.ownerId,
        feature: input.feature,
        unit: input.unit,
        units: input.units,
        provider: input.provider,
        providerModel: input.providerModel,
        contentId: input.contentId,
        documentId: input.documentId,
        jobId: input.jobId,
        estimatedCostCents: this.estimateCostCents({
          unit: input.unit,
          units: input.units,
          providerModel: input.providerModel,
        }),
        billingPeriod: monthKey(now),
        billingDay: dayKey(now),
        occurredAt: now,
      });
    },

    /**
     * Deliberately separate from record().
     *
     * Usage accounting tracks what Corner SPENT; quota tracks what the USER
     * consumed of their allowance. A cache hit spends nothing, and whether it
     * should still consume quota is unresolved (OQ-007) — keeping the calls
     * apart is what leaves that open rather than settling it by coupling.
     *
     * The period key is written alongside the counter so a stale period resets
     * to the new amount instead of accumulating across months.
     */
    async consumeQuota({ ownerId, kind, amount }) {
      const now = new Date();
      const field = {
        pages: { counter: "quota.pagesParsed", period: "quota.pagesParsedPeriod", key: monthKey(now) },
        ttsSeconds: { counter: "quota.ttsSeconds", period: "quota.ttsSecondsPeriod", key: monthKey(now) },
        chatMessages: { counter: "quota.chatMessages", period: "quota.chatMessagesDay", key: dayKey(now) },
      }[kind];

      const advanced = await UserModel.updateOne(
        { _id: ownerId, [field.period]: { $ne: field.key } },
        { $set: { [field.period]: field.key, [field.counter]: amount } },
      );

      // Only increment when the period was already current. Doing both
      // unconditionally would double-count the first consumption of a period.
      if (advanced.modifiedCount === 0) {
        await UserModel.updateOne(
          { _id: ownerId, [field.period]: field.key },
          { $inc: { [field.counter]: amount } },
        );
      }
    },

    estimateCostCents({ unit, units, providerModel }) {
      const rate = providerModel ? RATE_CARD[providerModel]?.[unit] : undefined;
      if (rate === undefined) return 0;
      // Sub-cent costs are real and must not floor to zero, or a million cheap
      // calls would aggregate to nothing. Stored with 6 decimal places.
      return Math.round(units * rate * 1_000_000) / 1_000_000;
    },
  };
}
