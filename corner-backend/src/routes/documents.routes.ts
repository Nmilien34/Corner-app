import {
  documentTextQuerySchema,
  idParamSchema,
  listDocumentsQuerySchema,
  registerDocumentRequestSchema,
  updateDocumentRequestSchema,
  uploadUrlRequestSchema,
} from "@corner/shared";
import { Router } from "express";

import { loadUser, requireAuth } from "../middleware/auth.middleware";
import { requireQuota } from "../middleware/quota.middleware";
import { aiRateLimit } from "../middleware/rate-limit.middleware";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.middleware";
import { sendNotImplemented } from "../lib/responses";

export const documentsRouter: Router = Router();

documentsRouter.use(requireAuth, loadUser);

documentsRouter.post(
  "/upload-url",
  validateBody(uploadUrlRequestSchema),
  (_req, res) => {
    // TODO(phase-2-impl): issue a presigned upload target.
    //
    // PRIVACY-CRITICAL: this response must be IDENTICAL whether or not the
    // contentHash is already known to the system. Always 200, always a usable
    // upload URL, no `cached`/`exists` field, no alternate status path. A
    // response that varied would let a client probe for the existence of a
    // specific contract, filing or medical record by hashing a candidate.
    // Dedupe happens server-side at registration, invisibly.
    // See uploadUrlResponseSchema in @corner/shared.
    sendNotImplemented(res, "Issue a presigned upload target (existence must not be observable)");
  },
);

documentsRouter.post(
  "/",
  validateBody(registerDocumentRequestSchema),
  requireQuota("pages"),
  (_req, res) => {
    // TODO(phase-2-impl): verify the uploaded bytes hash to the claimed
    // contentHash (never trust the client's), find-or-create DocumentContent,
    // create the per-user Document, and enqueue parse-document ONLY when this
    // content has not already been parsed.
    sendNotImplemented(res, "Register the uploaded document and enqueue parsing");
  },
);

documentsRouter.get("/", validateQuery(listDocumentsQuerySchema), (_req, res) => {
  // TODO(phase-2-impl): cursor-paginated list over {ownerId, updatedAt}.
  sendNotImplemented(res, "List the caller's documents with filter and sort");
});

documentsRouter.get("/:id", validateParams(idParamSchema), (_req, res) => {
  // TODO(phase-2-impl): join Document to DocumentContent for outline + status.
  sendNotImplemented(res, "Return document metadata, outline and parse status");
});

documentsRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateDocumentRequestSchema),
  (_req, res) => {
    // TODO(phase-2-impl): update only Document fields. Never mutate shared
    // DocumentContent from here — another user points at it.
    sendNotImplemented(res, "Rename, tag, favourite, or record reading progress");
  },
);

documentsRouter.delete("/:id", validateParams(idParamSchema), (_req, res) => {
  // TODO(phase-2-impl): HARD delete this user's Document, annotations, action
  // items and chat. Do NOT delete DocumentContent or its derived artifacts
  // inline — the orphan sweep reclaims content once nothing points at it and
  // the grace period has passed. See PRIVACY.md.
  sendNotImplemented(res, "Hard delete the library entry and this user's derived data");
});

documentsRouter.get(
  "/:id/text",
  validateParams(idParamSchema),
  validateQuery(documentTextQuerySchema),
  (_req, res) => {
    // TODO(phase-2-impl): return extracted page text for the range. This is the
    // user's own uploaded content, so it is not entitlement-gated; chunk text
    // is a derived artifact and is never served from here.
    sendNotImplemented(res, "Return extracted text for a page range");
  },
);

documentsRouter.post(
  "/:id/reparse",
  validateParams(idParamSchema),
  aiRateLimit,
  requireQuota("pages"),
  (_req, res) => {
    // TODO(phase-2-impl): bump DocumentContent.parseVersion and enqueue a parse
    // for the NEW generation. The old generation stays readable until the swap,
    // so an in-flight reader's anchors do not break mid-read.
    sendNotImplemented(res, "Force a reparse into a new parse generation");
  },
);
