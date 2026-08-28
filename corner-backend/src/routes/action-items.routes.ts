import { idParamSchema, updateActionItemRequestSchema } from "@corner/shared";
import { Router } from "express";

import { loadUser, requireAuth } from "../middleware/auth.middleware";
import { requireEntitlement } from "../middleware/require-entitlement.middleware";
import { aiRateLimit } from "../middleware/rate-limit.middleware";
import { validateBody, validateParams } from "../middleware/validate.middleware";
import { sendNotImplemented } from "../lib/responses";

// Mounted under /documents/:id in app.ts.
export const documentActionItemsRouter: Router = Router({ mergeParams: true });

documentActionItemsRouter.post(
  "/action-items/extract",
  validateParams(idParamSchema),
  aiRateLimit,
  // Statically gated: extraction is a paid feature at any tier of input.
  //
  // The gate has to be HERE and not inside the extractor, because the
  // extraction is content-level and cached — a second user asking for action
  // items on an already-processed file triggers a fan-out that costs no LLM
  // call. Gating the LLM call would wave them straight through.
  requireEntitlement("pro"),
  (_req, res) => {
    // TODO(phase-2-impl): reuse a cached content-level extraction when present,
    // otherwise enqueue extract-action-items; then fan out per-user rows.
    sendNotImplemented(res, "Extract or fan out action items for this document");
  },
);

documentActionItemsRouter.get(
  "/action-items",
  validateParams(idParamSchema),
  (_req, res) => {
    // TODO(phase-2-impl): list this user's own ActionItem rows. Not gated:
    // once fanned out these are the user's own editable records, and a lapsed
    // subscriber must not lose read access to their own to-dos.
    sendNotImplemented(res, "List this user's action items for the document");
  },
);

export const actionItemsRouter: Router = Router();

actionItemsRouter.use(requireAuth, loadUser);

actionItemsRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateActionItemRequestSchema),
  (_req, res) => {
    // TODO(phase-2-impl): update and set editedByUser so a later re-extraction
    // cannot clobber what the user changed.
    sendNotImplemented(res, "Update an action item and mark it user-edited");
  },
);

actionItemsRouter.delete("/:id", validateParams(idParamSchema), (_req, res) => {
  // TODO(phase-2-impl): delete this user's row only.
  sendNotImplemented(res, "Delete one of this user's action items");
});
