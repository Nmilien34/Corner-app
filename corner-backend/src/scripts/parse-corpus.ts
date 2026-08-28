// THE GATE. Parses the spike corpus server-side and emits what the client
// harness needs to independently verify the offsets.
//
//   npx tsx src/scripts/parse-corpus.ts
//
// Writes spikes/pdf-renderer/harness/server-parse.json. The harness loads it,
// resolves each chunk's offsets against its own rendered text layers, and
// compares the text it selected with the text the SERVER says lives there.
//
// If server and client text disagree anywhere, the anchor design does not hold
// and nothing downstream should be built.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { PAGE_SEPARATOR } from "@corner/shared";

import { createChunkingService } from "../services/chunking.service";
import { createPdfService } from "../services/pdf.service";

const ROOT = resolve(__dirname, "..", "..", "..");
const CORPUS = resolve(ROOT, "spikes/pdf-renderer/assets/large-350p.pdf");
const OUT = resolve(ROOT, "spikes/pdf-renderer/harness/server-parse.json");

async function main(): Promise<void> {
  const buffer = readFileSync(CORPUS);
  const contentHash = createHash("sha256").update(buffer).digest("hex");

  console.log(`corpus     ${CORPUS}`);
  console.log(`sha256     ${contentHash}`);
  console.log(`bytes      ${buffer.length.toLocaleString()}`);

  const t0 = Date.now();
  const parsed = await createPdfService().parse({ buffer });
  const parseMs = Date.now() - t0;

  console.log(`\npdfjs      ${parsed.pdfjsVersion}`);
  console.log(`norm rules v${parsed.normalizationVersion}`);
  console.log(`pages      ${parsed.pageCount}`);
  console.log(`chars      ${parsed.normalizedText.length.toLocaleString()}`);
  console.log(`outline    ${parsed.outline.length} node(s)`);
  console.log(`parse      ${parseMs}ms`);

  const chunks = createChunkingService().chunk({ parsed });
  console.log(`chunks     ${chunks.length}`);

  // Self-check before involving the client: a chunk's text must be exactly the
  // slice its own offsets describe. If this fails the chunker is wrong and the
  // client comparison would be measuring the wrong thing.
  let selfMismatches = 0;
  for (const c of chunks) {
    if (parsed.normalizedText.slice(c.anchor.charStart, c.anchor.charEnd) !== c.text) {
      selfMismatches += 1;
    }
  }
  console.log(`self-check ${selfMismatches === 0 ? "PASS" : `FAIL (${selfMismatches})`}`);

  // Sample spread across the whole document rather than the first N — a
  // divergence that starts mid-document is exactly what this is hunting.
  const SAMPLES = 120;
  const step = Math.max(1, Math.floor(chunks.length / SAMPLES));
  const samples = chunks
    .filter((_, i) => i % step === 0)
    .slice(0, SAMPLES)
    .map((c) => ({
      ordinal: c.ordinal,
      charStart: c.anchor.charStart,
      charEnd: c.anchor.charEnd,
      pageStart: c.anchor.pageStart,
      pageEnd: c.anchor.pageEnd,
      // A short interior slice: chunk boundaries can land on whitespace, which
      // resolves to no rect and would read as a false failure.
      probeStart: c.anchor.charStart + 8,
      probeEnd: Math.min(c.anchor.charStart + 68, c.anchor.charEnd),
      probeText: parsed.normalizedText.slice(
        c.anchor.charStart + 8,
        Math.min(c.anchor.charStart + 68, c.anchor.charEnd),
      ),
    }))
    .filter((s) => s.probeEnd > s.probeStart && s.probeText.trim().length > 20);

  const payload = {
    contentHash,
    pdfjsVersion: parsed.pdfjsVersion,
    normalizationVersion: parsed.normalizationVersion,
    pageSeparator: PAGE_SEPARATOR,
    pageCount: parsed.pageCount,
    totalChars: parsed.normalizedText.length,
    pageOffsets: parsed.pageOffsets,
    textSha256: createHash("sha256").update(parsed.normalizedText).digest("hex"),
    chunkCount: chunks.length,
    samples,
  };

  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(`\nwrote      ${OUT}`);
  console.log(`samples    ${samples.length}`);
  console.log(`text sha   ${payload.textSha256}`);
}

main().catch((error: unknown) => {
  console.error("parse-corpus failed:", error);
  process.exit(1);
});
