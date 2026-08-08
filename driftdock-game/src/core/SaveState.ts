/** Best times + best-run ghosts, per course, in localStorage. Fully static
 *  per the brief's hard constraint -- no backend, ever. */
const KEY = "driftdock-save-v1";

type Save = {
  bestTime: Record<string, number>; // courseId -> seconds
  bestGhost: Record<string, string>; // courseId -> encoded ghost string (see Ghost.ts)
};

function load(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted/unavailable localStorage (private browsing, quota) -- fall
    // through to a fresh save rather than crash the game over it
  }
  return { bestTime: {}, bestGhost: {} };
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
};
