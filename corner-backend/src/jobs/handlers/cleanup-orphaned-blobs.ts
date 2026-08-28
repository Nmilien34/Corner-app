// Reclaims storage for DocumentContent nothing points at any more.
//
// THIS HANDLER IS NEW. It was never implemented and never disabled — every job
// in the registry was a `notImplemented` stub, so there was no prior
// shared-bucket condition suppressing it. It is being written now because
// Corner has its own bucket and its own IAM user scoped to it, so an unattended
// delete can no longer reach another application's data.
//
// WHY AN ANTI-JOIN AND NOT A REFERENCE COUNT
//
// A mutable counter is incremented and decremented by two racing paths: a
// delete can reach zero while a concurrent upload is creating a new reference,
// and the blob gets swept out from under a live library entry. Making that safe
// needs a transaction around every upload and every delete.
//
// Asking the question at sweep time is correct by construction. Content younger
// than ORPHAN_GRACE_HOURS is never a candidate, so the window between creating
// content and creating its Document cannot be swept — no lock ordering, no
// counter to drift.
//
// DRY RUN IS THE DEFAULT. This deletes user documents unattended, so it reports
// what it WOULD remove and stops, until ORPHAN_SWEEP_DRY_RUN is explicitly set
// to "false" after a real run's list has been read.

import { env } from "../../config/env";
import { DocumentContentModel, DocumentModel } from "../../models";
import { contentDeletePrefix } from "../../services/storage-keys";
import { createStorageService } from "../../services/storage.service";
import type { JobContext } from "../registry";

export interface OrphanCandidate {
  contentId: string;
  contentHash: string;
  prefix: string;
  ageHours: number;
}

export interface OrphanSweepResult {
  dryRun: boolean;
  examined: number;
  orphaned: number;
  deletedContent: number;
  deletedObjects: number;
  candidates: OrphanCandidate[];
}

export async function sweepOrphanedBlobs(context: JobContext): Promise<OrphanSweepResult> {
  const { logger } = context;
  const dryRun = env.ORPHAN_SWEEP_DRY_RUN;
  const cutoff = new Date(Date.now() - env.ORPHAN_GRACE_HOURS * 3_600_000);

  // The age filter IS the safety property, so it lives in the query rather
  // than in code a later refactor could reorder away.
  const candidates = await DocumentContentModel.find({ updatedAt: { $lt: cutoff } })
    .select({ _id: 1, contentHash: 1, updatedAt: 1 })
    .sort({ updatedAt: 1 })
    .limit(env.ORPHAN_SWEEP_MAX_PER_RUN * 4)
    .lean();

  const result: OrphanSweepResult = {
    dryRun,
    examined: candidates.length,
    orphaned: 0,
    deletedContent: 0,
    deletedObjects: 0,
    candidates: [],
  };

  if (candidates.length === 0) {
    logger.info({ graceHours: env.ORPHAN_GRACE_HOURS }, "orphan sweep: no content old enough");
    return result;
  }

  // One query for every referenced id, not one per candidate.
  const referenced = new Set(
    (
      await DocumentModel.find({ contentId: { $in: candidates.map((c) => c._id) } })
        .select({ contentId: 1 })
        .lean()
    ).map((d) => String(d.contentId)),
  );

  const orphans = candidates
    .filter((c) => !referenced.has(String(c._id)))
    .slice(0, env.ORPHAN_SWEEP_MAX_PER_RUN);

  result.orphaned = orphans.length;
  result.candidates = orphans.map((c) => ({
    contentId: String(c._id),
    contentHash: c.contentHash,
    prefix: contentDeletePrefix(c.contentHash),
    ageHours: Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 3_600_000),
  }));

  if (orphans.length === 0) {
    logger.info({ examined: candidates.length }, "orphan sweep: nothing unreferenced");
    return result;
  }

  if (dryRun) {
    logger.warn(
      {
        examined: candidates.length,
        wouldDelete: orphans.length,
        graceHours: env.ORPHAN_GRACE_HOURS,
      },
      "orphan sweep DRY RUN — nothing was deleted",
    );
    // One line per candidate rather than one array, so the list is greppable
    // in Render's log viewer. This output exists to be READ before the sweep
    // is given permission to act.
    for (const c of result.candidates) {
      logger.warn(
        { contentId: c.contentId, prefix: c.prefix, ageHours: c.ageHours },
        "orphan sweep would delete",
      );
    }
    return result;
  }

  const storage = createStorageService();

  for (const orphan of result.candidates) {
    // Re-check immediately before deleting. A job can sit queued, and a
    // document created between the query and now would otherwise lose its blob.
    if (await DocumentModel.exists({ contentId: orphan.contentId })) {
      logger.info({ contentId: orphan.contentId }, "orphan sweep: re-referenced, skipping");
      continue;
    }

    // Objects BEFORE the record. If the process dies between the two, the
    // content row survives and the next sweep retries. The reverse would strand
    // blobs no record points at — invisible to every future sweep.
    const removed = await storage.deletePrefix(orphan.prefix);
    await DocumentContentModel.deleteOne({ _id: orphan.contentId });

    result.deletedObjects += removed;
    result.deletedContent += 1;
    logger.info({ contentId: orphan.contentId, objects: removed }, "orphan sweep: deleted");
  }

  return result;
}
