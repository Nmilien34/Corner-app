import mongoose from "mongoose";

import { env } from "../config/env";
import { logger } from "../lib/logger";

/**
 * Connects, then refuses to continue if the URI resolved to the wrong database.
 *
 * The assertion exists because Corner shares an Atlas cluster with a shipped
 * application. Two ordinary mistakes put Corner's collections somewhere they
 * must never appear, and neither one produces an error on its own:
 *
 *   mongodb+srv://.../?retryWrites=true      -> connects to `test`
 *   mongodb+srv://.../leanient?...           -> connects to the neighbour's db
 *
 * Both log "mongo connected" and serve traffic happily. The damage is only
 * visible later, in the wrong collection, on a cluster with real users on it.
 * Failing at boot is recoverable; discovering it afterwards may not be.
 */
export async function connectToDatabase(): Promise<void> {
  mongoose.set("strictQuery", true);

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: 10_000,
  });

  const actual = mongoose.connection.name;

  if (actual !== env.MONGODB_DB_NAME) {
    await mongoose.disconnect();
    throw new Error(
      [
        "Refusing to start: connected to the wrong database.",
        "",
        `  expected: ${env.MONGODB_DB_NAME}`,
        `  actual:   ${actual}`,
        "",
        actual === "test"
          ? "  `test` means MONGODB_URI has no database path. Add it:\n" +
            "      mongodb+srv://user:pass@host/" + env.MONGODB_DB_NAME + "?retryWrites=true&w=majority"
          : "  MONGODB_URI points at another application's database. Corner shares\n" +
            "  a cluster; writing here would put Corner's collections inside it.",
      ].join("\n"),
    );
  }

  logger.info(
    { database: actual, maxPoolSize: env.MONGODB_MAX_POOL_SIZE },
    "mongo connected",
  );
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info("mongo disconnected");
}

/** Backs `GET /healthz`. 1 is mongoose's "connected" readyState. */
export function isDatabaseReachable(): boolean {
  return mongoose.connection.readyState === 1;
}
