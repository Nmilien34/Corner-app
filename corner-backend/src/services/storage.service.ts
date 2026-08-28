// Object storage adapter. S3-compatible.
//
// Cloudflare R2 is the intended default because egress is free, which matters
// a great deal when the product streams generated audio. Nothing here is
// R2-specific; swapping to S3 or B2 is configuration.

export interface PresignedUpload {
  uploadUrl: string;
  storageKey: string;
  expiresAt: Date;
}

export interface StorageService {
  /**
   * Always returns a usable target, even when the content is already stored.
   *
   * That invariant is a privacy requirement, not an implementation detail:
   * varying this call on whether the hash is known would let a client probe
   * for the existence of a specific document. See the comment on
   * uploadUrlResponseSchema in @corner/shared.
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
  objectExists(key: string): Promise<boolean>;
}

// TODO(phase-2-impl): implement against @aws-sdk/client-s3 with R2 credentials
// from env.STORAGE_*. Described in docs/BRIEF.md "Services layer".
export function createStorageService(): StorageService {
  throw new Error("StorageService not implemented");
}
