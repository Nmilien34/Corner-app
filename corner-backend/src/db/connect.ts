import mongoose from "mongoose";

import { env } from "../config/env";
import { logger } from "../lib/logger";

export async function connectToDatabase(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI);
  logger.info("mongo connected");
}

export async function disconnectFromDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info("mongo disconnected");
}

/** Backs `GET /healthz`. 1 is mongoose's "connected" readyState. */
export function isDatabaseReachable(): boolean {
  return mongoose.connection.readyState === 1;
}
