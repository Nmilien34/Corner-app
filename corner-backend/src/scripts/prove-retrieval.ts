// End-to-end retrieval proof against the live cluster.
//
//   npx tsx src/scripts/prove-retrieval.ts
//
// Parses a slice of the spike corpus, chunks it, embeds it for real, writes
// binData vectors, then queries through $vectorSearch and checks that the
// answers are the passages a human would pick. Cleans up after itself.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@corner/shared";
import type { Binary } from "bson";
import mongoose from "mongoose";

import { env } from "../config/env";
import { logger } from "../lib/logger";
import { DocumentChunkModel, DocumentContentModel, UserModel } from "../models";
import { createChunkingService } from "../services/chunking.service";
import { createPdfService } from "../services/pdf.service";
import { createRetrievalService } from "../services/retrieval.service";
import { embedChunks } from "../jobs/handlers/embed-chunks";

const CORPUS = resolve(__dirname, "..", "..", "..", "spikes/pdf-renderer/assets/small-12p.pdf");
const DEVICE = "retrieval-proof-device";

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log(`\n  database ${mongoose.connection.name}`);

  // --- clean slate --------------------------------------------------------
  const buffer = readFileSync(CORPUS);
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  await DocumentContentModel.deleteMany({ contentHash });
  const stale = await DocumentContentModel.findOne({ contentHash });
  if (stale) await DocumentChunkModel.deleteMany({ contentId: stale._id });

  await UserModel.deleteMany({ deviceId: DEVICE });
  const user = await UserModel.create({ deviceId: DEVICE });

  // --- parse + chunk ------------------------------------------------------
  const parsed = await createPdfService().parse({ buffer });
  console.log(`  parsed   ${parsed.pageCount} pages, ${parsed.normalizedText.length} chars`);

  const content = await DocumentContentModel.create({
    contentHash,
    byteSize: buffer.length,
    mimeType: "application/pdf",
    storageKey: `corner/documents/${contentHash.slice(0, 2)}/${contentHash}/source.pdf`,
    pageCount: parsed.pageCount,
    outline: parsed.outline,
    pageOffsets: parsed.pageOffsets,
    normalizedTextLength: parsed.normalizedText.length,
    parseStatus: "parsed",
    parseVersion: 1,
    parsedAt: new Date(),
  });

  const drafts = createChunkingService().chunk({ parsed, targetTokens: 90, overlapTokens: 10 });
  await DocumentChunkModel.insertMany(
    drafts.map((d) => ({
      contentId: content._id,
      parseVersion: 1,
      ordinal: d.ordinal,
      text: d.text,
      anchor: d.anchor,
      headingPath: d.headingPath,
      outlineNodeId: d.outlineNodeId,
      tokenCount: d.tokenCount,
    })),
  );
  console.log(`  chunks   ${drafts.length}`);

  // --- embed for real -----------------------------------------------------
  console.log(`\n  embedding with ${EMBEDDING_MODEL}...`);
  const result = await embedChunks(
    { contentId: String(content._id), parseVersion: 1, requestedBy: String(user._id) },
    { jobId: String(new mongoose.Types.ObjectId()), attempt: 1, logger },
  );
  console.log(`  embedded ${result.embedded} chunks in ${result.batches} batch(es), ${result.tokensConsumed} tokens`);

  // --- verify stored representation ---------------------------------------
  const raw = await mongoose.connection.db!
    .collection("documentchunks")
    .findOne({ contentId: content._id }, { projection: { embedding: 1 } });
  const stored = raw?.embedding as Binary | undefined;
  console.log(`\n  stored vector: subtype=${stored?.sub_type} bytes=${stored?.buffer.length} ` +
    `(expected subtype 9, ${EMBEDDING_DIMENSIONS * 4 + 2} bytes)`);
  const subtypeOk = stored?.sub_type === 9 && stored.buffer.length === EMBEDDING_DIMENSIONS * 4 + 2;
  console.log(`  binData format: ${subtypeOk ? "OK" : "WRONG — Atlas will not index this"}`);

  // --- retrieval ----------------------------------------------------------
  const retrieval = createRetrievalService();
  const index = await retrieval.checkVectorIndex();
  console.log(`\n  index: ${index.detail}`);

  const queries = [
    "What does the third section of chapter one say?",
    "quick brown fox jumping over a lazy dog",
    "Which page is chapter 2 on?",
  ];

  let anyResults = false;
  for (const q of queries) {
    const hits = await retrieval.search({
      contentId: String(content._id), parseVersion: 1, query: q, limit: 3,
    });
    anyResults ||= hits.length > 0;
    console.log(`\n  Q: ${q}`);
    for (const h of hits) {
      const span = h.spans[0];
      console.log(`     ${h.score.toFixed(4)}  p${span?.page ?? "?"}  ${JSON.stringify(h.text.slice(0, 62))}`);
      console.log(`             spans=${h.spans.length} pageCharStart=${span?.pageCharStart}`);
    }
  }

  // --- isolation check ----------------------------------------------------
  const other = await DocumentContentModel.create({
    contentHash: "f".repeat(64), byteSize: 1, mimeType: "application/pdf",
    storageKey: "corner/documents/ff/x/source.pdf", parseStatus: "parsed", parseVersion: 1,
  });
  const leaked = await retrieval.search({
    contentId: String(other._id), parseVersion: 1, query: "quick brown fox", limit: 5,
  });
  console.log(`\n  isolation: querying an unrelated contentId returned ${leaked.length} hit(s) (expect 0)`);

  // --- cleanup ------------------------------------------------------------
  await DocumentChunkModel.deleteMany({ contentId: content._id });
  await DocumentContentModel.deleteMany({ _id: { $in: [content._id, other._id] } });
  await UserModel.deleteMany({ deviceId: DEVICE });
  console.log("\n  cleaned up.");

  console.log(`\n  VERDICT: ${subtypeOk && anyResults && leaked.length === 0 ? "PASS" : "FAIL"}\n`);
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error("prove-retrieval failed:", error);
  process.exit(1);
});
