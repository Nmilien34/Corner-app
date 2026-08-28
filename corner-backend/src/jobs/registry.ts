// Job handler registry.
//
// Handlers are REGISTERED and WIRED here; their bodies are stubs. The worker
// resolves a job's type through this map, so an unregistered type fails fast at
// startup rather than silently sitting in the queue forever.

import type { JobType } from "@corner/shared";
import { JOB_TYPES } from "@corner/shared";

import type { Logger } from "../lib/logger";

export interface JobContext {
  jobId: string;
  attempt: number;
  logger: Logger;
}

export type JobHandler = (
  payload: Record<string, unknown>,
  context: JobContext,
) => Promise<void>;

function notImplemented(type: JobType, todo: string): JobHandler {
  return async () => {
    // Throwing marks the job retryable, which is wrong for "never built" — the
    // worker treats NotImplemented as terminal so the scaffold does not
    // generate infinite retry noise. See worker.ts.
    throw new JobNotImplementedError(type, todo);
  };
}

export class JobNotImplementedError extends Error {
  public readonly jobType: JobType;
  public readonly todo: string;

  public constructor(jobType: JobType, todo: string) {
    super(`Job handler "${jobType}" is not implemented yet: ${todo}`);
    this.name = "JobNotImplementedError";
    this.jobType = jobType;
    this.todo = todo;
  }
}

export const jobHandlers: Record<JobType, JobHandler> = {
  "parse-document": notImplemented(
    "parse-document",
    "Fetch the blob, extract text/outline/pageOffsets, write DocumentContent, enqueue embed-chunks",
  ),
  "embed-chunks": notImplemented(
    "embed-chunks",
    "Batch-embed chunks missing embeddedAt; assert the provider's width equals EMBEDDING_DIMENSIONS",
  ),
  "generate-narration-script": notImplemented(
    "generate-narration-script",
    "Build a verbatim or podcast script from chunks, store it, enqueue synthesize-audio-segments",
  ),
  "synthesize-audio-segments": notImplemented(
    "synthesize-audio-segments",
    "TTS each segment, upload audio, write AudioSegment with absolute timing cues",
  ),
  "extract-action-items": notImplemented(
    "extract-action-items",
    "Run the document-type-specific extraction prompt, cache at content level, fan out per user",
  ),
  "generate-summary": notImplemented(
    "generate-summary",
    "Summarize a document or one outline node, write DocumentSummary",
  ),
  "cleanup-orphaned-blobs": notImplemented(
    "cleanup-orphaned-blobs",
    "Anti-join DocumentContent against Document.contentId, older than ORPHAN_GRACE_HOURS, delete blobs and derived artifacts",
  ),
};

/** Fails at boot if a type has no handler, rather than at dequeue time. */
export function assertRegistryComplete(): void {
  const missing = JOB_TYPES.filter((type) => !jobHandlers[type]);
  if (missing.length > 0) {
    throw new Error(`Unregistered job types: ${missing.join(", ")}`);
  }
}
