// Orchestrates: fetch chunks -> build script -> segment -> TTS each segment ->
// upload -> assemble manifest.

import type { NarrationMode, TimingCue } from "@corner/shared";

export interface NarrationManifestSegment {
  ordinal: number;
  chapterTitle: string | null;
  outlineNodeId: string | null;
  url: string;
  durationSeconds: number;
  startOffsetSeconds: number;
  /**
   * Follow-along cues, ALREADY SPLIT PER PAGE.
   *
   * AudioSegment.timingMap persists raw document-wide charStart/charEnd. The
   * manifest decomposes each cue through splitRangeByPage before it goes over
   * the wire, so the player resolves each span against one rendered page and
   * never needs pageOffsets. Verbatim mode only; podcast mode returns [].
   */
  cues: TimingCue[];
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

  /**
   * TODO(phase-2-impl): decompose every persisted cue with splitRangeByPage
   * using DocumentContent.pageOffsets before returning. A cue that crosses a
   * page boundary must arrive as two spans, not one — the client cannot split
   * it and will silently highlight only the first page's portion.
   */
  buildManifest(narrationId: string): Promise<NarrationManifest>;
  cancel(narrationId: string): Promise<void>;
}

// TODO(phase-2-impl): implement the orchestration described in BRIEF
// "Services layer".
export function createNarrationService(): NarrationService {
  throw new Error("NarrationService not implemented");
}
