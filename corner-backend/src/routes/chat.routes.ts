import {
  chatHistoryQuerySchema,
  chatRequestSchema,
  idParamSchema,
  summaryRequestSchema,
} from "@corner/shared";
import { Router } from "express";

import { requireEntitlement } from "../middleware/require-entitlement.middleware";
import { requireQuota } from "../middleware/quota.middleware";
import { aiRateLimit } from "../middleware/rate-limit.middleware";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../middleware/validate.middleware";
import { sendNotImplemented } from "../lib/responses";

// Mounted under /documents/:id in app.ts.
export const documentChatRouter: Router = Router({ mergeParams: true });

documentChatRouter.post(
  "/chat",
  validateParams(idParamSchema),
  validateBody(chatRequestSchema),
  aiRateLimit,
  requireEntitlement("pro"),
  requireQuota("chatMessages"),
  (_req, res) => {
    // TODO(phase-2-impl): retrieve via retrieval.service (contentId AND
    // parseVersion filters are mandatory), answer with citations, persist the
    // turn. Design for streaming.
    sendNotImplemented(res, "Answer a question about the document with page citations");
  },
);

documentChatRouter.get(
  "/chat",
  validateParams(idParamSchema),
  validateQuery(chatHistoryQuerySchema),
  (_req, res) => {
    // TODO(phase-2-impl): return this user's own thread history. Not gated: a
    // lapsed subscriber keeps read access to conversations they already had.
    sendNotImplemented(res, "Return this user's chat history for the document");
  },
);

documentChatRouter.post(
  "/summary",
  validateParams(idParamSchema),
  validateBody(summaryRequestSchema),
  aiRateLimit,
  // Gated on ACCESS, not generation. DocumentSummary is content-scoped, so the
  // second requester gets a cache hit at zero cost and must be refused here
  // exactly as the first would have been.
  requireEntitlement("pro"),
  (_req, res) => {
    // TODO(phase-2-impl): return a cached DocumentSummary for this
    // {content, parseVersion, scope, outlineNodeId} or enqueue generate-summary.
    sendNotImplemented(res, "Return or generate a document/chapter summary");
  },
);
