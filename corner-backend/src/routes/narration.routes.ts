import {
  idParamSchema,
  jobIdParamSchema,
  startNarrationRequestSchema,
} from "@corner/shared";
import { Router } from "express";

import { loadUser, requireAuth } from "../middleware/auth.middleware";
import { requireQuota } from "../middleware/quota.middleware";
import { aiRateLimit } from "../middleware/rate-limit.middleware";
import { validateBody, validateParams } from "../middleware/validate.middleware";
import { sendNotImplemented } from "../lib/responses";

export const narrationRouter: Router = Router();

narrationRouter.use(requireAuth, loadUser);

// Mounted under /documents/:id in app.ts.
export const documentNarrationRouter: Router = Router({ mergeParams: true });

documentNarrationRouter.post(
  "/narration",
  validateParams(idParamSchema),
  validateBody(startNarrationRequestSchema),
  aiRateLimit,
  requireQuota("ttsSeconds"),
  (_req, res) => {
    // TODO(phase-2-impl): resolve the requested voice's tier from
    // tts.service.listVoices(), assertTierAccess on it BEFORE requesting the
    // narration, then call narration.service.requestNarration.
    //
    // The gate must run on the resolved VOICE TIER, not on whether this call
    // ends up creating work. requestNarration is deduped, so a free user
    // asking for a premium voice someone else already generated returns an
    // existing job at zero cost — and must still be refused here.
    sendNotImplemented(res, "Start or join a narration job for this document");
  },
);

narrationRouter.get("/:jobId", validateParams(jobIdParamSchema), (_req, res) => {
  // TODO(phase-2-impl): FIRST TWO STATEMENTS OF THIS HANDLER, in this order:
  //
  //   const job = await NarrationJobModel.findById(req.params.jobId);
  //   if (!job) throw new NotFoundError();
  //   assertTierAccess(req.currentUser, job.voiceTier);   // <-- before ANY read
  //
  // Only then return status and progress.
  //
  // Unlike chat and action-items, narration CANNOT enforce this in the
  // middleware chain: the required tier is a property of the stored job, and
  // the job is not loaded until the handler runs. The gate therefore lives in
  // the handler body, which makes it the one gate a future edit can silently
  // drop without a missing-middleware diff to notice.
  //
  // Status leaks less than a manifest, but it still confirms that a premium
  // narration exists and is ready, so it gates on the same tier.
  sendNotImplemented(res, "Return narration status and progress (gated on job.voiceTier)");
});

narrationRouter.get(
  "/:jobId/manifest",
  validateParams(jobIdParamSchema),
  (_req, res) => {
    // TODO(phase-2-impl): FIRST THREE STATEMENTS OF THIS HANDLER, in this order,
    // before the manifest is built and before any URL is signed:
    //
    //   const job = await NarrationJobModel.findById(req.params.jobId);
    //   if (!job) throw new NotFoundError();
    //   assertTierAccess(req.currentUser, job.voiceTier);   // <-- FIRST
    //
    // Only then call narrationService.buildManifest(job.id).
    //
    // THIS LEAK IS IRREVERSIBLE. The manifest carries PRESIGNED SEGMENT URLS.
    // Once one reaches an unentitled caller it is a bearer credential that
    // works until it expires — it cannot be recalled, revoked per-caller, or
    // undone by a later check, and it can be copied out of the response and
    // shared. Every other gate in this API protects a read that can be refused
    // again next time; this one protects a handout.
    //
    // Unlike chat, summary and action-items — which enforce in the middleware
    // chain, where a missing requireEntitlement() is visible in the diff — the
    // required tier here is a property of the stored job and is not known until
    // the job is loaded. The gate can only live in the handler body, so it is
    // the easiest one to lose in a refactor and the most expensive one to lose.
    // Do not reorder it below the manifest build for any reason.
    sendNotImplemented(res, "Return chapters, segment URLs, durations and timing maps (gated on job.voiceTier)");
  },
);

narrationRouter.delete("/:jobId", validateParams(jobIdParamSchema), (_req, res) => {
  // TODO(phase-2-impl): a user may cancel a job THEY requested. Deleting shared
  // generated audio must not be reachable from here — another user's library
  // entry may point at the same content.
  sendNotImplemented(res, "Cancel a narration this user requested");
});

export const voicesRouter: Router = Router();

voicesRouter.get("/", requireAuth, loadUser, (_req, res) => {
  // TODO(phase-2-impl): return the catalogue with each voice's tier. Return ALL
  // voices with their tier rather than filtering — the app renders locked
  // premium voices as an upgrade prompt, and the tier is what the access gate
  // later enforces.
  sendNotImplemented(res, "List available voices with their entitlement tier");
});
