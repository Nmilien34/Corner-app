// Worker process. Claims jobs with an atomic lease, runs the registered
// handler, and applies backoff on failure.
//
// The claim is one findOneAndUpdate, which is what makes this safe without
// Redis: two workers cannot claim the same job because the filter requires the
// job still be pending and the update flips it in the same operation.

import { env } from "../config/env";
import { connectToDatabase, disconnectFromDatabase } from "../db/connect";
import { buildInfo } from "../lib/build-info";
import { logger } from "../lib/logger";
import { ProcessingJobModel } from "../models";
import { assertRegistryComplete, JobNotImplementedError, jobHandlers } from "./registry";
import { reportVectorIndexStatus } from "./vector-index-check";
import { assertExpectedBucket } from "../services/storage.service";

let running = false;
let stopping = false;

function backoffMs(attempt: number): number {
  // Exponential with a ceiling: 2s, 4s, 8s, ... capped at 5 minutes.
  return Math.min(2_000 * 2 ** Math.max(0, attempt - 1), 300_000);
}

async function claimNextJob(leaseId: string) {
  const now = new Date();

  return ProcessingJobModel.findOneAndUpdate(
    {
      status: "pending",
      nextRunAt: { $lte: now },
    },
    {
      $set: {
        status: "processing",
        leaseId,
        leaseExpiresAt: new Date(now.getTime() + env.WORKER_LEASE_SECONDS * 1000),
        startedAt: now,
      },
      $inc: { attempts: 1 },
    },
    { sort: { priority: -1, nextRunAt: 1 }, new: true },
  );
}

/** Returns jobs whose worker died holding the lease. */
async function reapExpiredLeases(): Promise<number> {
  const result = await ProcessingJobModel.updateMany(
    { status: "processing", leaseExpiresAt: { $lt: new Date() } },
    { $set: { status: "pending" }, $unset: { leaseId: "", leaseExpiresAt: "" } },
  );

  if (result.modifiedCount > 0) {
    logger.warn({ count: result.modifiedCount }, "reclaimed expired job leases");
  }

  return result.modifiedCount;
}

async function runOnce(leaseId: string): Promise<boolean> {
  const job = await claimNextJob(leaseId);
  if (!job) return false;

  const handler = jobHandlers[job.type];
  const jobLogger = logger.child({ jobId: job.id, type: job.type, attempt: job.attempts });

  try {
    await handler(job.payload, {
      jobId: String(job.id),
      attempt: job.attempts,
      logger: jobLogger,
    });

    job.set({ status: "done", completedAt: new Date(), leaseId: undefined, leaseExpiresAt: undefined });
    await job.save();
    jobLogger.info("job completed");
  } catch (error) {
    // A missing handler body is not a transient fault. Retrying it forever
    // would bury real failures in scaffold noise, so it goes straight to
    // terminal.
    const terminal =
      error instanceof JobNotImplementedError || job.attempts >= job.maxAttempts;

    job.set({
      status: terminal ? "terminal_failure" : "retryable_failure",
      lastError: error instanceof Error ? error.message : String(error),
      leaseId: undefined,
      leaseExpiresAt: undefined,
      ...(terminal ? {} : { status: "pending", nextRunAt: new Date(Date.now() + backoffMs(job.attempts)) }),
    });
    await job.save();

    if (terminal) {
      jobLogger.error({ err: error }, "job failed terminally");
    } else {
      jobLogger.warn({ err: error }, "job failed, will retry");
    }
  }

  return true;
}

async function loop(): Promise<void> {
  const leaseId = `${process.pid}-${Date.now()}`;

  while (!stopping) {
    try {
      await reapExpiredLeases();

      let worked = false;
      for (let slot = 0; slot < env.WORKER_CONCURRENCY; slot += 1) {
        if (await runOnce(leaseId)) worked = true;
      }

      if (!worked) {
        await new Promise((resolve) =>
          setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS),
        );
      }
    } catch (error) {
      logger.error({ err: error }, "worker loop error");
      await new Promise((resolve) =>
        setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS),
      );
    }
  }
}

export async function startWorker(): Promise<void> {
  if (running) return;
  running = true;

  assertRegistryComplete();
  // The worker is the process that DELETES. A sweep pointed at another
  // app's bucket is unrecoverable, so this refuses to start before it can.
  assertExpectedBucket();
  await connectToDatabase();

  // Warn, do not crash. Parsing, narration and action items all work without
  // the vector index; only chat needs it.
  await reportVectorIndexStatus();

  // Same identity the API reports at /healthz, so the two can be compared
  // directly. They build from one commit but deploy independently.
  const build = buildInfo("corner-worker");
  logger.info(
    {
      service: build.service,
      commit: build.commitShort,
      startedAt: build.startedAt,
      nodeEnv: build.nodeEnv,
      concurrency: env.WORKER_CONCURRENCY,
      pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
      handlers: Object.keys(jobHandlers).length,
      handlerNames: Object.keys(jobHandlers).join(","),
    },
    "corner worker started",
  );

  await loop();
}

async function main(): Promise<void> {
  const shutdown = (signal: string): void => {
    logger.info({ signal }, "worker shutting down");
    stopping = true;
    setTimeout(() => {
      void disconnectFromDatabase().finally(() => process.exit(0));
    }, 1_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await startWorker();
}

if (require.main === module) {
  main().catch((error: unknown) => {
    logger.error({ err: error }, "fatal worker error");
    process.exit(1);
  });
}
