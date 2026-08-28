// App factory. Exported separately from the process entry so tests can build an
// app without binding a port or starting schedulers — Pepta's split.

import cors from "cors";
import express from "express";
import type { Express } from "express";

import { errorHandler, notFoundHandler } from "./middleware/error.middleware";
import { requestLogger } from "./middleware/request-logger.middleware";
import { actionItemsRouter, documentActionItemsRouter } from "./routes/action-items.routes";
import { authRouter } from "./routes/auth.routes";
import { documentChatRouter } from "./routes/chat.routes";
import { documentsRouter } from "./routes/documents.routes";
import { healthRouter } from "./routes/health.routes";
import { meRouter } from "./routes/me.routes";
import {
  documentNarrationRouter,
  narrationRouter,
  voicesRouter,
} from "./routes/narration.routes";
import { webhooksRouter } from "./routes/webhooks.routes";
import helmet from "helmet";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger);

  // Documents are private user content; nothing the API returns should be
  // cached by an intermediary.
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  // Unversioned. Render's health check is infrastructure, not product API.
  app.use(healthRouter);

  const v1 = express.Router();

  v1.use("/auth", authRouter);
  v1.use("/me", meRouter);
  v1.use("/documents", documentsRouter);

  // Document-scoped sub-resources. Mounted separately so each concern keeps
  // its own router file rather than one router accumulating every feature.
  v1.use("/documents/:id", documentNarrationRouter);
  v1.use("/documents/:id", documentActionItemsRouter);
  v1.use("/documents/:id", documentChatRouter);

  v1.use("/narration", narrationRouter);
  v1.use("/voices", voicesRouter);
  v1.use("/action-items", actionItemsRouter);
  v1.use("/webhooks", webhooksRouter);

  app.use("/v1", v1);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
