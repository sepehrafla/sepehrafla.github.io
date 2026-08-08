/** mulberry32 -- a tiny, fast, deterministic PRNG. Same seed -> same
 *  sequence forever, on any machine, which is the whole point: the daily
 *  course must be identical worldwide for a given date. Not cryptographic,
 *  doesn't need to be. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Today's date as YYYYMMDD (local time), e.g. 20260218 -- deterministic
 *  per calendar day, no timezone-crossing ambiguity worth worrying about
 *  for a daily challenge (worst case someone's "today" starts a few hours
 *  off from someone else's; the brief's own example, "#214," is a day
 *  count, not a strict UTC-instant claim). */
export function dailySeed(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** Sequential daily-challenge number for the share string ("#214"),
 *  counted from a fixed epoch so it reads as a small, growing counter
 *  rather than a raw YYYYMMDD. Epoch chosen arbitrarily (this project's
 *  start) -- what matters is it's fixed and deterministic, not the exact
 *  starting point. */
const EPOCH = Date.UTC(2026, 0, 1);
export function dailyNumber(date = new Date()): number {
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(1, Math.floor((utcMidnight - EPOCH) / 86400000) + 1);
}

export function dailyDateKey(date = new Date()): string {
  return String(dailySeed(date));
}
