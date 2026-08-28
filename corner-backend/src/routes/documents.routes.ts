import {
  documentTextQuerySchema,
  idParamSchema,
  listDocumentsQuerySchema,
  registerDocumentRequestSchema,
  splitRangeByPage,
  updateDocumentRequestSchema,
  uploadUrlRequestSchema,
} from "@corner/shared";
import { Router } from "express";

import { asyncHandler } from "../lib/async-handler";
import { NotFoundError } from "../lib/errors";
import { sendData, sendNoContent } from "../lib/responses";
import { loadUser, requireAuth } from "../middleware/auth.middleware";
import { requireQuota } from "../middleware/quota.middleware";
import { aiRateLimit } from "../middleware/rate-limit.middleware";
import { validateBody, validateParams, validateQuery } from "../middleware/validate.middleware";
import { DocumentChunkModel } from "../models";
import { createDocumentsService } from "../services/documents.service";

export const documentsRouter: Router = Router();

documentsRouter.use(requireAuth, loadUser);

/**
 * Shapes a Document plus its DocumentContent into one API object.
 *
 * Structural types rather than the Mongoose document types, so the same
 * function serves hydrated documents, `.lean()` results and populated refs
 * without three overloads or a cast at every call site.
 */
interface PresentableDocument {
  _id?: unknown;
  id?: unknown;
  filename: string;
  tags?: string[];
  favorite?: boolean;
  readingProgress?: unknown;
  lastOpenedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PresentableContent {
  parseStatus: string;
  parseVersion: number;
  pageCount?: number | null;
  detectedType?: string | null;
  detectedLanguage?: string | null;
  byteSize: number;
  thumbnailKey?: string;
}

function present(document: PresentableDocument, content: PresentableContent | null) {
  return {
    id: String(document._id ?? document.id),
    filename: document.filename,
    tags: document.tags ?? [],
    favorite: document.favorite ?? false,
    readingProgress: document.readingProgress,
    lastOpenedAt: document.lastOpenedAt ?? null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    content: content
      ? {
          parseStatus: content.parseStatus,
          parseVersion: content.parseVersion,
          pageCount: content.pageCount ?? null,
          detectedType: content.detectedType ?? null,
          detectedLanguage: content.detectedLanguage ?? null,
          byteSize: content.byteSize,
          hasThumbnail: Boolean(content.thumbnailKey),
        }
      : null,
  };
}

documentsRouter.post(
  "/upload-url",
  validateBody(uploadUrlRequestSchema),
  asyncHandler(async (req, res) => {
    const { contentHash, mimeType, byteSize } = req.body as {
      contentHash: string; mimeType: string; byteSize: number;
    };

    // PRIVACY-CRITICAL: identical response whether or not this content already
    // exists. The service never looks the hash up, so it cannot leak it.
    const target = await createDocumentsService().createUploadTarget({
      contentHash, mimeType, byteSize,
    });

    sendData(res, {
      uploadUrl: target.uploadUrl,
      storageKey: target.storageKey,
      expiresAt: target.expiresAt.toISOString(),
    });
  }),
);

documentsRouter.post(
  "/",
  validateBody(registerDocumentRequestSchema),
  requireQuota("pages"),
  asyncHandler(async (req, res) => {
    const body = req.body as {
      filename: string; mimeType: string; byteSize: number; contentHash: string; storageKey: string;
    };

    const { document, content } = await createDocumentsService().register({
      ownerId: String(req.currentUser!.id),
      ...body,
    });

    // 200, not 201, and no "created"/"deduped" flag: the response must not
    // reveal whether this upload was the first of its content.
    sendData(res, present(document.toObject(), content.toObject()));
  }),
);

documentsRouter.get(
  "/",
  validateQuery(listDocumentsQuerySchema),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as {
      limit: number; sort: "updatedAt" | "createdAt" | "filename" | "byteSize";
      direction: "asc" | "desc"; favorite?: boolean; tag?: string; search?: string;
    };

    const { documents, hasMore } = await createDocumentsService().list({
      ownerId: String(req.currentUser!.id), ...q,
    });

    sendData(res, {
      // contentId is populated, so it arrives as the content object rather
      // than an ObjectId.
      documents: documents.map((d) => {
        const populated = d as unknown as PresentableDocument & {
          contentId?: PresentableContent | null;
        };
        return present(populated, populated.contentId ?? null);
      }),
      hasMore,
    });
  }),
);

documentsRouter.get(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    const { document, content } = await createDocumentsService().getOwned(
      String(req.currentUser!.id), req.params.id as string,
    );

    sendData(res, {
      ...present(document.toObject(), content.toObject()),
      // Outline only on the single-document read — it is large and the list
      // view has no use for it.
      outline: content.outline,
    });
  }),
);

documentsRouter.patch(
  "/:id",
  validateParams(idParamSchema),
  validateBody(updateDocumentRequestSchema),
  asyncHandler(async (req, res) => {
    const service = createDocumentsService();
    const { document, content } = await service.getOwned(
      String(req.currentUser!.id), req.params.id as string,
    );

    const body = req.body as {
      filename?: string; tags?: string[]; favorite?: boolean;
      readingProgress?: { page: number; fraction: number };
    };

    // Only Document fields. DocumentContent is shared — another user's library
    // points at the same record, so nothing here may touch it.
    if (body.filename !== undefined) document.set({ filename: body.filename });
    if (body.tags !== undefined) document.set({ tags: body.tags });
    if (body.favorite !== undefined) document.set({ favorite: body.favorite });
    if (body.readingProgress) {
      document.set({
        readingProgress: { ...body.readingProgress, updatedAt: new Date() },
        lastOpenedAt: new Date(),
      });
    }
    await document.save();

    sendData(res, present(document.toObject(), content.toObject()));
  }),
);

documentsRouter.delete(
  "/:id",
  validateParams(idParamSchema),
  asyncHandler(async (req, res) => {
    await createDocumentsService().remove(String(req.currentUser!.id), req.params.id as string);
    sendNoContent(res);
  }),
);

documentsRouter.get(
  "/:id/text",
  validateParams(idParamSchema),
  validateQuery(documentTextQuerySchema),
  asyncHandler(async (req, res) => {
    const { content } = await createDocumentsService().getOwned(
      String(req.currentUser!.id), req.params.id as string,
    );

    const { pageStart, pageEnd } = req.query as unknown as { pageStart: number; pageEnd?: number };
    const last = pageEnd ?? pageStart;

    if (content.parseStatus !== "parsed") {
      throw new NotFoundError(`Document is not parsed yet (status: ${content.parseStatus})`);
    }

    const from = content.pageOffsets[pageStart - 1];
    if (from === undefined) throw new NotFoundError(`Page ${pageStart} is out of range`);
    const to = content.pageOffsets[last] ?? content.normalizedTextLength ?? from;

    // Extracted page text is the user's OWN uploaded content, so it is not
    // entitlement-gated. Chunk text is a derived artifact and is never served
    // from here.
    const chunks = await DocumentChunkModel.find({
      contentId: content._id,
      parseVersion: content.parseVersion,
      "anchor.charStart": { $lt: to },
      "anchor.charEnd": { $gt: from },
    })
      .sort({ ordinal: 1 })
      .select({ text: 1, anchor: 1, headingPath: 1 })
      .lean();

    sendData(res, {
      pageStart,
      pageEnd: last,
      parseVersion: content.parseVersion,
      passages: chunks.map((c) => ({
        text: c.text,
        headingPath: c.headingPath,
        spans: splitRangeByPage(
          c.anchor.charStart, c.anchor.charEnd,
          content.pageOffsets, content.normalizedTextLength ?? 0,
        ),
      })),
    });
  }),
);

documentsRouter.post(
  "/:id/reparse",
  validateParams(idParamSchema),
  aiRateLimit,
  requireQuota("pages"),
  asyncHandler(async (req, res) => {
    const { parseVersion } = await createDocumentsService().reparse(
      String(req.currentUser!.id),
      req.params.id as string,
      Boolean((req.body as { allowOcr?: boolean } | undefined)?.allowOcr),
    );
    sendData(res, { parseVersion, status: "queued" });
  }),
);
