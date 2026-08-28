// Creates the Atlas Vector Search index.
//
//   npm run atlas:index -w @corner/backend           # show status
//   npm run atlas:index -w @corner/backend -- --create
//
// docs/atlas-vector-index.md previously said this could only be done by hand in
// the Atlas UI. That is no longer true: the driver exposes createSearchIndex,
// so the definition can live in version control next to the schema it indexes
// rather than in someone's browser history.
//
// It stays a deliberate, flagged action rather than something a deploy does,
// because building an index over a large collection is expensive and a
// definition change means a rebuild.

import mongoose from "mongoose";

import { env } from "../config/env";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "@corner/shared";
import { VECTOR_INDEX_NAME } from "../jobs/vector-index-check";

const COLLECTION = "documentchunks";

const DEFINITION = {
  fields: [
    {
      type: "vector",
      path: "embedding",
      numDimensions: EMBEDDING_DIMENSIONS,
      similarity: "cosine",
    },
    // Both filters are MANDATORY, not tuning.
    //
    // contentId scopes retrieval to the document being asked about. Without it
    // a query searches every chunk in the cluster and can cite another user's
    // file — for a corpus of contracts and medical records that is a
    // disclosure, not a relevance bug.
    //
    // parseVersion keeps results inside one parse generation, so anchors from
    // two different coordinate systems are never blended.
    { type: "filter", path: "contentId" },
    { type: "filter", path: "parseVersion" },
  ],
};

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error("no database handle");

  const collection = db.collection(COLLECTION);

  console.log(`\n  database   ${mongoose.connection.name}`);
  console.log(`  collection ${COLLECTION}`);
  console.log(`  index      ${VECTOR_INDEX_NAME}`);
  console.log(`  model      ${EMBEDDING_MODEL} @ ${EMBEDDING_DIMENSIONS} dims\n`);

  let existing: { name?: string; status?: string; queryable?: boolean }[] = [];
  try {
    existing = (await collection.listSearchIndexes().toArray()) as typeof existing;
  } catch (error) {
    console.error("  Could not list search indexes — is this Atlas?");
    console.error(`  ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }

  const found = existing.find((i) => i.name === VECTOR_INDEX_NAME);

  if (found) {
    console.log(`  EXISTS   status=${found.status} queryable=${found.queryable}`);
    if (found.status !== "READY") {
      console.log("  Still building — document chat fails until it is READY.\n");
    } else {
      console.log("  Ready.\n");
    }
    await mongoose.disconnect();
    return;
  }

  if (!process.argv.includes("--create")) {
    console.log("  MISSING. Re-run with --create to build it.\n");
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("  Creating...");
  await collection.createSearchIndex({
    name: VECTOR_INDEX_NAME,
    type: "vectorSearch",
    definition: DEFINITION,
  });

  // Building is asynchronous; report the transition rather than claiming done.
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((r) => setTimeout(r, 3000));
    const list = (await collection.listSearchIndexes().toArray()) as typeof existing;
    const idx = list.find((i) => i.name === VECTOR_INDEX_NAME);
    console.log(`    status=${idx?.status ?? "?"} queryable=${idx?.queryable ?? false}`);
    if (idx?.queryable) {
      console.log("\n  READY.\n");
      await mongoose.disconnect();
      return;
    }
  }

  console.log("\n  Created but not queryable yet — check the Atlas UI.\n");
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error("create-vector-index failed:", error);
  process.exit(1);
});
