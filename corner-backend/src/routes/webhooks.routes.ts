import { Router } from "express";

import { sendNotImplemented } from "../lib/responses";

export const webhooksRouter: Router = Router();

// No requireAuth: the caller is RevenueCat, not a user. Verification is a
// timing-safe shared-secret comparison inside the handler.
webhooksRouter.post("/revenuecat", (_req, res) => {
  // TODO(phase-2-impl): port Pepta's pattern in full —
  //   - accept a bearer token OR x-revenuecat-webhook-secret, compare with
  //     timingSafeEqual
  //   - FAIL CLOSED: 503 when no secret is configured, 403 on a mismatch.
  //     Leanient skips verification when unset; do not copy that.
  //   - validate with a Zod schema that tolerates provider-nullable ids
  //   - only a whitelist of event types may mutate entitlement state; unknown
  //     types are acknowledged and receipted as no-ops, never defaulted to free
  //   - write the receipt LAST, after entitlement work completes, so a retry
  //     can still apply a partially-processed event
  //   - exclude transferred_from ids from the winner's stored identifiers
  sendNotImplemented(res, "Verify and process a RevenueCat webhook (fail closed)");
});
