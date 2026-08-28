// PDF parsing: text per page, outline, page count, thumbnails, OCR fallback.

export interface ParsedPage {
  pageNumber: number;
  text: string;
}

export interface ParsedOutlineNode {
  id: string;
  parentId: string | null;
  title: string;
  level: number;
  page: number;
  charStart: number | null;
}

export interface ParsedDocument {
  pageCount: number;
  pages: ParsedPage[];
  outline: ParsedOutlineNode[];
  /**
   * Char offset at which each page begins in the normalized full text.
   * pageOffsets[0] is page 1. This is what turns a document-wide chunk anchor
   * back into a page for highlighting; it cannot be reconstructed later
   * without reparsing, so the parser must emit it.
   */
  pageOffsets: number[];
  normalizedText: string;
  detectedLanguage: string | null;
  ocrApplied: boolean;
}

export interface PdfService {
  parse(input: { buffer: Buffer; allowOcr: boolean }): Promise<ParsedDocument>;
  pageCount(buffer: Buffer): Promise<number>;
  renderThumbnail(input: { buffer: Buffer; page: number }): Promise<Buffer>;
}

// TODO(phase-2-impl): choose the parser and implement. The renderer decision is
// tracked separately in docs/adr/0001-pdf-renderer.md — that ADR is about the
// CLIENT-side renderer; this is the server-side extractor and they need not be
// the same library.
export function createPdfService(): PdfService {
  throw new Error("PdfService not implemented");
}
