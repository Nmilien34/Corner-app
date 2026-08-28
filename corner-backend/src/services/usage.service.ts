// Records consumption and estimated cost for every AI call.
//
// Every provider call writes one UsageEvent. An untracked call is an invisible
// cost, and the whole point of the collection is that unit economics is a
// query rather than an inference from a provider invoice.

import type { UsageFeature, UsageUnit } from "@corner/shared";

export interface RecordUsageInput {
  ownerId: string;
  feature: UsageFeature;
  unit: UsageUnit;
  units: number;
  provider: string;
  providerModel?: string;
  contentId?: string;
  documentId?: string;
  jobId?: string;
}

export interface UsageService {
  /** Writes the event and stamps the UTC period keys. */
  record(input: RecordUsageInput): Promise<void>;

  /**
   * Increments the user's quota counter for the period.
   *
   * Deliberately separate from `record`. Usage accounting tracks what Corner
   * SPENT; quota tracks what the USER consumed of their allowance. A cached
   * read spends nothing, and whether it should still consume quota is
   * unresolved — see docs/OPEN-QUESTIONS.md OQ-007. Keeping the two calls
   * apart is what leaves that decision open instead of accidentally settling
   * it by coupling them.
   */
  consumeQuota(input: {
    ownerId: string;
    kind: "pages" | "ttsSeconds" | "chatMessages";
    amount: number;
  }): Promise<void>;

  estimateCostCents(input: {
    feature: UsageFeature;
    unit: UsageUnit;
    units: number;
    provider: string;
    providerModel?: string;
  }): number;
}

// TODO(phase-2-impl): implement, with the rate card as a versioned constant so
// a price change is reviewable and historical estimates stay reproducible.
export function createUsageService(): UsageService {
  throw new Error("UsageService not implemented");
}
