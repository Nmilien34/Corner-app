// RevenueCat state resolution and quota enforcement.
//
// Follows Pepta's post-remediation model (CONVENTIONS.md "Entitlement
// authority and premium gating"): the server projection is authoritative, all
// sources are merged rather than last-writer-wins, provider reads are
// evidence-gated because a subscriber GET can create a customer on read, and
// "cannot verify" is a distinct state from "inactive".

import type { EntitlementTier } from "@corner/shared";

export type AccessState = "active" | "inactive" | "temporarily_unavailable";

export interface AccessProjection {
  state: AccessState;
  tier: EntitlementTier;
  expiresAt: Date | null;
  willRenew: boolean;
  source: "promotional" | "app_store" | "mixed" | "none";
  lastVerifiedAt: Date | null;
}

export interface EntitlementsService {
  resolveAccess(userId: string): Promise<AccessProjection>;

  /**
   * Reconciles from the provider. Evidence-gated: only a stored usable
   * customer ID, a linked SDK ID, or other purchase evidence permits the
   * remote lookup. Anonymous placeholder IDs are refused — a v1 subscriber GET
   * CREATES a customer on read, which is how Pepta grew phantom customers.
   */
  reconcile(input: {
    userId: string;
    revenueCatAppUserId?: string;
  }): Promise<AccessProjection>;

  linkAppUserId(input: { userId: string; revenueCatAppUserId: string }): Promise<void>;
}

// TODO(phase-2-impl): implement.
export function createEntitlementsService(): EntitlementsService {
  throw new Error("EntitlementsService not implemented");
}
