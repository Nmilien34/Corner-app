// In-memory rate limiter, keyed by authenticated user when available and by IP
// otherwise. Same shape as the reference apps.
//
// NOTE: in-memory means PER PROCESS. With the web service and the worker both
// running, and with more than one Render instance, the effective limit is the
// configured limit times the instance count. That is acceptable for the AI
// endpoints it guards today and must be replaced with a shared store before
// horizontal scaling means anything. Documented rather than silently wrong.

import type { NextFunction, Request, RequestHandler, Response } from "express";

import { RateLimitedError } from "../lib/errors";

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function rateLimit(options: {
  windowMs: number;
  max: number;
  name: string;
}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    if (buckets.size > 10_000) sweep(now);

    const identity = req.user?.id ?? req.ip ?? "unknown";
    const key = `${options.name}:${identity}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    existing.count += 1;

    if (existing.count > options.max) {
      next(
        new RateLimitedError("Too many requests", {
          retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
        }),
      );
      return;
    }

    next();
  };
}

/** Tighter limit for the endpoints that spend money per call. */
export const aiRateLimit = rateLimit({
  windowMs: 60_000,
  max: 20,
  name: "ai",
});

/** For tests, which would otherwise share buckets across cases. */
export function resetRateLimitBuckets(): void {
  buckets.clear();
}
