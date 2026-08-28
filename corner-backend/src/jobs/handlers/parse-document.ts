// Parses an uploaded document: text, outline, page offsets, chunks, thumbnail.
//
// Everything downstream anchors to what this produces, so the normalization
// contract in pdf.service.ts is authoritative — see the comment block there.
// This handler orchestrates; it does not normalize.

import { Types } from "mongoose";

import { AppError } from "../../lib/errors";
import { DocumentChunkModel, DocumentContentModel, ProcessingJobModel } from "../../models";
import { createChunkingService } from "../../services/chunking.service";
import { createPdfService } from "../../services/pdf.service";
import { createStorageService } from "../../services/storage.service";
import { normalizedTextKey, thumbnailKey } from "../../services/storage-keys";
import type { JobContext } from "../registry";

export interface ParseDocumentPayload {
  contentId: string;
  /** Who triggered it. Provenance for cost attribution, not ownership. */
  requestedBy?: string;
  documentId?: string;
  allowOcr?: boolean;
}

export interface ParseDocumentResult {
  contentId: string;
  parseVersion: number;
  pageCount: number;
  characters: number;
  outlineNodes: number;
  chunks: number;
  thumbnail: boolean;
}

export async function parseDocument(
  rawPayload: Record<string, unknown>,
  context: JobContext,
): Promise<ParseDocumentResult> {
  const { logger } = context;
  const contentId = rawPayload.contentId;
  if (typeof contentId !== "string" || !Types.ObjectId.isValid(contentId)) {
    throw new AppError("invalid_job_payload", "parse-document: contentId missing or invalid", 400);
  }

  const content = await DocumentContentModel.findById(contentId);
  if (!content) {
    throw new AppError("content_not_found", `No DocumentContent ${contentId}`, 404);
  }

  const storage = createStorageService();
  const pdf = createPdfService();
  const chunking = createChunkingService();

  content.set({ parseStatus: "parsing", parseError: undefined });
  await content.save();

  try {
    const buffer = await storage.getObject(content.storageKey);
    const parsed = await pdf.parse({ buffer, allowOcr: Boolean(rawPayload.allowOcr) });

    // The generation being written. A reparse increments before enqueueing, so
    // this handler writes into whatever generation the content already claims —
    // it never decides the number itself.
    const parseVersion = content.parseVersion;

    // Clear any partial output from a previous attempt at THIS generation. A
    // retry must not append to what a crashed run left behind, or ordinals
    // collide against the unique index.
    await DocumentChunkModel.deleteMany({ contentId: content._id, parseVersion });

    const drafts = chunking.chunk({ parsed });
    if (drafts.length > 0) {
      await DocumentChunkModel.insertMany(
        drafts.map((d) => ({
          contentId: content._id,
          parseVersion,
          ordinal: d.ordinal,
          text: d.text,
          anchor: d.anchor,
          headingPath: d.headingPath,
          outlineNodeId: d.outlineNodeId,
          tokenCount: d.tokenCount,
        })),
      );
    }

    // Normalized text to object storage, not to Mongo. It is the size of the
    // document and is read rarely — by reparse comparison and by debugging —
    // so putting it in the database would inflate every DocumentContent read.
    await storage.putObject({
      key: normalizedTextKey(content.contentHash, parseVersion),
      body: Buffer.from(parsed.normalizedText, "utf8"),
      contentType: "text/plain; charset=utf-8",
    });

    // Thumbnail failure must not fail a parse. It is decoration; the text is
    // the product.
    let thumbnail = false;
    try {
      const image = await pdf.renderThumbnail({ buffer, page: 1 });
      const key = thumbnailKey(content.contentHash);
      await storage.putObject({ key, body: image, contentType: "image/jpeg" });
      content.set({ thumbnailKey: key });
      thumbnail = true;
    } catch (error) {
      logger.warn({ err: error, contentId }, "parse-document: thumbnail failed, continuing");
    }

    content.set({
      pageCount: parsed.pageCount,
      outline: parsed.outline,
      pageOffsets: parsed.pageOffsets,
      normalizedTextLength: parsed.normalizedText.length,
      detectedLanguage: parsed.detectedLanguage,
      ocrApplied: parsed.ocrApplied,
      parseStatus: "parsed",
      parsedAt: new Date(),
      parseError: undefined,
    });
    await content.save();

    const result: ParseDocumentResult = {
      contentId,
      parseVersion,
      pageCount: parsed.pageCount,
      characters: parsed.normalizedText.length,
      outlineNodes: parsed.outline.length,
      chunks: drafts.length,
      thumbnail,
    };

    // Chain to embedding. Enqueued rather than done inline: embedding is a
    // separate spend with its own retry semantics, and a failure there must not
    // mark a successful parse as failed.
    if (drafts.length > 0 && typeof rawPayload.requestedBy === "string") {
      try {
        await ProcessingJobModel.create({
          type: "embed-chunks",
          dedupeKey: `embed-chunks:${contentId}:v${parseVersion}`,
          payload: {
            contentId,
            parseVersion,
            requestedBy: rawPayload.requestedBy,
            documentId: rawPayload.documentId,
          },
          priority: 3,
        });
      } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
      }
    }

    logger.info(result, "parse-document: complete");
    return result;
  } catch (error) {
    content.set({
      parseStatus: "failed",
      parseError: error instanceof Error ? error.message.slice(0, 500) : String(error),
    });
    await content.save();
    throw error;
  }
}
