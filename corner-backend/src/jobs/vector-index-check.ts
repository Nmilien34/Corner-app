// Startup check for the Atlas Vector Search index.
//
// The index CANNOT be created from application code, so a deploy that skips it
// succeeds, boots healthy, passes its health check, and then fails at the first
// chat message — potentially days later, and the failure looks like a broken AI
// feature rather than missing infrastructure.
//
// This check turns that into a loud line at startup. It WARNS, it does not
// crash: parsing, narration and action items all work without the vector index,
// so refusing to start would take out four working features to protect one.

import mongoose from "mongoose";

import { logger } from "../lib/logger";

export const VECTOR_INDEX_NAME = "chunk_embedding_index";

export interface VectorIndexStatus {
  present: boolean;
  queryable: boolean;
  detail: string;
}

export async function checkVectorIndex(): Promise<VectorIndexStatus> {
  const collection = mongoose.connection.db?.collection("documentchunks");

  if (!collection) {
    return {
      present: false,
      queryable: false,
      detail: "No database handle; cannot inspect search indexes.",
    };
  }

  try {
    // listSearchIndexes is the Atlas-only command. On a local mongod it throws
    // rather than returning an empty list, which is a different situation and
    // is reported differently below.
    const cursor = collection.listSearchIndexes();
    const indexes = (await cursor.toArray()) as { name?: string; status?: string }[];
    const match = indexes.find((index) => index.name === VECTOR_INDEX_NAME);

    if (!match) {
      return {
        present: false,
        queryable: false,
        detail:
          `Atlas reports no search index named "${VECTOR_INDEX_NAME}". ` +
          "Document chat will fail at query time. Create it per docs/atlas-vector-index.md.",
      };
    }

    const queryable = match.status === "READY";
    return {
      present: true,
      queryable,
      detail: queryable
        ? `Vector index "${VECTOR_INDEX_NAME}" is READY.`
        : `Vector index "${VECTOR_INDEX_NAME}" exists but its status is ` +
          `"${match.status ?? "unknown"}" — it is still building and chat will fail until it is READY.`,
    };
  } catch (error) {
    // Almost always a local mongod, which has no Atlas Search at all.
    return {
      present: false,
      queryable: false,
      detail:
        "Could not list search indexes — this database does not support Atlas Search " +
        "(expected on a local mongod). Document chat will not work here. " +
        `Underlying error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Logs the result at a level matching how bad it is. Never throws. */
export async function reportVectorIndexStatus(): Promise<VectorIndexStatus> {
  const status = await checkVectorIndex();

  if (status.present && status.queryable) {
    logger.info({ index: VECTOR_INDEX_NAME }, status.detail);
    return status;
  }

  logger.warn(
    {
      index: VECTOR_INDEX_NAME,
      present: status.present,
      queryable: status.queryable,
      remediation: "docs/atlas-vector-index.md",
    },
    `VECTOR INDEX NOT USABLE — ${status.detail}`,
  );

  return status;
}
