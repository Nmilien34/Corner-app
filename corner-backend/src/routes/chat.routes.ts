import {
  chatHistoryQuerySchema,
  chatRequestSchema,
  idParamSchema,
  summaryRequestSchema,
} from "@corner/shared";
import { Router } from "express";

import { asyncHandler } from "../lib/async-handler";
import { sendData } from "../lib/responses";
import { ChatMessageModel, ChatThreadModel } from "../models";
import { createChatService } from "../services/chat.service";
import { createDocumentsService } from "../services/documents.service";

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
  asyncHandler(async (req, res) => {
    const ownerId = String(req.currentUser!.id);

    // Ownership is enforced HERE, before anything is retrieved. getOwned
    // returns not-found rather than forbidden for another user's document —
    // a 403 would confirm the id exists, which is itself a disclosure — and it
    // is what stops a user retrieving chunks from a document they do not own.
    const { document, content } = await createDocumentsService().getOwned(
      ownerId,
      req.params.id as string,
    );

    const { message, threadId } = req.body as { message: string; threadId?: string };

    const answer = await createChatService().ask({
      ownerId,
      documentId: String(document._id),
      contentId: String(content._id),
      parseVersion: content.parseVersion,
      question: message,
      threadId,
    });

    sendData(res, answer);
  }),
);

documentChatRouter.get(
  "/chat",
  validateParams(idParamSchema),
  validateQuery(chatHistoryQuerySchema),
  asyncHandler(async (req, res) => {
    const ownerId = String(req.currentUser!.id);
    const { document } = await createDocumentsService().getOwned(ownerId, req.params.id as string);
    const { threadId, limit } = req.query as unknown as { threadId?: string; limit: number };

    const threads = await ChatThreadModel.find({ documentId: document._id, ownerId })
      .sort({ lastMessageAt: -1 })
      .lean();

    const target = threadId ?? (threads[0] ? String(threads[0]._id) : null);
    const messages = target
      ? await ChatMessageModel.find({ threadId: target, ownerId })
          .sort({ createdAt: 1 })
          .limit(limit)
          .lean()
      : [];

    // Not entitlement-gated: a lapsed subscriber keeps read access to
    // conversations they already had.
    sendData(res, {
      threads: threads.map((t) => ({
        id: String(t._id), title: t.title, messageCount: t.messageCount,
        lastMessageAt: t.lastMessageAt,
      })),
      threadId: target,
      messages: messages.map((m) => ({
        id: String(m._id), role: m.role, content: m.content,
        citations: m.citations, createdAt: m.createdAt,
      })),
    });
  }),
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
