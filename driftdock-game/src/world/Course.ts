import * as THREE from "three";
import type { AssistMode } from "../drone/Assists";

/** Course loader, scoped down from the brief's "10 authored courses" to 5
 *  -- each course here is a real, working sequence of gates through the
 *  world content milestones 1-5 already built (a genuine "spline spine +
 *  placed sections," just reusing existing sections rather than authoring
 *  10 courses' worth of brand-new geometry, which was out of scope for one
 *  milestone at this budget). The loader itself doesn't care how many
 *  entries COURSES has -- adding 5 more later is a data change, not a
 *  rewrite. Par times below are estimated from gate-to-gate distance over
 *  a plausible average speed, NOT measured against a real run -- same
 *  "flag it, don't fake it" caveat as every other untested constant in
 *  this project; milestone 9's tuning week is where these get calibrated
 *  against real playtesters, per the brief. */
// Milestone 7: each gate optionally carries the copilot's suggested assist
// for the LEG leading up to it -- "every course contains at least one
// segment where each equipped assist is a liability and one where it's
// near-essential," so the copilot's schedule reflects that per section,
// not one constant setting for the whole course.
export type Gate = { pos: THREE.Vector3; radius: number; suggestedAssist?: AssistMode };
export type CourseDef = {
  id: string;
  name: string;
  gates: Gate[]; // gates[0] is the start trigger, the last is the finish
  parBronze: number; // seconds
  parSilver: number;
  parGold: number;
  lockStabilize?: boolean; // progression: courses 1-2 force STABILIZE on, per the brief
};

export const COURSES: CourseDef[] = [
  {
    id: "c1",
    name: "First Flight",
    gates: [
      { pos: new THREE.Vector3(0, 2, 0), radius: 3 },
      { pos: new THREE.Vector3(10, 3, -8), radius: 2.5 }, // boost ring
      { pos: new THREE.Vector3(0, 2, 6), radius: 3 }, // checkpoint
      { pos: new THREE.Vector3(0, 2, -4), radius: 2.5 }, // finish, back near spawn
    ],
    parBronze: 22,
    parSilver: 16,
    parGold: 12,
    lockStabilize: true,
  },
  {
    id: "c2",
    name: "Threading",
    gates: [
      { pos: new THREE.Vector3(0, 2, 0), radius: 3 },
      { pos: new THREE.Vector3(10, 3, -4), radius: 2.5 }, // between the two pylons at x=10
      { pos: new THREE.Vector3(-6, 3, 8), radius: 2.5 }, // past the [-6,12] pylon
      { pos: new THREE.Vector3(-8, 2, -20), radius: 1.2 }, // through SlotThread -- genuinely tight
      { pos: new THREE.Vector3(-8, 2, -26), radius: 2.5 }, // finish, past the slot
    ],
    parBronze: 26,
    parSilver: 19,
    parGold: 14,
    lockStabilize: true,
  },
  {
    id: "c3",
    name: "Canyon Run",
    gates: [
      { pos: new THREE.Vector3(0, 4, -36), radius: 3, suggestedAssist: "OFF" }, // canyon mouth -- full speed, no assist needed
      { pos: new THREE.Vector3(0, 4, -40), radius: 3, suggestedAssist: "OFF" }, // apex 1
      { pos: new THREE.Vector3(0, 4, -54), radius: 3, suggestedAssist: "OFF" }, // apex 2
      { pos: new THREE.Vector3(0, 4, -68), radius: 3, suggestedAssist: "OFF" }, // apex 3
      { pos: new THREE.Vector3(0, 4, -76), radius: 3, suggestedAssist: "OFF" }, // finish, past the canyon
    ],
    parBronze: 24,
    parSilver: 17,
    parGold: 12,
  },
  {
    id: "c4",
    name: "Fog IFR",
    gates: [
      { pos: new THREE.Vector3(0, 3, -90), radius: 3, suggestedAssist: "STABILIZE" }, // fog zone entry -- stay level going instrument
      { pos: new THREE.Vector3(4, 3, -106), radius: 2.5, suggestedAssist: "GOVERNOR" }, // pylon threading blind -- can't afford to overspeed into one
      { pos: new THREE.Vector3(-3, 3, -103), radius: 2.5, suggestedAssist: "GOVERNOR" },
      { pos: new THREE.Vector3(0, 2.5, -120), radius: 3.5, suggestedAssist: "STABILIZE" }, // the gold exit gate
    ],
    parBronze: 20,
    parSilver: 15,
    parGold: 11,
  },
  {
    id: "c5",
    name: "Duct & Burn",
    // Deliberately spans two far-apart set pieces (DuctReverse then the
    // boost ring back near spawn) so the gold pace genuinely can't be flown
    // on one assist: GOVERNOR is the honest way to thread the duct without
    // bouncing off the walls, but its closure-rate cap is exactly what
    // costs the sprint back -- switching it off for the return leg is
    // "demands assist-switching," not just faster if you happen to.
    gates: [
      { pos: new THREE.Vector3(22, 1, -6), radius: 2.5, suggestedAssist: "GOVERNOR" }, // duct mouth approach
      { pos: new THREE.Vector3(22, 0.9, -11.5), radius: 0.8, suggestedAssist: "GOVERNOR" }, // the beacon itself
      { pos: new THREE.Vector3(10, 3, -8), radius: 2.5, suggestedAssist: "OFF" }, // boost ring, sprint leg
      { pos: new THREE.Vector3(0, 2, 0), radius: 3, suggestedAssist: "OFF" }, // finish, back at spawn
    ],
    parBronze: 30,
    parSilver: 21,
    parGold: 15,
  },
];

/** #ghost=<courseId>:<encoded> in the URL fragment -- the brief's "ghost
 *  data in the # fragment... no backend, ever." Parsed once on load so a
 *  shared link auto-selects that course and loads the embedded ghost, even
 *  if it isn't the local player's own best. */
export function parseSharedGhost(): { courseIndex: number; encoded: string } | null {
  const m = location.hash.match(/^#ghost=([^:]+):(.+)$/);
  if (!m) return null;
  const courseIndex = COURSES.findIndex((c) => c.id === m[1]);
  return courseIndex === -1 ? null : { courseIndex, encoded: m[2] };
}

export function shareGhostLink(courseId: string, encoded: string) {
  history.replaceState(null, "", `#ghost=${courseId}:${encoded}`);
}

export type Medal = "GOLD" | "SILVER" | "BRONZE" | "NONE";

export function medalFor(course: CourseDef, time: number): Medal {
  if (time <= course.parGold) return "GOLD";
  if (time <= course.parSilver) return "SILVER";
  if (time <= course.parBronze) return "BRONZE";
  return "NONE";
}

export type CourseState = "IDLE" | "RACING" | "FINISHED";

/** Gate-progress + timer state machine. One instance for the session;
 *  `select()` swaps which CourseDef it's tracking. Sequential gates only
 *  (must cross gates[i] before gates[i+1] counts) -- no shortcuts. */
export class CourseRunner {
  courseIndex = 0;
  state: CourseState = "IDLE";
  gateIndex = 0;
  elapsed = 0;
  lastMedal: Medal | null = null;
  lastTime = 0;
  private dailyCourse: CourseDef | null = null;

  get course() {
    return this.dailyCourse ?? COURSES[this.courseIndex];
  }

  get isDaily() {
    return !!this.dailyCourse;
  }

  select(index: number) {
    this.dailyCourse = null;
    this.courseIndex = THREE.MathUtils.clamp(index, 0, COURSES.length - 1);
    this.state = "IDLE";
    this.gateIndex = 0;
    this.elapsed = 0;
    this.lastMedal = null;
  }

  /** Milestone 8: run a generated Daily course instead of an indexed
   *  authored one. Same runner, same gate/timer machinery -- Daily is a
   *  different CourseDef, not a different code path. */
  selectDaily(course: CourseDef) {
    this.dailyCourse = course;
    this.state = "IDLE";
    this.gateIndex = 0;
    this.elapsed = 0;
    this.lastMedal = null;
  }

  /** Returns true exactly on the frame a course is completed (finished),
   *  so main.ts knows to save the ghost/best time right then. */
  update(dt: number, dronePos: THREE.Vector3): boolean {
    const gate = this.course.gates[this.gateIndex];
    if (this.state === "FINISHED") return false;
    if (dronePos.distanceTo(gate.pos) >= gate.radius) {
      if (this.state === "RACING") this.elapsed += dt;
      return false;
    }
    if (this.state === "IDLE") {
      this.state = "RACING";
      this.elapsed = 0;
      this.gateIndex = 1;
      return false;
    }
    // RACING and just crossed the current gate
    this.gateIndex++;
    if (this.gateIndex >= this.course.gates.length) {
      this.state = "FINISHED";
      this.lastTime = this.elapsed;
      this.lastMedal = medalFor(this.course, this.elapsed);
      return true;
    }
    this.elapsed += dt;
    return false;
  }
}
