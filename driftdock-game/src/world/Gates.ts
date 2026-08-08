import * as THREE from "three";
import { T } from "../drone/Tuning";

/** Pose-gate math: position + velocity + attitude tolerance checks, shared
 *  by every precision section (MovingDock now, SlotThread/InvertedDock
 *  later). Pure functions -- no state, no Rapier/THREE object mutation --
 *  so a section just calls this each frame with fresh numbers. */
export type PoseError = {
  positionError: number; // m, straight-line distance to target point
  lateralError: THREE.Vector2; // m, target-relative screen-plane offset (x=right, y=up) for the HUD crosshair
  closureRate: number; // m/s, drone velocity relative to target velocity, signed toward the target
  attitudeErrorDeg: number; // deg, angle between drone's up vector and the target's expected up vector
};

/** dronePos/droneVel/droneQuat: current physics state. targetPos/targetVel:
 *  the dock/gate's current position and velocity (velocity matters because
 *  docks patrol -- closure rate is relative motion, not raw speed).
 *  targetUp: the orientation the drone must match (world up for an upright
 *  dock, -up for an InvertedDock later). camQuat: camera orientation, used
 *  only to resolve lateralError into a screen-relative left/right + up/down
 *  pair for the crosshair. */
export function poseError(
  dronePos: THREE.Vector3,
  droneVel: THREE.Vector3,
  droneQuat: THREE.Quaternion,
  targetPos: THREE.Vector3,
  targetVel: THREE.Vector3,
  targetUp: THREE.Vector3,
  camQuat: THREE.Quaternion,
): PoseError {
  const toTarget = new THREE.Vector3().subVectors(targetPos, dronePos),
    positionError = toTarget.length(),
    relVel = new THREE.Vector3().subVectors(droneVel, targetVel),
    // Positive = closing distance (approaching), negative = separating --
    // projecting relative velocity onto the direction-to-target.
    closureRate = positionError > 1e-4 ? relVel.dot(toTarget) / positionError : 0,
    droneUp = new THREE.Vector3(0, 1, 0).applyQuaternion(droneQuat),
    attitudeErrorDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(droneUp.dot(targetUp), -1, 1)));

  // Resolve the offset into camera-relative right/up so the HUD crosshair
  // moves the way the pilot actually sees it, not raw world axes.
  const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camQuat),
    camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camQuat),
    offset = toTarget.clone().negate(), // drone-relative-to-target, i.e. which way to correct
    lateralError = new THREE.Vector2(offset.dot(camRight), offset.dot(camUp));

  return { positionError, lateralError, closureRate, attitudeErrorDeg };
}

export function withinDockTolerance(e: PoseError): boolean {
  return e.positionError < T.dockPositionTol && Math.abs(e.closureRate) < T.dockClosureTol && e.attitudeErrorDeg < T.dockAttitudeTolDeg;
}
