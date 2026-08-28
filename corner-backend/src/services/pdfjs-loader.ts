// Loads pdfjs-dist from CommonJS.
//
// pdfjs-dist@4 is ESM-ONLY — there is no CommonJS build — and corner-backend
// compiles to CommonJS (CONVENTIONS.md), so `require()` cannot load it.
//
// TypeScript with `module: commonjs` rewrites a plain `await import(...)` into
// `Promise.resolve().then(() => require(...))`, which fails at runtime on an
// ESM-only package. Constructing the import through `new Function` produces a
// genuine dynamic import that survives transpilation.
//
// This indirection is deliberate. Replacing it with a normal import breaks the
// build at RUNTIME, not at compile time, which is the worst place to find out.
// See docs/PDFJS-VERSION.md.

type DynamicImport = (specifier: string) => Promise<unknown>;

const dynamicImport = new Function("specifier", "return import(specifier)") as DynamicImport;

export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  height?: number;
  width?: number;
  fontName?: string;
}

export interface PdfTextContent {
  items: PdfTextItem[];
}

export interface PdfOutlineEntry {
  title: string;
  dest: unknown;
  items: PdfOutlineEntry[];
}

export interface PdfPageProxy {
  getTextContent(): Promise<PdfTextContent>;
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: unknown; viewport: unknown }): { promise: Promise<void> };
  cleanup(): void;
}

export interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  getOutline(): Promise<PdfOutlineEntry[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
  destroy(): Promise<void>;
}

interface PdfjsModule {
  getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocumentProxy> };
  version: string;
}

let cached: PdfjsModule | null = null;

export async function loadPdfjs(): Promise<PdfjsModule> {
  if (cached) return cached;
  // The legacy build targets older runtimes and avoids optional browser-only
  // features that warn under Node.
  cached = (await dynamicImport("pdfjs-dist/legacy/build/pdf.mjs")) as PdfjsModule;
  return cached;
}

/** For the version-drift check at runtime, not just at install time. */
export async function pdfjsVersion(): Promise<string> {
  return (await loadPdfjs()).version;
}
