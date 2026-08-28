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

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  // 64 characters minimum, adopting Pepta's stronger bound over Leanient's 32.
  JWT_SECRET: z
    .string()
    .min(64, "JWT_SECRET must be at least 64 characters"),
  JWT_EXPIRES_IN: z.string().default("30d"),

  // Storage and AI providers are declared but not yet read by any service.
  // Optional here so the API boots without them; the services that need them
  // assert at their own boundary rather than blocking the whole process.
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default("auto"),
  STORAGE_BUCKET: z.string().optional(),
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
    "  JWT_SECRET must be at least 64 characters. Generate one with:",
    "      openssl rand -hex 32",
    "  (32 bytes of hex is exactly 64 characters. Do NOT use Render's dashboard",
    "  'Generate' button here — its value may be shorter than 64 and will fail",
    "  this check with a confusing message.)",
  );

  throw new Error(lines.join("\n"));
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
