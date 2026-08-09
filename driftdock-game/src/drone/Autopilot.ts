import * as THREE from "three";
import { T, gravity } from "./Tuning";

export type AutopilotCommand = { pitch: number; roll: number; yaw: number; throttle: number };

/** A real PD flight-to-target controller -- not a scripted animation. Given
 *  a target position, computes the same {pitch,roll,yaw,throttle} shape
 *  Input.ts produces, in the same sign convention (see FlightModel.ts's
 *  comment for why pitch/roll are negated where they become body-frame
 *  angle targets), so it drives the identical FlightModel a human pilot
 *  uses. The only "AI" here is the control law; there's no separate fake
 *  physics path for autopilot-driven flight. */
export class Autopilot {
  /** hoverThrottle: the baseline throttle that holds altitude at zero
   *  vertical error/velocity (imported by the caller from Tuning.ts, kept
   *  as a param rather than a second import here to avoid a cycle risk). */
  computeCommand(targetPos: THREE.Vector3, dronePos: THREE.Vector3, droneVel: THREE.Vector3, droneQuat: THREE.Quaternion, hoverThrottle: number): AutopilotCommand {
    const errX = targetPos.x - dronePos.x,
      errZ = targetPos.z - dronePos.z,
      errY = targetPos.y - dronePos.y,
      // Desired world-space horizontal acceleration, PD toward the target.
      desiredAx = T.autopilotKp * errX - T.autopilotKd * droneVel.x,
      desiredAz = T.autopilotKp * errZ - T.autopilotKd * droneVel.z;

    // Rotate the world-space desired acceleration into the drone's CURRENT
    // body-local forward/right axes -- pitch/roll commands are body-frame,
    // and the drone's heading (yaw) can differ from world axes (residual
    // yaw drift, damage bias, etc.), so this can't just assume forward=-Z.
    const bodyForward = new THREE.Vector3(0, 0, -1).applyQuaternion(droneQuat).setY(0).normalize(),
      bodyRight = new THREE.Vector3(1, 0, 0).applyQuaternion(droneQuat).setY(0).normalize(),
      desiredAccel = new THREE.Vector3(desiredAx, 0, desiredAz),
      forwardAccel = desiredAccel.dot(bodyForward),
      rightAccel = desiredAccel.dot(bodyRight);

    // +pitchCmd = forward, +rollCmd = rightward, per FlightModel's
    // documented convention -- normalize by gravity as a physically
    // grounded reference scale (a tilt of ~45deg gives ~1g of lateral
    // accel), then clamp to leave headroom so it doesn't hunt at the cap.
    const clamp = (v: number) => THREE.MathUtils.clamp(v, -T.autopilotMaxTiltCmd, T.autopilotMaxTiltCmd),
      pitch = clamp(forwardAccel / gravity),
      roll = clamp(rightAccel / gravity);

    const throttle = THREE.MathUtils.clamp(
      hoverThrottle + T.autopilotThrottleKp * errY * 0.1 - T.autopilotThrottleKd * droneVel.y * 0.1,
      0,
      1,
    );

    return { pitch, roll, yaw: 0, throttle };
  }

  /** True once the drone is within arrival tolerance and slow -- "close
   *  enough to call it arrived," not just close (a fast flyby at the exact
   *  point shouldn't count, or MINE/DELIVER would trigger mid-pass). */
  hasArrived(targetPos: THREE.Vector3, dronePos: THREE.Vector3, droneVel: THREE.Vector3): boolean {
    return dronePos.distanceTo(targetPos) < T.autopilotArriveRadius && droneVel.length() < 2.5;
  }
}
