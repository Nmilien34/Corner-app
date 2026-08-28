// Guards the identical-extraction guarantee.
//
// Corner produces character offsets on the server and resolves them to
// rectangles on the client. That only holds while both sides run the SAME
// pdf.js — a one-sided bump can change whitespace collapsing, ligature
// handling, hyphenation or zero-length item emission, shifting every offset
// after the point of change. Nothing throws; highlights just land slightly
// wrong.
//
// See docs/PDFJS-VERSION.md for the upgrade procedure.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..");

function manifest(relativePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8")) as Record<string, unknown>;
}

function dependency(pkg: Record<string, unknown>, name: string): string | undefined {
  const deps = pkg.dependencies as Record<string, string> | undefined;
  return deps?.[name];
}

describe("pdfjs-dist is locked across backend and frontend", () => {
  const backend = dependency(manifest("corner-backend/package.json"), "pdfjs-dist");
  const frontend = dependency(manifest("corner-frontend/package.json"), "pdfjs-dist");
  const overrides = (manifest("package.json").overrides ?? {}) as Record<string, string>;

  it("is declared in both workspaces", () => {
    expect(backend).toBeDefined();
    expect(frontend).toBeDefined();
  });

  it("declares the SAME version on both sides", () => {
    expect(frontend).toBe(backend);
  });

  it("pins exactly, with no range operator", () => {
    // "^4.10.38" would let the two sides resolve to different patch releases
    // on separate installs, which is the drift this whole file exists to stop.
    for (const version of [backend, frontend, overrides["pdfjs-dist"]]) {
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("is forced by a root override so no transitive dep can win", () => {
    expect(overrides["pdfjs-dist"]).toBe(backend);
  });
});
