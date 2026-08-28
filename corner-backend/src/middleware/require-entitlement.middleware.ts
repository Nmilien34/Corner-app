// THE ACCESS GATE.
//
// The rule this file exists to enforce:
//
//     ENTITLEMENT IS CHECKED ON ACCESS, NEVER ON GENERATION.
//     A CACHE HIT IS STILL A GATED READ.
//
// Corner deduplicates derived artifacts across users by content hash. Audio,
// summaries and extracted action items are all things ONE user paid to
// generate and ANOTHER can reach without paying. If the gate lived on the code
// path that creates work, the bypass would be trivial and would get easier the
// more popular a document is: ask for exactly the {content, version, mode,
// voice, speed} tuple somebody already generated, get a cache hit, and the
// generation path — with its gate — never runs.
//
// So the gate is here, on the read, and it consults the tier recorded on the
// STORED ARTIFACT (e.g. NarrationJob.voiceTier) rather than re-deriving a tier
// from the request. Two different requests that resolve to the same artifact
// must be gated identically, and only the artifact knows what it is.
//
// Deriving "free" from "this request cost nothing to serve" is precisely the
// bug. Absence of cost to Corner is not evidence of entitlement.

import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { EntitlementTier } from "@corner/shared";
import {
  AccessUnavailableError,
  PaymentRequiredError,
  UnauthorizedError,
} from "../lib/errors";
import type { UserDocument } from "../models";

type AccessDecision = "active" | "inactive" | "unavailable";

/**
 * Resolves whether the user currently holds paid access.
 *
 * TODO(phase-2-services): delegate to services/entitlements.ts, which owns the
 * server-authoritative projection across RevenueCat and promotional sources
 * (CONVENTIONS.md "Entitlement authority and premium gating"). The shape below
 * is deliberately the one the real resolver must return — three states, not a
 * boolean — so callers are written against it now.
 */
function resolveAccess(user: UserDocument): AccessDecision {
  const { status, expiresAt, verificationState } = user.entitlement;

  if (verificationState === "unavailable") return "unavailable";

  const paidStatuses = ["trialing", "active", "active_canceled"];
  if (!paidStatuses.includes(status)) return "inactive";
  if (expiresAt && expiresAt.getTime() < Date.now()) return "inactive";

  return "active";
}

/**
 * Gates a read on the tier the artifact requires.
 *
 * `free` short-circuits, so the same middleware can wrap a mixed route and the
 * tier can come from the loaded artifact at request time.
 */
export function assertTierAccess(
  user: UserDocument | undefined,
  requiredTier: EntitlementTier,
): void {
  if (requiredTier === "free") return;

  if (!user) throw new UnauthorizedError("Authentication required");

  const decision = resolveAccess(user);

  // Fail closed on a positive "no" — but NOT on "cannot tell". Downgrading a
  // paying user to a paywall because RevenueCat is unreachable is the failure
  // Pepta's Aug 21 remediation exists to prevent, so this is a retryable 503.
  if (decision === "unavailable") {
    throw new AccessUnavailableError();
  }

  if (decision === "inactive") {
    throw new PaymentRequiredError(
      "This feature requires an active subscription",
      { requiredTier },
    );
  }
}

/**
 * Route-level gate for endpoints whose tier is known statically.
 *
 * Endpoints whose tier depends on the artifact (a narration's voice tier is
 * not known until the job is loaded) must call `assertTierAccess` inside the
 * handler instead, once the artifact is in hand.
 */
export function requireEntitlement(requiredTier: EntitlementTier): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      assertTierAccess(req.currentUser, requiredTier);
      next();
    } catch (error) {
      next(error);
    }
  };
}
