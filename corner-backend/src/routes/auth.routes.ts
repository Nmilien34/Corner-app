import {
  anonymousAuthRequestSchema,
  upgradeAuthRequestSchema,
} from "@corner/shared";
import { Router } from "express";

import { requireAuth } from "../middleware/auth.middleware";
import { validateBody } from "../middleware/validate.middleware";
import { sendNotImplemented } from "../lib/responses";

export const authRouter: Router = Router();

authRouter.post("/anonymous", validateBody(anonymousAuthRequestSchema), (_req, res) => {
  // TODO(phase-2-impl): find-or-create a User by deviceId, issue a JWT.
  // BRIEF "Accounts": anonymous device-ID user on first launch, no signup wall.
  sendNotImplemented(res, "Create-or-return anonymous user and issue a token");
});

authRouter.post(
  "/upgrade",
  requireAuth,
  validateBody(upgradeAuthRequestSchema),
  (_req, res) => {
    // TODO(phase-2-impl): verify the provider token, attach the provider to the
    // EXISTING user, do not create a second account.
    sendNotImplemented(res, "Attach email/provider to the existing anonymous user");
  },
);
