import * as THREE from "three";
import type { CourseDef, Gate } from "../world/Course";
import { mulberry32, dailySeed, dailyNumber } from "../core/Seed";

/** Daily mode: "seeded course from 4 random sections + spine, same
 *  worldwide." The candidate pool below reuses real, already-built world
 *  content (same landmarks the 5 authored courses use) -- a full spline-
 *  spawned section system was out of scope at this budget (see Course.ts's
 *  own scope note), so this generates a course the same way: pick 4 of
 *  these waypoints, deterministically, from the day's seed. */
const CANDIDATES: Gate[] = [
  { pos: new THREE.Vector3(10, 3, -8), radius: 2.5, suggestedAssist: "OFF" }, // boost ring
  { pos: new THREE.Vector3(0, 2, 6), radius: 3, suggestedAssist: "STABILIZE" }, // checkpoint
  { pos: new THREE.Vector3(0, 4, -40), radius: 3, suggestedAssist: "OFF" }, // canyon apex 1
  { pos: new THREE.Vector3(0, 4, -54), radius: 3, suggestedAssist: "OFF" }, // canyon apex 2
  { pos: new THREE.Vector3(0, 3, -90), radius: 3, suggestedAssist: "STABILIZE" }, // fog entry
  { pos: new THREE.Vector3(0, 2.5, -120), radius: 3.5, suggestedAssist: "STABILIZE" }, // fog exit
  { pos: new THREE.Vector3(22, 1, -6), radius: 2.5, suggestedAssist: "GOVERNOR" }, // duct mouth
  { pos: new THREE.Vector3(0, 1.6, 12), radius: 4, suggestedAssist: "POSHOLD" }, // MovingDock zone (patrol swing tolerance)
  { pos: new THREE.Vector3(-8, 2, -20), radius: 1.2, suggestedAssist: "GOVERNOR" }, // SlotThread
];

const SPAWN_GATE: Gate = { pos: new THREE.Vector3(0, 2, 0), radius: 3, suggestedAssist: "OFF" };

// Nominal cruise speeds (m/s) for each medal tier, same estimate style as
// every authored course's hand-picked par times -- unverified against a
// real run, flagged like every other untested constant in this project.
const BRONZE_SPEED = 7,
  SILVER_SPEED = 10,
  GOLD_SPEED = 14;

/** Deterministic: same date -> same seed -> same 4-of-9 selection and
 *  order, on any machine, forever. Verified directly (not a playtest
 *  claim) by calling this twice with the same Date and diffing gates. */
export function buildDailyCourse(date = new Date()): CourseDef {
  const rng = mulberry32(dailySeed(date)),
    pool = CANDIDATES.slice(),
    picked: Gate[] = [];
  // Partial Fisher-Yates: draw 4 without replacement, deterministically.
  for (let i = 0; i < 4 && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  const gates = [SPAWN_GATE, ...picked];

  let length = 0;
  for (let i = 1; i < gates.length; i++) length += gates[i].pos.distanceTo(gates[i - 1].pos);

  return {
    id: `daily-${dailySeed(date)}`,
    name: `Daily #${dailyNumber(date)}`,
    gates,
    parBronze: length / BRONZE_SPEED,
    parSilver: length / SILVER_SPEED,
    parGold: length / GOLD_SPEED,
  };
}
