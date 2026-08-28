// Object storage adapter. S3-compatible.
//
// Deployed against AWS S3. Cloudflare R2 remains the cheaper long-term option
// because egress is free and Corner streams audio — see docs/costs.md for the
// per-listening-hour figure. Nothing in this file is AWS-specific beyond the
// client construction, so that move is credentials plus an endpoint.

import { Readable } from "node:stream";

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../config/env";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export interface PresignedUpload {
  uploadUrl: string;
  storageKey: string;
  expiresAt: Date;
}

export interface StorageService {
  /**
   * Always returns a usable target, even when the content is already stored.
   *
   * That invariant is a privacy requirement, not an implementation detail.
   * Varying this call on whether the hash is known would let a client probe for
   * the existence of a specific document by hashing a candidate and asking —
   * and Corner's corpus is contracts, medical records and legal filings. See
   * uploadUrlResponseSchema in @corner/shared and OQ-003.
   */
  createPresignedUpload(input: {
    key: string;
    mimeType: string;
    byteSize: number;
    expiresInSeconds?: number;
  }): Promise<PresignedUpload>;

  createPresignedDownload(input: {
    key: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; expiresAt: Date }>;

  putObject(input: { key: string; body: Buffer; contentType: string }): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  deleteObjects(keys: string[]): Promise<void>;
  /** Deletes every object under a prefix. Used by the orphan sweep. */
  deletePrefix(prefix: string): Promise<number>;
  objectExists(key: string): Promise<boolean>;
  listPrefix(prefix: string, limit?: number): Promise<string[]>;
  /** Read-only reachability + credential check. Writes nothing. */
  checkAccess(): Promise<{ bucket: string; region: string; reachable: boolean }>;
}

const DEFAULT_UPLOAD_TTL_SECONDS = 900; // 15 minutes
const DEFAULT_DOWNLOAD_TTL_SECONDS = 3600;
/** S3's DeleteObjects hard limit. */
const DELETE_BATCH = 1000;

function requireConfig(): { bucket: string; region: string } {
  const bucket = env.STORAGE_BUCKET;
  if (!bucket) {
    throw new AppError(
      "storage_not_configured",
      "STORAGE_BUCKET is not set",
      500,
      undefined,
      false,
    );
  }
  return { bucket, region: env.STORAGE_REGION };
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks);
  }
  // Node 18+ web stream fallback.
  if (body && typeof (body as { transformToByteArray?: unknown }).transformToByteArray === "function") {
    const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
    return Buffer.from(bytes);
  }
  throw new AppError("storage_read_failed", "Unrecognized S3 body stream", 500, undefined, false);
}

export function createStorageService(): StorageService {
  const { bucket, region } = requireConfig();

  const client = new S3Client({
    region,
    // Empty for AWS — the SDK derives the endpoint from the region. Set only
    // for S3-compatible providers that need an explicit host (R2, MinIO).
    ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT, forcePathStyle: true } : {}),
    ...(env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
      ? {
          credentials: {
            accessKeyId: env.STORAGE_ACCESS_KEY_ID,
            secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
          },
        }
      : {}),
  });

  return {
    async createPresignedUpload({ key, mimeType, byteSize, expiresInSeconds }) {
      const ttl = expiresInSeconds ?? DEFAULT_UPLOAD_TTL_SECONDS;

      // ContentLength is signed in, so the URL cannot be reused to upload a
      // different-sized object. The client must send exactly what it declared.
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          ContentType: mimeType,
          ContentLength: byteSize,
        }),
        { expiresIn: ttl },
      );

      return { uploadUrl: url, storageKey: key, expiresAt: new Date(Date.now() + ttl * 1000) };
    },

    async createPresignedDownload({ key, expiresInSeconds }) {
      const ttl = expiresInSeconds ?? DEFAULT_DOWNLOAD_TTL_SECONDS;
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: ttl },
      );
      return { url, expiresAt: new Date(Date.now() + ttl * 1000) };
    },

    async putObject({ key, body, contentType }) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },

    async getObject(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return streamToBuffer(result.Body);
    },

    async deleteObject(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    async deleteObjects(keys) {
      for (let i = 0; i < keys.length; i += DELETE_BATCH) {
        const batch = keys.slice(i, i + DELETE_BATCH);
        if (batch.length === 0) continue;
        await client.send(
          new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    },

    async deletePrefix(prefix) {
      // Guard against a caller passing "" or "/" and emptying the bucket. The
      // orphan sweep runs unattended, so a malformed prefix must fail rather
      // than match everything.
      if (!prefix || prefix.length < 4 || !prefix.endsWith("/")) {
        throw new AppError(
          "storage_unsafe_prefix",
          `Refusing to delete by prefix ${JSON.stringify(prefix)}`,
          500,
          undefined,
          false,
        );
      }

      let deleted = 0;
      let token: string | undefined;

      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
        );
        const keys = (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
        if (keys.length > 0) {
          await this.deleteObjects(keys);
          deleted += keys.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);

      logger.info({ prefix, deleted }, "deleted objects by prefix");
      return deleted;
    },

    async objectExists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return true;
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || status === 403) return false;
        throw error;
      }
    },

    async listPrefix(prefix, limit = 1000) {
      const page = await client.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: limit }),
      );
      return (page.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
    },

    async checkAccess() {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { bucket, region, reachable: true };
    },
  };
}
