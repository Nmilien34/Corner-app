// Read-only storage diagnostic. Writes nothing.
//
//   npm run check:storage -w @corner/backend
//
// Same intent as check:db — name the specific failure rather than surfacing a
// raw SDK error. Region and credential mistakes produce very different AWS
// errors that all read as "it didn't work".

import { env } from "../config/env";
import { createStorageService } from "../services/storage.service";
import { CORNER_ROOT, sourceKey, thumbnailKey } from "../services/storage-keys";

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

  // ---- Write round-trip -----------------------------------------------------
  //
  // Only runs with --write. The read-only path stays the default so this
  // script is safe to run against a bucket holding real documents.
  if (!process.argv.includes("--write")) {
    console.log("\n  Read-only checks passed. No objects were written.");
    console.log("  Pass --write to round-trip a real object.\n");
    return;
  }

  const { createHash, randomBytes } = await import("node:crypto");

  // A synthetic content hash so the key goes through the real builder — this
  // verifies the corner/ root is applied by the code that will apply it in
  // production, not by the test.
  const payload = randomBytes(4096);
  const hash = createHash("sha256").update(payload).digest("hex");
  const key = sourceKey(hash, "bin");

  console.log("\n  Write round-trip");
  console.log(`    key       ${key}`);

  if (!key.startsWith(CORNER_ROOT)) {
    fail("Key builder produced a key outside the corner/ root", [key]);
  }
  console.log(`    root      OK — inside ${CORNER_ROOT}`);

  const before = await storage.listPrefix("", 5);
  const outsideBefore = before.filter((k) => !k.startsWith(CORNER_ROOT));

  console.log("\n    1. presigned upload...");
  const presigned = await storage.createPresignedUpload({
    key, mimeType: "application/octet-stream", byteSize: payload.length,
  });
  const put = await fetch(presigned.uploadUrl, {
    method: "PUT",
    body: new Uint8Array(payload),
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!put.ok) fail(`Presigned PUT failed: ${put.status} ${put.statusText}`, [
    await put.text().then((t) => t.slice(0, 300)).catch(() => ""),
  ]);
  console.log(`       uploaded ${payload.length} bytes via presigned URL`);

  console.log("    2. exists...");
  if (!(await storage.objectExists(key))) fail("Object not found after upload", [key]);
  console.log("       present");

  console.log("    3. fetch back and compare bytes...");
  const fetched = await storage.getObject(key);
  const same = fetched.length === payload.length && fetched.equals(payload);
  console.log(`       ${fetched.length} bytes, sha match: ${
    createHash("sha256").update(fetched).digest("hex") === hash}`);
  if (!same) fail("Round-tripped bytes differ from what was uploaded", []);

  console.log("    4. presigned download...");
  const dl = await storage.createPresignedDownload({ key });
  const got = await fetch(dl.url);
  const viaUrl = Buffer.from(await got.arrayBuffer());
  if (!viaUrl.equals(payload)) fail("Presigned download returned different bytes", []);
  console.log("       presigned GET returned identical bytes");
  console.log(`       Accept-Ranges: ${got.headers.get("accept-ranges") ?? "(absent)"}`);

  console.log("    5. delete...");
  await storage.deleteObject(key);
  if (await storage.objectExists(key)) fail("Object still present after delete", [key]);
  console.log("       gone");

  const after = await storage.listPrefix("", 20);
  const outsideAfter = after.filter((k) => !k.startsWith(CORNER_ROOT));
  console.log(`\n    containment: ${outsideAfter.length} object(s) outside ${CORNER_ROOT}`);
  if (outsideAfter.length !== outsideBefore.length) {
    fail("Something landed outside the corner/ root", outsideAfter);
  }

  console.log("\n  Write round-trip passed. Test object removed.\n");
}

main().catch((error: unknown) => {
  console.error("check-storage crashed:", error);
  process.exit(1);
});
