// Quota enforcement, checked BEFORE the handler runs (BRIEF "Cross-cutting").
//
// Quota and entitlement are different questions and are deliberately separate
// middleware. Entitlement asks "may you read this at all"; quota asks "have
// you used up your allowance for producing new work". A cached read costs no
// allowance but still needs entitlement — see require-entitlement.middleware.ts
// and docs/OPEN-QUESTIONS.md OQ-007.

import type { NextFunction, Request, RequestHandler, Response } from "express";

import { dayKey, monthKey } from "../lib/billing-period";
import { QuotaExceededError, UnauthorizedError } from "../lib/errors";
import type { UserDocument } from "../models";

export type QuotaKind = "pages" | "ttsSeconds" | "chatMessages";

/**
 * Allowances per tier.
 *
 * TODO(phase-2-services): move to services/entitlements.ts and source from the
 * entitlement projection rather than a literal, so a promotional grant can
 * carry its own allowance.
 */
const ALLOWANCES: Record<"free" | "pro", Record<QuotaKind, number>> = {
  free: { pages: 50, ttsSeconds: 600, chatMessages: 10 },
  pro: { pages: 5000, ttsSeconds: 360_000, chatMessages: 500 },
};

/**
 * Reads a counter, treating a stale period key as zero.
 *
 * This is what makes the period-key design work: there is no reset job, so
 * there is no window in which a reset has not run yet and a user gets a free
 * month, and no race between a reset writer and a concurrent consume.
 */
export function consumedInCurrentPeriod(
  user: UserDocument,
  kind: QuotaKind,
): number {
  const { quota } = user;

  switch (kind) {
    case "pages":
      return quota.pagesParsedPeriod === monthKey() ? quota.pagesParsed : 0;
    case "ttsSeconds":
      return quota.ttsSecondsPeriod === monthKey() ? quota.ttsSeconds : 0;
    case "chatMessages":
      return quota.chatMessagesDay === dayKey() ? quota.chatMessages : 0;
  }
}

export function allowanceFor(user: UserDocument, kind: QuotaKind): number {
  const paid = ["trialing", "active", "active_canceled"].includes(
    user.entitlement.status,
  );
  return ALLOWANCES[paid ? "pro" : "free"][kind];
}

/**
 * Rejects with a structured 402 the app can turn into a paywall prompt.
 *
 * `estimate` is how much the request is about to consume when that is known up
 * front (a page count, say). It defaults to 1 for countable actions.
 */
export function requireQuota(
  kind: QuotaKind,
  estimate = 1,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = req.currentUser;
      if (!user) {
        next(new UnauthorizedError("Authentication required"));
        return;
      }

      const used = consumedInCurrentPeriod(user, kind);
      const allowance = allowanceFor(user, kind);

      if (used + estimate > allowance) {
        throw new QuotaExceededError("You have used your allowance", {
          kind,
          used,
          allowance,
          // The app renders the paywall off this: what to buy, and when the
          // allowance comes back if they would rather wait.
          resetsAt: kind === "chatMessages" ? "daily" : "monthly",
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
