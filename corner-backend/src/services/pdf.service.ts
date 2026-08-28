// PDF parsing: text extraction, outline, page count, thumbnails.
//
// ============================================================================
// THE NORMALIZATION CONTRACT
// ============================================================================
//
// This is a CONTRACT, not an implementation detail. Corner stores character
// offsets computed here and resolves them to on-screen rectangles in the
// client's WebView. Both sides must produce character-identical text or every
// offset after the point of divergence is wrong — highlights land on the wrong
// words, narration follows the wrong sentence, citations point near but not at
// their source. Nothing throws.
//
// The rules, in full:
//
//   R1. A page's text is its pdf.js text items concatenated IN ORDER.
//   R2. Each item contributes exactly `item.str`, plus "\n" when `item.hasEOL`.
//   R3. Pages are joined with PAGE_SEPARATOR ("\n\n").
//   R4. pageOffsets[i] is the offset at which page i+1 begins, including the
//       separators before it.
//   R5. NOTHING ELSE IS DONE. No whitespace collapsing, no trimming, no
//       ligature expansion, no de-hyphenation, no unicode normalization, no
//       control-character stripping.
//
// R5 is the load-bearing rule and it is deliberately a rule about INACTION.
// Every transformation is a place two implementations can disagree by one
// character, and the client — running in a WebView with a rendered text layer
// — cannot cheaply reproduce arbitrary server-side rewriting. Keeping the
// contract at "concatenate and do nothing" makes agreement the default rather
// than something maintained.
//
// The consequence is that the stored text is rawer than a human would write.
// Ligatures stay as ligatures, hyphenated line breaks stay broken, running
// heads repeat on every page. That is correct: those are RETRIEVAL concerns,
// handled at embedding and prompt time on a copy, never by rewriting the text
// the offsets are anchored to.
//
// Identical extraction is guaranteed by both sides running the same pinned
// pdfjs-dist. See docs/PDFJS-VERSION.md.
// ============================================================================

import { NORMALIZATION_VERSION, PAGE_SEPARATOR } from "@corner/shared";

import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";
import type { PdfDocumentProxy, PdfOutlineEntry, PdfTextItem } from "./pdfjs-loader";
import { loadPdfjs } from "./pdfjs-loader";

export interface ParsedPage {
  pageNumber: number;
  /** This page's text alone, under R1/R2. */
  text: string;
  /** Offset of this page's first character in the normalized full text. */
  startOffset: number;
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
  /** R4. pageOffsets[0] === 0. */
  pageOffsets: number[];
  normalizedText: string;
  detectedLanguage: string | null;
  ocrApplied: boolean;
  normalizationVersion: number;
  pdfjsVersion: string;
}

export interface PdfService {
  parse(input: { buffer: Buffer; allowOcr?: boolean }): Promise<ParsedDocument>;
  pageCount(buffer: Buffer): Promise<number>;
  renderThumbnail(input: {
    buffer: Buffer;
    page?: number;
    maxWidth?: number;
  }): Promise<Buffer>;
}

/** Applies R1 and R2 to one page's items. */
export function pageTextFromItems(items: readonly PdfTextItem[]): string {
  let text = "";
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    text += item.str;
    if (item.hasEOL) text += "\n";
  }
  return text;
}

async function loadDocument(buffer: Buffer): Promise<PdfDocumentProxy> {
  const pdfjs = await loadPdfjs();
  try {
    return await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      // Server-side: no system fonts, no eval, no worker thread. Text
      // extraction does not need glyph rasterization.
      useSystemFonts: false,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;
  } catch (error) {
    throw new AppError(
      "pdf_parse_failed",
      `Could not open PDF: ${error instanceof Error ? error.message : String(error)}`,
      422,
    );
  }
}

/** Flattens pdf.js's nested outline into the stored shape. */
async function flattenOutline(
  doc: PdfDocumentProxy,
  entries: PdfOutlineEntry[] | null,
  pageOffsets: number[],
): Promise<ParsedOutlineNode[]> {
  if (!entries || entries.length === 0) return [];

  const nodes: ParsedOutlineNode[] = [];

  const resolvePage = async (dest: unknown): Promise<number | null> => {
    try {
      const target = typeof dest === "string" ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(target) || target.length === 0) return null;
      const index = await doc.getPageIndex(target[0]);
      return index + 1;
    } catch {
      // A broken destination is common in real PDFs and must not fail a parse.
      return null;
    }
  };

  const walk = async (
    list: PdfOutlineEntry[],
    parentId: string | null,
    level: number,
    path: string,
  ): Promise<void> => {
    for (let i = 0; i < list.length; i += 1) {
      const entry = list[i];
      if (!entry) continue;
      const id = path ? `${path}.${i}` : String(i);
      const page = (await resolvePage(entry.dest)) ?? 1;

      nodes.push({
        id,
        parentId,
        title: entry.title?.trim() || "(untitled)",
        level,
        page,
        charStart: pageOffsets[page - 1] ?? null,
      });

      if (entry.items?.length) await walk(entry.items, id, level + 1, id);
    }
  };

  await walk(entries, null, 0, "");
  return nodes;
}

export function createPdfService(): PdfService {
  return {
    async parse({ buffer, allowOcr = false }) {
      const pdfjs = await loadPdfjs();
      const doc = await loadDocument(buffer);

      try {
        const pages: ParsedPage[] = [];
        const pageOffsets: number[] = [];
        let normalizedText = "";
        let offset = 0;
        let charactersFound = 0;

        for (let n = 1; n <= doc.numPages; n += 1) {
          const page = await doc.getPage(n);
          const content = await page.getTextContent();
          const text = pageTextFromItems(content.items);

          pageOffsets.push(offset);
          pages.push({ pageNumber: n, text, startOffset: offset });

          normalizedText += text;
          charactersFound += text.trim().length;

          // R3/R4: the separator belongs to the gap, not to either page.
          if (n < doc.numPages) {
            normalizedText += PAGE_SEPARATOR;
            offset += text.length + PAGE_SEPARATOR.length;
          } else {
            offset += text.length;
          }

          page.cleanup();
        }

        const outline = await flattenOutline(doc, await doc.getOutline(), pageOffsets);

        // A PDF of scanned images yields almost no text. OCR is not built yet
        // — see docs/OPEN-QUESTIONS.md OQ-009 for why its offsets are an open
        // design question rather than a missing feature.
        const looksScanned = charactersFound < doc.numPages * 20;
        if (looksScanned && allowOcr) {
          logger.warn(
            { pages: doc.numPages, charactersFound },
            "document looks scanned but OCR is not implemented (OQ-009)",
          );
        }

        return {
          pageCount: doc.numPages,
          pages,
          outline,
          pageOffsets,
          normalizedText,
          detectedLanguage: null,
          ocrApplied: false,
          normalizationVersion: NORMALIZATION_VERSION,
          pdfjsVersion: pdfjs.version,
        };
      } finally {
        await doc.destroy();
      }
    },

    async pageCount(buffer) {
      const doc = await loadDocument(buffer);
      try {
        return doc.numPages;
      } finally {
        await doc.destroy();
      }
    },

    async renderThumbnail({ buffer, page = 1, maxWidth = 480 }) {
      // Rasterization needs a canvas; Node has none. @napi-rs/canvas is a
      // native binding, so it is a real platform dependency of the worker
      // image, not just an npm package.
      const { createCanvas } = await import("@napi-rs/canvas");
      const sharp = (await import("sharp")).default;

      const doc = await loadDocument(buffer);
      try {
        const target = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        const base = target.getViewport({ scale: 1 });
        const scale = Math.min(maxWidth / base.width, 2);
        const viewport = target.getViewport({ scale });

        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext("2d");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        await target.render({ canvasContext: context, viewport }).promise;
        target.cleanup();

        // JPEG via sharp rather than canvas.toBuffer: smaller, and the same
        // encoder the rest of the pipeline will use.
        return sharp(canvas.toBuffer("image/png")).jpeg({ quality: 78 }).toBuffer();
      } finally {
        await doc.destroy();
      }
    },
  };
}
