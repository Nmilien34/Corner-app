import * as pdfjsLib from "./node_modules/pdfjs-dist/build/pdf.mjs";
import { buildPageIndex, pageForOffset, rectsForRange, PAGE_SEPARATOR } from "./text-index.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./node_modules/pdfjs-dist/build/pdf.worker.mjs";

const BUFFER_PAGES = 2;          // virtualization window: visible +/- this
const viewer = document.getElementById("viewer");
const logEl = document.getElementById("log");
const statusEl = document.getElementById("status");

let pdf, pages = [], docText = "", scale = 1.1;
const rendered = new Map();      // pageNumber -> { textLayerEl, canvas }
const pageEls = [];

const log = (msg, cls = "") =>
  (logEl.innerHTML += `<span class="${cls}">${msg}</span>\n`, logEl.scrollTop = 1e9);

async function boot() {
  const t0 = performance.now();
  pdf = await pdfjsLib.getDocument("/corpus/large-350p.pdf").promise;
  statusEl.textContent = `${pdf.numPages} pages · building index…`;

  // Build the document-wide char index up front — this is what the SERVER
  // would have produced at parse time and stored as pageOffsets.
  let offset = 0;
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    const idx = buildPageIndex(n, tc, offset);
    pages.push(idx);
    docText += idx.text + (n < pdf.numPages ? PAGE_SEPARATOR : "");
    offset = idx.endOffset + (n < pdf.numPages ? PAGE_SEPARATOR.length : 0);
    if (n % 50 === 0) statusEl.textContent = `indexing ${n}/${pdf.numPages}…`;
  }

  const dt = Math.round(performance.now() - t0);
  log(`indexed ${pdf.numPages} pages, ${docText.length.toLocaleString()} chars in ${dt}ms`, "ok");
  statusEl.textContent = `${pdf.numPages} pages · ${docText.length.toLocaleString()} chars`;

  // Reserve full-height placeholders so the scrollbar is correct without
  // rendering anything — this is what makes virtualization possible.
  const first = await pdf.getPage(1);
  const vp = first.getViewport({ scale });
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const el = document.createElement("div");
    el.className = "page placeholder";
    el.style.width = `${vp.width}px`;
    el.style.height = `${vp.height}px`;
    el.dataset.page = String(n);
    el.textContent = `page ${n}`;
    viewer.appendChild(el);
    pageEls.push(el);
  }

  viewer.addEventListener("scroll", schedule, { passive: true });
  await sync();
  window.__ready = true;
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; void sync(); });
}

function visibleRange() {
  const top = viewer.scrollTop, bottom = top + viewer.clientHeight;
  let lo = Infinity, hi = -Infinity;
  pageEls.forEach((el, i) => {
    const a = el.offsetTop - viewer.offsetTop, b = a + el.offsetHeight;
    if (b > top && a < bottom) { lo = Math.min(lo, i + 1); hi = Math.max(hi, i + 1); }
  });
  if (lo === Infinity) { lo = 1; hi = 1; }
  return [Math.max(1, lo - BUFFER_PAGES), Math.min(pdf.numPages, hi + BUFFER_PAGES)];
}

async function sync() {
  const [lo, hi] = visibleRange();
  for (const n of [...rendered.keys()]) {
    if (n < lo || n > hi) { evict(n); }
  }
  for (let n = lo; n <= hi; n += 1) {
    if (!rendered.has(n)) await renderPage(n);
  }
  statusEl.textContent = `pages ${lo}–${hi} rendered (${rendered.size} live)`;
}

function evict(n) {
  const el = pageEls[n - 1];
  el.innerHTML = "";
  el.classList.add("placeholder");
  el.textContent = `page ${n}`;
  rendered.delete(n);
}

async function renderPage(n) {
  const page = await pdf.getPage(n);
  const vp = page.getViewport({ scale });
  const el = pageEls[n - 1];
  el.classList.remove("placeholder");
  el.textContent = "";
  el.style.width = `${vp.width}px`;
  el.style.height = `${vp.height}px`;

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  el.appendChild(canvas);
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;

  const textLayer = document.createElement("div");
  textLayer.className = "textLayer";
  // REQUIRED by pdf.js v4's TextLayer. Without it the layer's internal sizing
  // is computed against an implicit scale of 1 and every span's width is
  // wrong at any other zoom — the glyph positions still look plausible, so
  // the failure shows up only when you measure a rect. Caught by the zoom
  // survival test: highlight width went 0.92 -> 0.58 -> 1.35 of page width
  // across three zoom levels while x/y anchored perfectly.
  textLayer.style.setProperty("--scale-factor", String(scale));
  el.appendChild(textLayer);
  const tc = await page.getTextContent();
  await new pdfjsLib.TextLayer({ textContentSource: tc, container: textLayer, viewport: vp }).render();

  rendered.set(n, { textLayerEl: textLayer, el });
  return rendered.get(n);
}

/** Ensures the page holding `offset` is rendered, scrolling to it if needed. */
async function ensureRendered(offset) {
  const page = pageForOffset(pages, offset);
  if (!page) return null;
  if (!rendered.has(page.pageNumber)) {
    pageEls[page.pageNumber - 1].scrollIntoView({ block: "center" });
    await sync();
    if (!rendered.has(page.pageNumber)) await renderPage(page.pageNumber);
  }
  return page;
}

function clearHighlights() {
  document.querySelectorAll(".hl").forEach((n) => n.remove());
}

/** THE ROUND TRIP: document char offset -> rects -> drawn overlay. */
async function highlight(from, to, { scroll = true, quiet = false } = {}) {
  const page = await ensureRendered(from);
  if (!page) { if (!quiet) log(`offset ${from}: no page`, "bad"); return null; }

  const entry = rendered.get(page.pageNumber);
  const { rects, matched, reason } = rectsForRange(page, entry.textLayerEl, from, to);
  if (!rects.length) { if (!quiet) log(`offset ${from}-${to}: ${reason}`, "bad"); return null; }

  const box = entry.el.getBoundingClientRect();
  for (const r of rects) {
    const d = document.createElement("div");
    d.className = "hl";
    d.style.left = `${r.left - box.left}px`;
    d.style.top = `${r.top - box.top}px`;
    d.style.width = `${r.width}px`;
    d.style.height = `${r.height}px`;
    entry.el.appendChild(d);
  }
  if (scroll) entry.el.scrollIntoView({ block: "center" });

  const drawn = matched.map((m) => m.text).join("");
  const expected = docText.slice(from, to);
  return { page: page.pageNumber, rects: rects.length, drawn, expected };
}

// ---- exposed for automated verification ------------------------------------

window.__spike = {
  get pages() { return pages.length; },
  get chars() { return docText.length; },
  slice: (a, b) => docText.slice(a, b),
  highlight,
  clearHighlights,
  setScale: async (s) => {
    scale = s;
    for (const n of [...rendered.keys()]) evict(n);
    const vp = (await pdf.getPage(1)).getViewport({ scale });
    pageEls.forEach((el) => { el.style.width = `${vp.width}px`; el.style.height = `${vp.height}px`; });
    await sync();
  },
  scrollTo: async (px) => { viewer.scrollTop = px; await sync(); },
  renderedPages: () => [...rendered.keys()].sort((a, b) => a - b),
  /** Splits the failure modes apart: page lookup vs rect production. */
  diagnose: async (from, to) => {
    const page = pageForOffset(pages, from);
    if (!page) {
      const before = pages.filter((p) => p.endOffset <= from).slice(-1)[0];
      const after = pages.find((p) => p.startOffset > from);
      return {
        stage: "pageForOffset",
        ok: false,
        offset: from,
        gapAfterPage: before?.pageNumber ?? null,
        gapEnds: before?.endOffset ?? null,
        nextPage: after?.pageNumber ?? null,
        nextStarts: after?.startOffset ?? null,
      };
    }
    const wasRendered = rendered.has(page.pageNumber);
    await ensureRendered(from);
    const entry = rendered.get(page.pageNumber);
    const res = rectsForRange(page, entry?.textLayerEl, from, to);
    return {
      stage: "rectsForRange",
      ok: res.rects.length > 0,
      page: page.pageNumber,
      wasRendered,
      pageStart: page.startOffset,
      pageEnd: page.endOffset,
      items: page.items.length,
      spans: entry?.textLayerEl?.querySelectorAll("span").length ?? 0,
      rects: res.rects.length,
      reason: res.reason,
      matched: (res.matched || []).map((m) => m.text).join(""),
    };
  },
  /** Picks N sentence-ish ranges spread across the document. */
  sampleRanges: (n = 12) => {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      const anchor = Math.floor((docText.length / (n + 1)) * (i + 1));
      const s = docText.indexOf("Section", anchor);
      if (s < 0) continue;
      const e = docText.indexOf(".", s);
      if (e < 0 || e - s > 400) continue;
      out.push([s, e + 1]);
    }
    return out;
  },
};

/**
 * THE GATE: compare the server's parse against the client's.
 *
 * Loads server-parse.json (written by corner-backend's parse-corpus script) and
 * checks, in increasing order of strictness:
 *   1. page count and total character count
 *   2. pageOffsets, element by element
 *   3. sha256 of the ENTIRE normalized text — one differing character fails it
 *   4. every sample range resolves on screen to the text the server says lives
 *      at those offsets
 *
 * Check 3 is the one that matters. 1 and 2 can pass while the text differs
 * internally in compensating ways; the hash cannot.
 */
window.__verifyAgainstServer = async () => {
  const S = window.__spike;
  const server = await fetch("/server-parse.json").then((r) => r.json());
  const out = { checks: {}, failures: [] };

  out.checks.pdfjsVersion = { server: server.pdfjsVersion, client: pdfjsLib.version,
    match: server.pdfjsVersion === pdfjsLib.version };
  out.checks.pageCount = { server: server.pageCount, client: pages.length,
    match: server.pageCount === pages.length };
  out.checks.totalChars = { server: server.totalChars, client: docText.length,
    match: server.totalChars === docText.length };

  // pageOffsets, element by element — reports the FIRST divergence, which is
  // where any drift begins.
  let firstBadPage = null;
  for (let i = 0; i < Math.max(server.pageOffsets.length, pages.length); i++) {
    const a = server.pageOffsets[i], b = pages[i]?.startOffset;
    if (a !== b) { firstBadPage = { page: i + 1, server: a, client: b }; break; }
  }
  out.checks.pageOffsets = { match: firstBadPage === null, firstDivergence: firstBadPage };

  // Full-text hash.
  const bytes = new TextEncoder().encode(docText);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const clientSha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  out.checks.textSha256 = { server: server.textSha256, client: clientSha,
    match: server.textSha256 === clientSha };

  // Resolve each server-issued range on screen.
  let resolved = 0, textMatches = 0;
  for (const sample of server.samples) {
    S.clearHighlights();
    let r = await S.highlight(sample.probeStart, sample.probeEnd, { scroll: true, quiet: true });
    if (!r) { await new Promise((x) => requestAnimationFrame(x));
      r = await S.highlight(sample.probeStart, sample.probeEnd, { scroll: true, quiet: true }); }
    if (!r) { out.failures.push({ ordinal: sample.ordinal, why: "no rects" }); continue; }
    resolved++;

    // Compare VISIBLE characters, not structural ones.
    //
    // The server's normalized text contains newlines contributed by hasEOL
    // markers. Those are real characters that occupy offsets, but they have no
    // glyphs — pdf.js renders no span for them — so the client cannot draw
    // them and correctly highlights only the visible characters in the range.
    //
    // Comparing raw strings therefore fails on every range containing a line
    // break, which is almost all of them, while proving nothing. The text
    // itself is compared exactly, and far more strictly, by the sha256 of the
    // whole document above.
    const expectedVisible = sample.probeText.replace(/\n/g, "");
    if (r.drawn === expectedVisible) textMatches++;
    else out.failures.push({ ordinal: sample.ordinal, page: r.page,
      serverVisible: expectedVisible, clientDrew: r.drawn,
      serverRaw: JSON.stringify(sample.probeText) });
  }

  out.checks.sampleResolution = { total: server.samples.length, resolved,
    textMatchesServer: textMatches };
  out.verdict =
    out.checks.pageCount.match && out.checks.totalChars.match &&
    out.checks.pageOffsets.match && out.checks.textSha256.match &&
    textMatches === server.samples.length ? "PASS" : "FAIL";
  return out;
};

document.getElementById("go").onclick = async () => {
  clearHighlights();
  const a = +document.getElementById("from").value, b = +document.getElementById("to").value;
  const r = await highlight(a, b);
  if (r) log(`p${r.page} ${r.rects} rect(s)  drawn="${r.drawn.slice(0,60)}"`, r.drawn === r.expected ? "ok" : "bad");
};
document.getElementById("rand").onclick = async () => {
  clearHighlights();
  const rs = window.__spike.sampleRanges(40);
  const [a, b] = rs[Math.floor(Math.random() * rs.length)];
  document.getElementById("from").value = a; document.getElementById("to").value = b;
  const r = await highlight(a, b);
  if (r) log(`p${r.page} [${a},${b}) "${r.drawn.slice(0,60)}"`, r.drawn === r.expected ? "ok" : "bad");
};
document.getElementById("zin").onclick = () => window.__spike.setScale(scale + 0.25);
document.getElementById("zout").onclick = () => window.__spike.setScale(Math.max(0.5, scale - 0.25));
document.getElementById("verify").onclick = () => window.__runSuite();

boot().catch((e) => { log("BOOT FAILED: " + e.message, "bad"); console.error(e); });
