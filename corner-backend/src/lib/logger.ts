import pino from "pino";

import { env } from "../config/env";

/**
 * Structured JSON logs with an ISO timestamp and a `service` base field,
 * matching Pepta so both backends aggregate the same way.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: "corner-backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export type Logger = typeof logger;
