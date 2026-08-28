// Synthesizes a script segment to audio and returns duration plus timing data.
// Provider-agnostic: no vendor SDK type may appear in this signature.

export interface TtsTimingCue {
  startSeconds: number;
  endSeconds: number;
  charStart: number;
  charEnd: number;
}

export interface TtsResult {
  audio: Buffer;
  durationSeconds: number;
  /**
   * Populated for verbatim narration only. Offsets are in the same
   * document-wide coordinate space as DocumentChunk.anchor, so a player
   * position resolves to a text span and then to a page through
   * DocumentContent.pageOffsets.
   *
   * Podcast mode is a generated script that does not correspond to document
   * text, so it returns no cues and the reader does not follow along.
   */
  timingMap: TtsTimingCue[];
  charactersConsumed: number;
}

export interface TtsVoice {
  id: string;
  label: string;
  language: string;
  /** Gates ACCESS to every narration generated with this voice, forever. */
  tier: "free" | "pro";
}

export interface TtsService {
  listVoices(): Promise<TtsVoice[]>;
  synthesize(input: {
    text: string;
    voiceId: string;
    speed: number;
    withTimings: boolean;
    /** Offset of `text` within the normalized full text, so cues come back absolute. */
    charOffset: number;
  }): Promise<TtsResult>;
}

// TODO(phase-2-impl): choose a provider and implement. Selection criteria and
// alternatives belong in docs/adr/0003-tts-provider.md.
export function createTtsService(): TtsService {
  throw new Error("TtsService not implemented");
}
