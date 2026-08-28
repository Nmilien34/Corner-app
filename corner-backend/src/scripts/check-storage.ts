// Read-only storage diagnostic. Writes nothing.
//
//   npm run check:storage -w @corner/backend
//
// Same intent as check:db — name the specific failure rather than surfacing a
// raw SDK error. Region and credential mistakes produce very different AWS
// errors that all read as "it didn't work".

import { env } from "../config/env";
import { createStorageService } from "../services/storage.service";
import { sourceKey, thumbnailKey } from "../services/storage-keys";

function fail(title: string, lines: string[]): never {
  console.error(`\n  FAIL  ${title}\n`);
  for (const l of lines) console.error(`        ${l}`);
  console.error("");
  process.exit(1);
}

async function main(): Promise<void> {
  console.log("\n  Storage configuration");
  console.log(`    bucket    ${env.STORAGE_BUCKET || "(NOT SET)"}`);
  console.log(`    region    ${env.STORAGE_REGION}`);
  console.log(`    endpoint  ${env.STORAGE_ENDPOINT || "(empty — correct for AWS S3)"}`);
  console.log(`    key id    ${env.STORAGE_ACCESS_KEY_ID ? "<set>" : "(NOT SET)"}`);

  if (!env.STORAGE_BUCKET) {
    fail("STORAGE_BUCKET is not set", ["Set it in .env and in Render > Env Groups."]);
  }
  if (env.STORAGE_REGION === "auto" && !env.STORAGE_ENDPOINT) {
    fail('STORAGE_REGION is "auto" with no endpoint', [
      '"auto" is a Cloudflare R2 convention. The AWS SDK rejects it.',
      "Set a real region, e.g. us-east-1.",
    ]);
  }

  const sample = "a".repeat(64);
  console.log("\n  Key scheme");
  console.log(`    source    ${sourceKey(sample)}`);
  console.log(`    thumbnail ${thumbnailKey(sample)}`);

  const storage = createStorageService();

  console.log("\n  Checking bucket access (read-only)...");
  try {
    const info = await storage.checkAccess();
    console.log(`  OK    reached ${info.bucket} in ${info.region}`);
  } catch (error) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
    const status = err.$metadata?.httpStatusCode;

    if (err.name === "NotFound" || status === 404) {
      fail(`Bucket "${env.STORAGE_BUCKET}" does not exist in ${env.STORAGE_REGION}`, [
        "Either the name is wrong, or the bucket lives in a different region.",
        "A bucket in another region returns 404 here, not a redirect.",
      ]);
    }
    if (err.name === "Forbidden" || status === 403) {
      fail("Credentials rejected, or no permission on this bucket", [
        "The bucket exists and was reached — this is an IAM problem.",
        "The key needs s3:ListBucket on the bucket and s3:GetObject/PutObject/",
        "DeleteObject on its contents.",
      ]);
    }
    if (err.name === "PermanentRedirect" || status === 301) {
      fail("Wrong region for this bucket", [
        `STORAGE_REGION is ${env.STORAGE_REGION}, but the bucket lives elsewhere.`,
      ]);
    }
    fail("Unexpected error reaching the bucket", [String(err.message ?? error)]);
  }

  console.log("\n  Listing under documents/ (read-only, first 5)...");
  const keys = await storage.listPrefix("documents/", 5);
  console.log(`  INFO  ${keys.length} object(s) under documents/`);
  for (const k of keys) console.log(`          ${k}`);

  console.log("\n  Read-only checks passed. No objects were written.\n");
}

main().catch((error: unknown) => {
  console.error("check-storage crashed:", error);
  process.exit(1);
});
