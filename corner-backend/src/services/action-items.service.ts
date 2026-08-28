// Document-type-aware extraction, dedupe, confidence scoring.
//
// The extraction is content-level and cacheable; the resulting ActionItem rows
// are per-user because the user edits them. That split is the free-rider risk:
// fanning a cached extraction out to a second user costs no LLM call, so the
// entitlement gate belongs on the FAN-OUT and not on the extraction. See
// docs/OPEN-QUESTIONS.md OQ-004.

import type { DocumentType } from "@corner/shared";

export interface ExtractedActionItem {
  extractionKey: string;
  title: string;
  detail?: string;
  sourcePage: number | null;
  sourceChapter: string | null;
  outlineNodeId: string | null;
  confidence: number | null;
  suggestedDueDate: Date | null;
}

export interface ActionItemsService {
  /** Content-level and cacheable. Prompt branches on documentType. */
  extractForContent(input: {
    contentId: string;
    parseVersion: number;
    documentType: DocumentType;
  }): Promise<ExtractedActionItem[]>;

  /**
   * Writes per-user rows from an extraction, updating rather than duplicating
   * where extractionKey already exists, and never clobbering an item whose
   * `editedByUser` flag is set.
   */
  fanOutToUser(input: {
    documentId: string;
    ownerId: string;
    items: ExtractedActionItem[];
  }): Promise<{ created: number; updated: number }>;
}

// TODO(phase-2-impl): implement. Extraction prompts are versioned files in
// src/prompts/, one per document type, per BRIEF.
export function createActionItemsService(): ActionItemsService {
  throw new Error("ActionItemsService not implemented");
}
