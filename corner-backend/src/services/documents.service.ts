// Document lifecycle: register, list, read, update, delete, reparse.
//
// The split this file exists to hold: DocumentContent is the FILE, shared
// across everyone who uploaded the same bytes; Document is one user's LIBRARY
// ENTRY pointing at it. Nothing here may let one user's action mutate content
// another user still references.

import { Types } from "mongoose";
import type { FilterQuery } from "mongoose";

import { AppError, NotFoundError } from "../lib/errors";
import {
  ActionItemModel,
  ChatMessageModel,
  ChatThreadModel,
  DocumentContentModel,
  DocumentModel,
  ProcessingJobModel,
} from "../models";
import type { DocumentRecordDocument } from "../models";
import { sourceKey } from "./storage-keys";
import { createStorageService } from "./storage.service";

export interface RegisterInput {
  ownerId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  contentHash: string;
  storageKey: string;
}

export interface ListInput {
  ownerId: string;
  limit: number;
  cursor?: string;
  sort: "updatedAt" | "createdAt" | "filename" | "byteSize";
  direction: "asc" | "desc";
  favorite?: boolean;
  tag?: string;
  search?: string;
}

/**
 * Enqueues a job, tolerating the unique dedupe index.
 *
 * Two users registering the same file within seconds both try to enqueue the
 * same parse. The index is what makes that safe; catching its error here is
 * what makes it invisible.
 */
async function enqueue(type: string, dedupeKey: string, payload: Record<string, unknown>, priority = 0) {
  try {
    await ProcessingJobModel.create({ type, dedupeKey, payload, priority });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 11000) throw error;
  }
}

export function createDocumentsService() {
  const storage = createStorageService();

  return {
    /**
     * Issues an upload target.
     *
     * PRIVACY-CRITICAL: the response must be IDENTICAL whether or not this
     * contentHash is already stored. A response that varied would let anyone
     * probe for the existence of a specific document by hashing a candidate
     * and asking — and Corner's corpus is contracts and medical records.
     *
     * So this never looks up the hash. It cannot leak what it does not know.
     */
    async createUploadTarget(input: { contentHash: string; mimeType: string; byteSize: number }) {
      return storage.createPresignedUpload({
        key: sourceKey(input.contentHash, "pdf"),
        mimeType: input.mimeType,
        byteSize: input.byteSize,
      });
    },

    /**
     * Registers an uploaded document for a user.
     *
     * Dedupe happens HERE, server-side and invisibly: find-or-create the
     * content, then create the user's own library entry pointing at it. The
     * caller cannot tell which branch ran.
     */
    async register(input: RegisterInput) {
      const expectedKey = sourceKey(input.contentHash, "pdf");
      if (input.storageKey !== expectedKey) {
        throw new AppError(
          "storage_key_mismatch",
          "storageKey does not match the key derived from contentHash",
          400,
        );
      }

      // Trust the bytes, not the client's claim about them. A wrong hash would
      // silently alias this upload onto someone else's document.
      const uploaded = await storage.getObject(expectedKey).catch(() => null);
      if (!uploaded) {
        throw new AppError("upload_missing", "No object at the presigned key — upload first", 409);
      }
      const { createHash } = await import("node:crypto");
      const actualHash = createHash("sha256").update(uploaded).digest("hex");
      if (actualHash !== input.contentHash) {
        throw new AppError(
          "content_hash_mismatch",
          "Uploaded bytes do not hash to the declared contentHash",
          400,
        );
      }

      let content = await DocumentContentModel.findOne({ contentHash: input.contentHash });
      let created = false;

      if (!content) {
        try {
          content = await DocumentContentModel.create({
            contentHash: input.contentHash,
            byteSize: uploaded.length,
            mimeType: input.mimeType,
            storageKey: expectedKey,
            parseStatus: "uploaded",
            parseVersion: 1,
          });
          created = true;
        } catch (error) {
          // Lost a race with a concurrent registration of the same file. The
          // unique index on contentHash is the arbiter; re-read the winner.
          if ((error as { code?: number }).code !== 11000) throw error;
          content = await DocumentContentModel.findOne({ contentHash: input.contentHash });
          if (!content) throw error;
        }
      }

      const document = await DocumentModel.findOneAndUpdate(
        { ownerId: new Types.ObjectId(input.ownerId), contentId: content._id },
        { $setOnInsert: { filename: input.filename } },
        { new: true, upsert: true },
      );

      // Only parse content nobody has parsed. A second uploader of an already
      // parsed file gets the existing chunks for free — the entire point of
      // content-level dedupe.
      if (created || content.parseStatus === "uploaded" || content.parseStatus === "failed") {
        await enqueue(
          "parse-document",
          `parse-document:${String(content._id)}:v${content.parseVersion}`,
          { contentId: String(content._id), documentId: String(document._id), requestedBy: input.ownerId },
          5,
        );
      }

      return { document, content };
    },

    async list(input: ListInput) {
      const filter: FilterQuery<DocumentRecordDocument> = {
        ownerId: new Types.ObjectId(input.ownerId),
      };
      if (input.favorite !== undefined) filter.favorite = input.favorite;
      if (input.tag) filter.tags = input.tag;
      if (input.search) {
        // Escaped: a filename search is user input and must not be able to
        // inject regex operators.
        filter.filename = { $regex: input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      }

      const order = input.direction === "asc" ? 1 : -1;
      const documents = await DocumentModel.find(filter)
        .sort({ [input.sort]: order, _id: order })
        .limit(input.limit + 1)
        .populate("contentId", "pageCount parseStatus detectedType thumbnailKey byteSize")
        .lean();

      const hasMore = documents.length > input.limit;
      return { documents: documents.slice(0, input.limit), hasMore };
    },

    async getOwned(ownerId: string, documentId: string) {
      const document = await DocumentModel.findOne({
        _id: documentId,
        ownerId: new Types.ObjectId(ownerId),
      });
      // Not-found rather than forbidden for someone else's document: a 403
      // would confirm the id exists, which is itself a disclosure.
      if (!document) throw new NotFoundError("Document not found");

      const content = await DocumentContentModel.findById(document.contentId);
      if (!content) throw new NotFoundError("Document content missing");

      return { document, content };
    },

    /**
     * Hard-deletes the user's entry and everything derived FOR THEM.
     *
     * Deliberately does not touch DocumentContent, its chunks or its blobs:
     * another user's library may point at the same content. The orphan sweep
     * reclaims it once nothing references it and the grace period has passed.
     * See PRIVACY.md.
     */
    async remove(ownerId: string, documentId: string) {
      const { document } = await this.getOwned(ownerId, documentId);
      const owner = new Types.ObjectId(ownerId);

      const [items, threads, messages] = await Promise.all([
        ActionItemModel.deleteMany({ documentId: document._id, ownerId: owner }),
        ChatThreadModel.deleteMany({ documentId: document._id, ownerId: owner }),
        ChatMessageModel.deleteMany({ documentId: document._id, ownerId: owner }),
      ]);
      await DocumentModel.deleteOne({ _id: document._id });

      return {
        actionItems: items.deletedCount,
        threads: threads.deletedCount,
        messages: messages.deletedCount,
      };
    },

    /**
     * Starts a new parse generation.
     *
     * Increments parseVersion BEFORE enqueueing so the new generation is
     * written alongside the old one. The previous generation stays readable —
     * an in-flight reader's anchors keep resolving until the swap completes.
     */
    async reparse(ownerId: string, documentId: string, allowOcr: boolean) {
      const { content } = await this.getOwned(ownerId, documentId);

      content.set({ parseVersion: content.parseVersion + 1, parseStatus: "uploaded" });
      await content.save();

      await enqueue(
        "parse-document",
        `parse-document:${String(content._id)}:v${content.parseVersion}`,
        { contentId: String(content._id), requestedBy: ownerId, allowOcr },
        5,
      );

      return { parseVersion: content.parseVersion };
    },
  };
}
