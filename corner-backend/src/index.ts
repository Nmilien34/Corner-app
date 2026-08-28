// Process entry: connect, serve, and shut down cleanly.

import { env } from "./config/env";
import { connectToDatabase, disconnectFromDatabase } from "./db/connect";
import { logger } from "./lib/logger";
import { createApp } from "./app";

async function main(): Promise<void> {
  await connectToDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, "corner-backend listening");
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "shutting down");
    server.close(() => {
      void disconnectFromDatabase().finally(() => process.exit(0));
    });
    // Do not let a hung connection hold the process open past Render's window.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error({ err: error }, "fatal startup error");
    process.exit(1);
  });
}
