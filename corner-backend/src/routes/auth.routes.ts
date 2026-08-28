import { anonymousAuthRequestSchema, upgradeAuthRequestSchema } from "@corner/shared";
import { Router } from "express";

import { issueToken } from "../auth/tokens";
import { asyncHandler } from "../lib/async-handler";
import { sendData, sendNotImplemented } from "../lib/responses";
import { requireAuth } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { UserModel } from "../models";

export const authRouter: Router = Router();

/**
 * Create-or-return an anonymous user for a device.
 *
 * No signup wall (BRIEF "Accounts"). Idempotent on deviceId: a reinstall or a
 * retried request returns the same account rather than orphaning the library
 * behind a new one.
 */
authRouter.post(
  "/anonymous",
  validateBody(anonymousAuthRequestSchema),
  asyncHandler(async (req, res) => {
    const { deviceId, locale } = req.body as { deviceId: string; locale?: string };

    const user = await UserModel.findOneAndUpdate(
      { deviceId },
      { $set: { lastSeenAt: new Date(), ...(locale ? { locale } : {}) }, $setOnInsert: { deviceId } },
      { new: true, upsert: true },
    );

    sendData(res, {
      token: issueToken(String(user.id)),
      user: { id: String(user.id), createdAt: user.createdAt },
    });
  }),
);

authRouter.post(
  "/upgrade",
  requireAuth,
  validateBody(upgradeAuthRequestSchema),
  (_req, res) => {
    // TODO(phase-2-impl): verify the provider token and attach it to the
    // EXISTING user. Must not create a second account — the library lives on
    // the anonymous one.
    sendNotImplemented(res, "Attach email/provider to the existing anonymous user");
  },
);
