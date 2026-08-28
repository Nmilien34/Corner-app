// Orchestrates: fetch chunks -> build script -> segment -> TTS each segment ->
// upload -> assemble manifest.

import type { NarrationMode } from "@corner/shared";

export interface NarrationManifestSegment {
  ordinal: number;
  chapterTitle: string | null;
  outlineNodeId: string | null;
  url: string;
  durationSeconds: number;
  startOffsetSeconds: number;
}

export interface NarrationManifest {
  narrationId: string;
  mode: NarrationMode;
  voiceId: string;
  totalDurationSeconds: number;
  segments: NarrationManifestSegment[];
}

export interface NarrationService {
  /**
   * Returns the existing job when one matches, or creates one.
   *
   * IMPORTANT: this is the deduped path, so it is exactly where the free-rider
   * bypass would live. Entitlement is NOT decided here. Callers gate on the
   * resolved job's `voiceTier` via assertTierAccess, on the read, so a cache
   * hit is gated identically to a cold generation.
   */
  requestNarration(input: {
    contentId: string;
    parseVersion: number;
    requestedBy: string;
    mode: NarrationMode;
    voiceId: string;
    speed: number;
  }): Promise<{ narrationId: string; created: boolean }>;

  buildManifest(narrationId: string): Promise<NarrationManifest>;
  cancel(narrationId: string): Promise<void>;
}

// TODO(phase-2-impl): implement the orchestration described in BRIEF
// "Services layer".
export function createNarrationService(): NarrationService {
  throw new Error("NarrationService not implemented");
}
