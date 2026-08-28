// Credit burn and runway.
//
//   npm run credits -w @corner/backend
//   npm run credits -w @corner/backend -- --days 7 --credits 5000
//
// Reads UsageEvent and answers one question: at the current rate, how long do
// the credits last, and what is eating them.
//
// The point is to see TTS overtaking everything else BEFORE it does. Narration
// is 53x podcast mode and ~5,000x embedding per document (ADR 0003), so the
// spend mix can invert between one week and the next without anything looking
// wrong — a single feature flag flipped toward verbatim is enough.
//
// A script, not an endpoint. This is an operator question, and an endpoint
// would need auth, a rate limit, and a decision about who can see it.

import { UsageEventModel } from "../models";
import { env } from "../config/env";
import mongoose from "mongoose";

/** Unverified — see docs/OPEN-QUESTIONS.md OQ-011. */
const DEFAULT_CREDITS_USD = 5000;
const DEFAULT_WINDOW_DAYS = 30;

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = Number(process.argv[i + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function usd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function bar(fraction: number, width = 28): string {
  const filled = Math.max(0, Math.min(width, Math.round(fraction * width)));
  return "█".repeat(filled) + "·".repeat(width - filled);
}

async function main(): Promise<void> {
  const windowDays = arg("days", DEFAULT_WINDOW_DAYS);
  const creditsUsd = arg("credits", DEFAULT_CREDITS_USD);
  const since = new Date(Date.now() - windowDays * 86_400_000);

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 15_000 });

  const [lifetime] = await UsageEventModel.aggregate<{ cents: number; events: number }>([
    { $group: { _id: null, cents: { $sum: "$estimatedCostCents" }, events: { $sum: 1 } } },
  ]);

  const window = await UsageEventModel.aggregate<{
    _id: string;
    cents: number;
    events: number;
    units: number;
    unit: string;
  }>([
    { $match: { occurredAt: { $gte: since } } },
    {
      $group: {
        _id: "$feature",
        cents: { $sum: "$estimatedCostCents" },
        events: { $sum: 1 },
        units: { $sum: "$units" },
        unit: { $first: "$unit" },
      },
    },
    { $sort: { cents: -1 } },
  ]);

  const spentLifetime = lifetime?.cents ?? 0;
  const spentWindow = window.reduce((sum, f) => sum + f.cents, 0);
  const creditsCents = creditsUsd * 100;
  const remaining = Math.max(0, creditsCents - spentLifetime);

  console.log(`\n  CREDIT BURN — last ${windowDays} days\n`);

  if (window.length === 0) {
    console.log("  No usage recorded in this window.");
    console.log(`  Lifetime spend: ${usd(spentLifetime)} across ${lifetime?.events ?? 0} events.\n`);
    await mongoose.disconnect();
    return;
  }

  console.log("  By feature");
  for (const f of window) {
    const share = spentWindow > 0 ? f.cents / spentWindow : 0;
    console.log(
      `    ${f._id.padEnd(16)} ${usd(f.cents).padStart(10)}  ${(share * 100).toFixed(1).padStart(5)}%  ` +
        `${bar(share)}  ${f.events} call(s), ${f.units.toLocaleString()} ${f.unit}`,
    );
  }

  const perDay = spentWindow / windowDays;
  console.log(`\n  Window total    ${usd(spentWindow)}`);
  console.log(`  Daily rate      ${usd(perDay)}/day`);
  console.log(`  Lifetime spend  ${usd(spentLifetime)}`);
  console.log(`  Credits         ${usd(creditsCents)}  (UNVERIFIED — see OQ-011)`);
  console.log(`  Remaining       ${usd(remaining)}  ${bar(remaining / creditsCents)}`);

  console.log("\n  Runway");
  if (perDay <= 0) {
    console.log("    No spend in this window — no rate to project from.");
  } else {
    const days = remaining / perDay;
    const months = days / 30.44;

    // A projection from a near-zero rate is arithmetic, not information —
    // "20,949,436 months" is what you get from a few cents a day. Say the rate
    // is too low to project from rather than printing a number that reads as
    // reassurance.
    if (months > 120) {
      console.log(`    Spend rate is too low to project from (${usd(perDay)}/day).`);
      console.log("    Credits are effectively untouched at this rate.");
    } else if (days < 400) {
      console.log(
        `    At the last ${windowDays} days' rate, credits last ` +
          `${Math.floor(days)} days (${months.toFixed(1)} months).`,
      );
    } else {
      console.log(`    At the last ${windowDays} days' rate, credits last ${months.toFixed(0)} months.`);
    }

    // The projection is only as good as the mix being stable, and for Corner
    // it is not: narration is 53x podcast per document. Say so rather than
    // letting a comfortable number read as a forecast.
    const tts = window.find((f) => f._id === "tts");
    if (!tts) {
      console.log("    NOTE: no TTS spend yet. Narration is the dominant cost once");
      console.log("          it starts — one verbatim book is ~$19.88, about what");
      console.log("          embedding 5,000 books costs. This projection will not");
      console.log("          survive narration launching.");
    } else {
      const share = tts.cents / spentWindow;
      console.log(`    TTS is ${(share * 100).toFixed(1)}% of spend in this window.`);
      if (share > 0.6) {
        console.log("    TTS now dominates. Verbatim vs podcast mix is the lever —");
        console.log("    see docs/adr/0003-tts-provider.md and OQ-010.");
      }
    }
  }

  console.log("");
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error("credit-burn failed:", error);
  process.exit(1);
});
