import { Router } from "express";

import { loadUser, requireAuth } from "../middleware/auth.middleware";
import { sendNotImplemented } from "../lib/responses";

export const meRouter: Router = Router();

meRouter.get("/", requireAuth, loadUser, (_req, res) => {
  // TODO(phase-2-impl): return profile, the entitlement projection from
  // entitlements.service, and current quota state with allowances.
  sendNotImplemented(res, "Return profile, entitlements and quota state");
});

meRouter.post("/access/link", requireAuth, loadUser, (_req, res) => {
  // TODO(phase-2-impl): store the RevenueCat SDK app-user id so a webhook that
  // arrived under a device/alias id can be recovered. Pepta precedent.
  sendNotImplemented(res, "Link the RevenueCat SDK app user id to this account");
});
