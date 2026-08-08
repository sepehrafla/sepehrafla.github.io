import { dailySeed } from "./Seed";

/** Best times + best-run ghosts, per course, in localStorage. Fully static
 *  per the brief's hard constraint -- no backend, ever. */
const KEY = "driftdock-save-v1";

type Save = {
  bestTime: Record<string, number>; // courseId -> seconds
  bestGhost: Record<string, string>; // courseId -> encoded ghost string (see Ghost.ts)
  dailyStreak: number;
  lastDailyKey: number; // YYYYMMDD of the last day the Daily was completed
};

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { dailyStreak: 0, lastDailyKey: 0, ...JSON.parse(raw) };
  } catch {
    // corrupted/unavailable localStorage (private browsing, quota) -- fall
    // through to a fresh save rather than crash the game over it
  }
  return { bestTime: {}, bestGhost: {}, dailyStreak: 0, lastDailyKey: 0 };
}

function persist(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // best-effort only -- a failed save shouldn't interrupt play
  }
}

export const SaveState = {
  bestTime(courseId: string): number | undefined {
    return load().bestTime[courseId];
  },
  bestGhost(courseId: string): string | undefined {
    return load().bestGhost[courseId];
  },
  /** Records a new best if `time` beats the stored one (or none exists).
   *  Returns true if this run became the new best. */
  recordIfBest(courseId: string, time: number, ghost: string): boolean {
    const save = load(),
      prev = save.bestTime[courseId];
    if (prev !== undefined && time >= prev) return false;
    save.bestTime[courseId] = time;
    save.bestGhost[courseId] = ghost;
    persist(save);
    return true;
  },

  dailyStreak(): number {
    return load().dailyStreak;
  },

  /** Call once when today's Daily is completed (any medal, including
   *  NONE -- the brief ties the streak to playing the daily, not to
   *  medalling it). Yesterday's key -> +1; today's key already recorded ->
   *  no-op (already played today); any other gap -> reset to 1. */
  recordDailyPlayed(now = new Date()) {
    const save = load(),
      today = dailySeed(now),
      yesterday = dailySeed(new Date(now.getTime() - 86400000));
    if (save.lastDailyKey === today) return; // already played today
    save.dailyStreak = save.lastDailyKey === yesterday ? save.dailyStreak + 1 : 1;
    save.lastDailyKey = today;
    persist(save);
  },
};
