import {
  idParamSchema,
  jobIdParamSchema,
  startNarrationRequestSchema,
} from "@corner/shared";
import { Router } from "express";

import { loadUser, requireAuth } from "../middleware/auth.middleware";
import { requireEntitlement } from "../middleware/require-entitlement.middleware";
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
  // TODO(phase-2-impl): load the job, then assertTierAccess(user,
  // job.voiceTier) before returning anything. Status leaks less than a
  // manifest, but it still confirms that a premium narration exists and is
  // ready, so it is gated on the same tier.
  sendNotImplemented(res, "Return narration status and progress (gated on job.voiceTier)");
});

narrationRouter.get(
  "/:jobId/manifest",
  validateParams(jobIdParamSchema),
  (_req, res) => {
    // TODO(phase-2-impl): load the job, assertTierAccess(user, job.voiceTier),
    // and only then build the manifest.
    //
    // THIS IS THE PRIMARY BYPASS TARGET. The manifest carries presigned segment
    // URLs — handing it to an unentitled caller gives away the audio itself,
    // and no later check can take it back. A cache hit is still a gated read.
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

export const gatedNarrationExample = requireEntitlement;
