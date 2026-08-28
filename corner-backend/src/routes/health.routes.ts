import { Router } from "express";

import { isDatabaseReachable } from "../db/connect";
import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";

export const healthRouter: Router = Router();

// Unversioned, per CONVENTIONS.md: Render's health check is infrastructure and
// does not move with the product API.
healthRouter.get(
  "/healthz",
  asyncHandler(async (_req, res) => {
    const database = isDatabaseReachable();
    sendData(res, { status: database ? "ok" : "degraded", database });
  }),
);
