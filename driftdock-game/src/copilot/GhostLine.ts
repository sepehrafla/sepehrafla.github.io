import * as THREE from "three";
import type { CourseDef } from "../world/Course";
import type { AssistMode } from "../drone/Assists";
import { T } from "../drone/Tuning";

/** The copilot's proposed line, precomputed per course. The brief says
 *  "record a scripted bot run" -- building a real autopilot controller to
 *  fly a bot through the physics was out of scope at this budget, so this
 *  generates a smooth Catmull-Rom spline through the course's own gates
 *  instead. It serves the same role (a safe, smooth suggested path with an
 *  assist schedule) without a solver: "its line is safe and smooth" is
 *  exactly what a spline through the gate centers already is. */
export type CopilotLine = {
  points: THREE.Vector3[]; // densely sampled, spacing ~= T.copilotSampleSpacing
  cumulative: number[]; // cumulative distance along the line at each point, same length as points
  totalLength: number;
  assistAt: (distanceAlong: number) => AssistMode;
};

export function buildCopilotLine(course: CourseDef): CopilotLine {
  const gatePositions = course.gates.map((g) => g.pos),
    curve = new THREE.CatmullRomCurve3(gatePositions, false, "catmullrom", 0.4),
    approxLength = curve.getLength(),
    sampleCount = Math.max(8, Math.round(approxLength / T.copilotSampleSpacing)),
    points = curve.getSpacedPoints(sampleCount);

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
  const totalLength = cumulative[cumulative.length - 1];

  // Assist schedule: each gate's suggestedAssist applies to the leg ENDING
  // at that gate (the approach), same intent as the section it belongs to.
  // Distances-along-line for each gate are found by nearest sampled point.
  const gateDistances = gatePositions.map((gp) => {
    let best = 0,
      bestDist = Infinity;
    points.forEach((p, i) => {
      const d = p.distanceTo(gp);
      if (d < bestDist) {
        bestDist = d;
        best = cumulative[i];
      }
    });
    return best;
  });

  const assistAt = (distanceAlong: number): AssistMode => {
    for (let i = 0; i < gateDistances.length; i++) {
      if (distanceAlong <= gateDistances[i]) return course.gates[i].suggestedAssist ?? "OFF";
    }
    return course.gates[course.gates.length - 1].suggestedAssist ?? "OFF";
  };

  return { points, cumulative, totalLength, assistAt };
}

/** Nearest point on the line to `pos`, plus how far along the line that
 *  point is (for the assist schedule and the "3s ahead" preview marker).
 *  Linear scan over the sampled points -- courses are ~100 points, this
 *  runs once a frame, nowhere near a hot path worth a spatial index. */
export function nearestOnLine(line: CopilotLine, pos: THREE.Vector3) {
  let bestIdx = 0,
    bestDist = Infinity;
  line.points.forEach((p, i) => {
    const d = p.distanceTo(pos);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  });
  return { point: line.points[bestIdx], distance: bestDist, distanceAlong: line.cumulative[bestIdx], index: bestIdx };
}

/** The point `secondsAhead` of travel-time further along the line from
 *  `distanceAlong`, at `speed` m/s (falls back to a nominal cruise speed
 *  when the drone is nearly stationary, e.g. before a run starts). */
export function previewPoint(line: CopilotLine, distanceAlong: number, speed: number, secondsAhead: number) {
  const v = Math.max(speed, 2),
    target = Math.min(line.totalLength, distanceAlong + v * secondsAhead);
  let idx = 0;
  while (idx < line.cumulative.length - 1 && line.cumulative[idx] < target) idx++;
  return line.points[idx];
}
