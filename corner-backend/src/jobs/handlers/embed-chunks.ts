// Vectorizes a parse generation's chunks.
//
// IDEMPOTENT BY CONSTRUCTION. The handler selects only chunks with no
// `embeddedAt`, using the partial index on DocumentChunk. A retried job — a
// worker that died mid-batch, a lease that expired — re-selects only what was
// never written, so a retry costs the remainder rather than the whole document.
// That matters: embedding is billed per token, and a naive retry of a
// 400-page book re-spends the entire document.
//
// Writes are per-batch, not per-document, for the same reason: work already
// paid for is durable the moment it lands.

import { EMBEDDING_MODEL, EMBEDDING_PROVIDER } from "@corner/shared";
import { Types } from "mongoose";

import { AppError } from "../../lib/errors";
import { DocumentChunkModel, DocumentContentModel } from "../../models";
import { createEmbeddingsService, EMBEDDING_BATCH_SIZE } from "../../services/embeddings.service";
import { createUsageService } from "../../services/usage.service";
import type { JobContext } from "../registry";

export interface EmbedChunksPayload {
  contentId: string;
  parseVersion: number;
  /** Who pays. Provenance for UsageEvent, not ownership of the content. */
  requestedBy: string;
  documentId?: string;
}

export interface EmbedChunksResult {
  contentId: string;
  parseVersion: number;
  pending: number;
  embedded: number;
  batches: number;
  tokensConsumed: number;
}

function parsePayload(payload: Record<string, unknown>): EmbedChunksPayload {
  const { contentId, parseVersion, requestedBy, documentId } = payload as Partial<EmbedChunksPayload>;
  if (typeof contentId !== "string" || !Types.ObjectId.isValid(contentId)) {
    throw new AppError("invalid_job_payload", "embed-chunks: contentId missing or invalid", 400);
  }
  if (typeof parseVersion !== "number" || parseVersion < 1) {
    throw new AppError("invalid_job_payload", "embed-chunks: parseVersion missing or invalid", 400);
  }
  if (typeof requestedBy !== "string" || !Types.ObjectId.isValid(requestedBy)) {
    throw new AppError("invalid_job_payload", "embed-chunks: requestedBy missing or invalid", 400);
  }
  return { contentId, parseVersion, requestedBy, documentId };
}

export async function embedChunks(
  rawPayload: Record<string, unknown>,
  context: JobContext,
): Promise<EmbedChunksResult> {
  const payload = parsePayload(rawPayload);
  const { logger } = context;

  const content = await DocumentContentModel.findById(payload.contentId).lean();
  if (!content) {
    throw new AppError("content_not_found", `No DocumentContent ${payload.contentId}`, 404);
  }

  const embeddings = createEmbeddingsService();
  const usage = createUsageService();

  const selector = {
    contentId: new Types.ObjectId(payload.contentId),
    parseVersion: payload.parseVersion,
    embeddedAt: { $exists: false },
  };

  const pending = await DocumentChunkModel.countDocuments(selector);
  const result: EmbedChunksResult = {
    contentId: payload.contentId,
    parseVersion: payload.parseVersion,
    pending,
    embedded: 0,
    batches: 0,
    tokensConsumed: 0,
  };

  if (pending === 0) {
    logger.info({ contentId: payload.contentId }, "embed-chunks: nothing pending");
    return result;
  }

  logger.info(
    { contentId: payload.contentId, pending, model: EMBEDDING_MODEL, batchSize: EMBEDDING_BATCH_SIZE },
    "embed-chunks: starting",
  );

  for (;;) {
    // Re-query each batch rather than paginating a snapshot. Successfully
    // embedded chunks drop out of the selector on their own, so there is no
    // cursor to keep valid across writes.
    const batch = await DocumentChunkModel.find(selector)
      .sort({ ordinal: 1 })
      .limit(EMBEDDING_BATCH_SIZE)
      .select({ _id: 1, text: 1, ordinal: 1 })
      .lean();

    if (batch.length === 0) break;

    const { results, totalTokens } = await embeddings.embedBatch(batch.map((c) => c.text));

    await DocumentChunkModel.bulkWrite(
      batch.map((chunk, i) => ({
        updateOne: {
          filter: { _id: chunk._id },
          update: {
            $set: {
              // Binary (subtype 9). Mongoose casts it onto the Buffer path
              // preserving the subtype, which is what Atlas indexes.
              embedding: results[i]?.embedding,
              embeddingModel: embeddings.model,
              embeddingDimensions: embeddings.dimensions,
              embeddedAt: new Date(),
            },
          },
        },
      })),
      { ordered: false },
    );

    // One UsageEvent per BATCH, not per chunk. The provider bills per request,
    // so a per-chunk row would multiply an apportioned estimate into hundreds
    // of rows that look more precise than the number actually is.
    //
    // NEVER let accounting abort the job. By this point the tokens are spent
    // and the vectors are written; throwing here would fail a job whose work
    // is already durable, and the retry would skip those chunks — losing the
    // usage row permanently while the money stays spent. A missing cost row is
    // bad; a failed job that cannot be repaired by retrying is worse.
    try {
      await usage.record({
        ownerId: payload.requestedBy,
        feature: "embed",
        unit: "tokens_in",
        units: totalTokens,
        provider: EMBEDDING_PROVIDER,
        providerModel: embeddings.model,
        contentId: payload.contentId,
        documentId: payload.documentId,
        jobId: Types.ObjectId.isValid(context.jobId) ? context.jobId : undefined,
      });
    } catch (error) {
      // Loud, because unit economics silently losing rows is exactly the
      // failure UsageEvent exists to prevent.
      logger.error(
        { err: error, tokens: totalTokens, contentId: payload.contentId },
        "embed-chunks: FAILED TO RECORD USAGE — cost data lost for this batch",
      );
    }

    result.embedded += batch.length;
    result.batches += 1;
    result.tokensConsumed += totalTokens;

    logger.info(
      { embedded: result.embedded, of: pending, tokens: totalTokens },
      "embed-chunks: batch complete",
    );
  }

  logger.info(
    { contentId: payload.contentId, embedded: result.embedded, batches: result.batches,
      tokens: result.tokensConsumed },
    "embed-chunks: done",
  );

  return result;
}
