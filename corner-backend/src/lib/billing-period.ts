/**
 * Period keys for quota counters and usage aggregation.
 *
 * UTC by design, and that is a real tradeoff — a user in UTC-8 gets their
 * daily chat quota back at 4pm local. See docs/OPEN-QUESTIONS.md OQ-006.
 */

export function monthKey(at: Date = new Date()): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function dayKey(at: Date = new Date()): string {
  const day = String(at.getUTCDate()).padStart(2, "0");
  return `${monthKey(at)}-${day}`;
}
