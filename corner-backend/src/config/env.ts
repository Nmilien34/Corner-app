// Environment loading and validation.
//
// Pepta's pattern: dotenv for the current working directory first, then
// backfill from the repository-root .env so a workspace command run from
// corner-backend/ still sees root config. Validation is Zod, and it runs at
// import time so a misconfigured process dies at boot rather than at the first
// request that happens to need the missing key.

import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

/** Minimum key material for HS256. 32 bytes is the hash's own output width. */
export const JWT_SECRET_MIN_BYTES = 32;

/**
 * Floor on distinct characters, because byte length alone cannot see entropy.
 *
 * "aaaa…a" (64 of them) is valid hex and decodes to a genuine 32 bytes, so a
 * pure length check passes it while the key has essentially no entropy. Any
 * randomly generated secret clears this comfortably — 64 random hex characters
 * use ~16 distinct symbols, 44 random base64 characters use ~30 — so the floor
 * only catches secrets that were typed rather than generated.
 */
export const JWT_SECRET_MIN_DISTINCT_CHARS = 8;

/**
 * How many bytes of key material a secret actually carries.
 *
 * Hex and base64 are checked before falling back to raw UTF-8, because both
 * encodings inflate the character count relative to the entropy they hold —
 * 64 hex characters and 44 base64 characters are both exactly 32 bytes.
 * Hex is tested first: its alphabet is a subset of base64's, so the order
 * matters or every hex secret would be measured as base64 and overcounted.
 */
export function secretByteLength(value: string): number {
  if (value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value)) {
    return value.length / 2;
  }

  if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(value) && value.length % 4 === 0) {
    return Buffer.from(value, "base64").length;
  }

  return Buffer.byteLength(value, "utf8");
}

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  // Shape-checked here, not left to the driver.
  //
  // Mongoose's failure for a malformed URI is a MongoParseError stack trace
  // that names the connection-string parser rather than the variable, so the
  // reader has to already know what went wrong to read it. These checks name
  // the actual mistake instead. Whitespace is trimmed rather than reported —
  // a trailing newline from a copy-paste is never deliberate.
  /**
   * Injected by Render into every service. Absent locally.
   *
   * Surfaced in /healthz and in the worker's startup log so "is this running
   * what I just pushed" is one curl rather than an investigation. Three times
   * in one day something looked healthy while not being current — a stale
   * clone, an absent worker, and a stale build serving 501s from a commit two
   * ahead of it. Each cost a round of diagnosis that this answers directly.
   */
  RENDER_GIT_COMMIT: z.string().optional(),
  RENDER_SERVICE_NAME: z.string().optional(),

  MONGODB_URI: z
    .string()
    .min(1, "MONGODB_URI is required")
    .transform((value) => value.trim())
    .superRefine((value, ctx) => {
      const add = (message: string): void => {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      };

      // The paste-the-whole-line mistake. Render takes key and value in
      // separate fields, so a .env line pasted into the value box lands here.
      const prefix = /^([A-Z_][A-Z0-9_]*)=/.exec(value);
      if (prefix) {
        add(
          `starts with "${prefix[1]}=" — the variable NAME was pasted into the ` +
            "value. Paste only the part after the '=' sign.",
        );
        return;
      }

      if (/^['"]|['"]$/.test(value)) {
        add(
          "is wrapped in quotes. Render stores the value literally, so the " +
            "quotes become part of the connection string. Remove them.",
        );
        return;
      }

      if (!/^mongodb(\+srv)?:\/\//.test(value)) {
        add(
          `does not start with "mongodb://" or "mongodb+srv://" (it starts ` +
            `with "${value.slice(0, 12)}..."). Copy the full string from ` +
            "Atlas > Connect > Drivers.",
        );
        return;
      }

      if (!/^mongodb(\+srv)?:\/\/[^:]+:[^@]+@/.test(value)) {
        add(
          "has no username:password before the '@'. Atlas's copied string " +
            "contains a <db_password> placeholder that must be replaced.",
        );
        return;
      }

      if (/[<>]/.test(value)) {
        add(
          "still contains a < > placeholder from the Atlas example. Replace " +
            "it with the real password.",
        );
      }
    }),

  // The database Corner expects to be connected to, asserted at boot.
  //
  // Corner currently shares a cluster with a shipped app, so "which database
  // did the URI actually resolve to" stops being a rhetorical question. A
  // connection string with no path silently lands in `test`, and one copied
  // from a neighbouring service lands in THAT service's database — both look
  // like a clean startup and neither shows up until data is in the wrong place.
  MONGODB_DB_NAME: z.string().min(1).default("corner"),

  // Connection pool ceiling. Mongoose defaults to 100 per process; with an API
  // and a worker that is up to 200 sockets opened against a cluster that also
  // serves production traffic. Corner has no load that needs them.
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(10),

  // 32 BYTES minimum, measured after decoding — not a character count.
  //
  // A character count answers the wrong question. `openssl rand -base64 32` is
  // 44 characters carrying a full 256 bits, and a 64-character rule rejects it
  // while happily accepting 64 repeated 'a's. Pepta's 64-character bound was
  // really "32 bytes of hex" wearing a character count, so measuring bytes
  // keeps the same strength and stops punishing the stronger encoding.
  JWT_SECRET: z
    .string()
    .refine(
      (value) => secretByteLength(value) >= JWT_SECRET_MIN_BYTES,
      (value) => ({
        message:
          `JWT_SECRET must carry at least ${JWT_SECRET_MIN_BYTES} bytes of key material ` +
          `(got ${secretByteLength(value)}). Generate one with: openssl rand -hex 32`,
      }),
    )
    .refine(
      (value) => new Set(value).size >= JWT_SECRET_MIN_DISTINCT_CHARS,
      (value) => ({
        message:
          `JWT_SECRET has only ${new Set(value).size} distinct characters, which means it ` +
          "was typed rather than generated. Use: openssl rand -hex 32",
      }),
    ),
  JWT_EXPIRES_IN: z.string().default("30d"),

  // Storage and AI providers are declared but not yet read by any service.
  // Optional here so the API boots without them; the services that need them
  // assert at their own boundary rather than blocking the whole process.
  // Leave EMPTY for AWS S3 — the SDK derives the endpoint from the region.
  // Set it ONLY for S3-compatible providers that need an explicit host, e.g.
  // Cloudflare R2 (https://<account>.r2.cloudflarestorage.com).
  STORAGE_ENDPOINT: z.string().optional(),
  // A REAL AWS region. "auto" is a Cloudflare R2 convention the AWS SDK
  // rejects. us-east-2 is where corner-documents lives; Atlas is us-east-1 and
  // Render is Oregon, so this is deliberately inter-region — see docs/costs.md
  // for why that was the right call rather than an oversight.
  STORAGE_REGION: z.string().default("us-east-2"),
  STORAGE_BUCKET: z.string().default("corner-documents"),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),

  LLM_API_KEY: z.string().optional(),
  EMBEDDINGS_API_KEY: z.string().optional(),
  TTS_API_KEY: z.string().optional(),

  REVENUECAT_WEBHOOK_SECRET: z.string().optional(),
  REVENUECAT_SECRET_API_KEY: z.string().optional(),

  // Worker tuning.
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_LEASE_SECONDS: z.coerce.number().int().positive().default(300),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),

  // Orphan sweep grace period. Content younger than this is never a cleanup
  // candidate, which is what makes the counter-free sweep safe.
  ORPHAN_GRACE_HOURS: z.coerce.number().int().positive().default(24),

  /**
   * Orphan sweep dry-run. DEFAULTS TO TRUE — deletion is opt-in.
   *
   * The sweep runs unattended and deletes user documents. Defaulting to
   * dry-run means a misconfigured environment, a bad grace period, or a bug in
   * the anti-join produces a LOG rather than data loss, and the delete list can
   * be read before anything acts on it.
   *
   * Set to "false" only after reviewing a real run's output.
   */
  ORPHAN_SWEEP_DRY_RUN: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  /** Ceiling per run, so a bug cannot cascade across the whole bucket at once. */
  ORPHAN_SWEEP_MAX_PER_RUN: z.coerce.number().int().positive().default(50),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Separate "you never set this" from "you set it to something invalid".
  // They have completely different fixes, and a flat list of Zod messages
  // makes a 63-character JWT_SECRET look identical to a missing one.
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const issue of parsed.error.issues) {
    const key = issue.path.join(".") || "(root)";
    const absent = process.env[key] === undefined || process.env[key] === "";
    (absent ? missing : invalid).push(
      absent ? `  ${key}` : `  ${key}: ${issue.message}`,
    );
  }

  const lines = ["Invalid environment configuration.", ""];

  if (missing.length > 0) {
    lines.push("NOT SET:", ...missing, "");
  }
  if (invalid.length > 0) {
    lines.push("SET BUT INVALID:", ...invalid, "");
  }

  lines.push(
    "Where these come from:",
    "  - Local:  copy .env.example to .env at the repo root and fill it in.",
    "  - Render: Dashboard > Env Groups > 'corner-secrets'. Values are declared",
    "            `sync: false` in render.yaml, which means Render never supplies",
    "            them — you set them once and both services inherit the group.",
    "",
    `  JWT_SECRET must carry at least ${JWT_SECRET_MIN_BYTES} bytes of key material.`,
    "  Generate one with:  openssl rand -hex 32",
    "  (hex and base64 secrets are measured after decoding, so both",
    "  `openssl rand -hex 32` and `openssl rand -base64 32` are accepted.)",
  );

  throw new Error(lines.join("\n"));
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
