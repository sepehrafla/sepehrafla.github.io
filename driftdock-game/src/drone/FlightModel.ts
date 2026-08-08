import * as THREE from "three";
import { T } from "./Tuning";

/** Converts commanded pitch/roll/yaw + throttle into 4 per-motor thrusts.
 *  Keyboard tier only for milestone 1: commands are ANGLE targets (capped
 *  at tiltCapKeyboard), not raw rates, because the brief's keyboard tier is
 *  always effectively "stabilized" (can't tumble, capped tilt) -- the full
 *  Assists.ts toggle system that makes this optional is milestone 3.
 *
 *  Axis convention (three.js-standard body-local frame): +X = right,
 *  +Y = up, -Z = forward. Pitch = rotation about local X (nose up/down).
 *  Roll = rotation about local Z, i.e. the forward axis (banking). Yaw =
 *  rotation about local Y (heading). */
export class FlightModel {
  private motorThrust = [0, 0, 0, 0]; // front-right, front-left, back-left, back-right -- spun up/down smoothly, not stepped
  private tmpFwd = new THREE.Vector3();
  private tmpRight = new THREE.Vector3();
  // Public + independently tunable (not derived from one another) so they
  // can be swept live during testing. See the empirical-tuning note on
  // `step()` for why a single levelGain-derived kp/kd pair oscillated into
  // NaN instead of converging.
  attitudeKp = T.attitudeKp;
  attitudeKd = T.attitudeKd;

  /** Reads the body's current tilt from its quaternion. Returns
   *  {pitch, roll} in radians, positive pitch = nose up, positive roll =
   *  right side up (banking left). Small-angle-safe via asin of the
   *  forward/right vectors' Y components, exact (not an approximation) for
   *  any tilt short of gimbal lock at +/-90deg pitch. */
  attitude(quat: THREE.Quaternion) {
    this.tmpFwd.set(0, 0, -1).applyQuaternion(quat);
    this.tmpRight.set(1, 0, 0).applyQuaternion(quat);
    const pitch = Math.asin(THREE.MathUtils.clamp(this.tmpFwd.y, -1, 1)),
      roll = Math.asin(THREE.MathUtils.clamp(this.tmpRight.y, -1, 1));
    return { pitch, roll };
  }

  /** Returns {force: Vector3 (world), torque: Vector3 (world), motorThrust}
   *  for this step. angvel is the body's current world-space angular
   *  velocity (Rapier gives us this directly). */
  step(
    quat: THREE.Quaternion,
    angvel: THREE.Vector3,
    pitchCmd: number,
    rollCmd: number,
    yawCmd: number,
    throttle: number,
    dt: number,
  ) {
    const { pitch, roll } = this.attitude(quat),
      targetPitch = pitchCmd * T.tiltCapKeyboard,
      targetRoll = rollCmd * T.tiltCapKeyboard,
      // PD toward the tilt target, D term damps actual angular velocity
      // (not a finite-differenced angle -- see AirAttitudeController's
      // note in the 2D project's CENTAUR_DESIGN.md for why that matters:
      // a naive position-derivative spikes at wrap boundaries/fast spins).
      torquePitch = this.attitudeKp * (targetPitch - pitch) - this.attitudeKd * angvel.x,
      torqueRoll = this.attitudeKp * (targetRoll - roll) - this.attitudeKd * angvel.z,
      torqueYaw = this.attitudeKp * 0.4 * (yawCmd * T.maxYawRate - angvel.y);

    // Collective thrust: throttle maps linearly to total force, hover sits
    // near throttle ~0.41 (T.mass*g / (4*maxThrustPerMotor)) so there's
    // real climb authority above it and real descent authority below --
    // command acceleration, never velocity, per the physics-honesty pillar.
    const perMotorTarget = throttle * T.maxThrustPerMotor;
    for (let i = 0; i < 4; i++)
      this.motorThrust[i] += (perMotorTarget - this.motorThrust[i]) * Math.min(1, T.motorSpinUpRate * dt);
    const totalThrust = this.motorThrust.reduce((a, b) => a + b, 0);

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat),
      force = up.multiplyScalar(totalThrust),
      // Torque command is expressed in the body's local axes above; rotate
      // it into world space the same way the force already is, since
      // Rapier's addTorque expects world-frame torque.
      torqueLocal = new THREE.Vector3(torquePitch, torqueYaw, torqueRoll),
      torque = torqueLocal.applyQuaternion(quat);

    return { force, torque, motorThrust: this.motorThrust.slice() };
  }
}
