import * as THREE from "three";
import { T } from "./Tuning";
import type { AssistMode } from "./Assists";

const ALL_ALIVE = [true, true, true, true];

/** Converts commanded pitch/roll/yaw + throttle into 4 per-motor thrusts.
 *
 *  Two input tiers (milestone 3): keyboard is always effectively
 *  "stabilized" (angle-target PD, tilt capped at tiltCapKeyboard) because a
 *  digital key can't express the stick-deflection granularity true acro
 *  needs. A connected gamepad with assist OFF gets true acro: sticks
 *  command raw angular RATE directly (a rate-damping controller), no angle
 *  target, no tilt cap -- you can flip and dive with nothing correcting you.
 *  Any assist mode other than OFF forces the stabilized angle-PD base
 *  regardless of input source, since POSHOLD/GOVERNOR/AUTOFLARE all assume
 *  an attitude-holding baseline to layer their own honest cost on top of.
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
   *  for this step. angvel/linvel are the body's current world-space
   *  velocities (Rapier gives us these directly). agl is meters above the
   *  (flat) ground, used only by AUTOFLARE. */
  step(
    quat: THREE.Quaternion,
    angvel: THREE.Vector3,
    linvel: THREE.Vector3,
    pitchCmd: number,
    rollCmd: number,
    yawCmd: number,
    throttle: number,
    dt: number,
    mode: AssistMode,
    trueAcro: boolean,
    agl: number,
    alive: boolean[] = ALL_ALIVE,
  ) {
    const { pitch, roll } = this.attitude(quat);
    let torquePitch: number, torqueRoll: number;

    // pitchCmd/rollCmd use an intuitive "stick/key direction" convention:
    // +pitchCmd = forward (W / stick-forward), +rollCmd = rightward (D /
    // stick-right). That's the OPPOSITE sign of the body-frame target
    // angle needed to actually accelerate that way (verified empirically
    // against the live physics: a raw +pitchCmd target angle produced +Z,
    // i.e. backward; a raw +rollCmd target angle produced -X, i.e. left)
    // -- so both are negated here, once, at the point they become angle/
    // rate targets, rather than flipped in Input.ts's key mapping.
    if (mode === "OFF" && trueAcro) {
      // True acro: sticks are a raw rate target, damped toward angular
      // velocity -- no attitude target exists at all, so nothing stops a
      // flip. This IS the "full authority" honest benefit of OFF+gamepad.
      const targetRatePitch = -pitchCmd * T.trueAcroMaxRate,
        targetRateRoll = -rollCmd * T.trueAcroMaxRate;
      torquePitch = T.trueAcroKRate * (targetRatePitch - angvel.x);
      torqueRoll = T.trueAcroKRate * (targetRateRoll - angvel.z);
    } else {
      // Stabilized baseline (keyboard tier, or any assist mode on gamepad):
      // angle-target PD, tilt capped -- can't tumble.
      const targetPitch = -pitchCmd * T.tiltCapKeyboard,
        targetRoll = -rollCmd * T.tiltCapKeyboard;
      torquePitch = this.attitudeKp * (targetPitch - pitch) - this.attitudeKd * angvel.x;
      torqueRoll = this.attitudeKp * (targetRoll - roll) - this.attitudeKd * angvel.z;
    }
    const torqueYaw = this.attitudeKp * 0.4 * (yawCmd * T.maxYawRate - angvel.y);

    // Collective thrust: throttle maps linearly to total force, hover sits
    // near throttle ~0.41 (T.mass*g / (4*maxThrustPerMotor)) so there's
    // real climb authority above it and real descent authority below --
    // command acceleration, never velocity, per the physics-honesty pillar.
    const perMotorTarget = throttle * T.maxThrustPerMotor;
    for (let i = 0; i < 4; i++) {
      // A dead rotor (milestone 5 damage) never spins back up regardless of
      // throttle -- it's not just "weaker," it's gone, which is what makes
      // the resulting thrust asymmetry (and Drone.ts's added yaw-drift
      // torque) something the pilot has to actively trim against.
      const target = alive[i] ? perMotorTarget : 0;
      this.motorThrust[i] += (target - this.motorThrust[i]) * Math.min(1, T.motorSpinUpRate * dt);
    }
    const totalThrust = this.motorThrust.reduce((a, b) => a + b, 0);

    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat),
      force = up.multiplyScalar(totalThrust);

    // --- assist costs: each is an EXTRA force/torque layered on top of the
    // base above, never a softening of the base itself. ---
    if (mode === "POSHOLD") {
      const stickMag = Math.hypot(pitchCmd, rollCmd),
        horizSpeed = Math.hypot(linvel.x, linvel.z);
      if (stickMag < T.posHoldDeadzone && horizSpeed > 0.05)
        // Honest cost: this counter-thrust fights ANY horizontal velocity
        // whenever the sticks are centered, including velocity you built up
        // on purpose a moment ago -- it robs carried speed, it doesn't just
        // prevent drift.
        force.add(new THREE.Vector3(-linvel.x, 0, -linvel.z).multiplyScalar(T.posHoldGain));
    }
    if (mode === "GOVERNOR") {
      const speed = linvel.length();
      if (speed > T.governorMaxSpeed)
        // Soft ceiling via opposing force (never a velocity clamp -- that
        // would violate "command acceleration, never velocity"), but it's
        // a real cost: you cannot out-throttle it, full stop.
        force.add(linvel.clone().normalize().multiplyScalar(-(speed - T.governorMaxSpeed) * 3));
    }
    if (mode === "AUTOFLARE" && agl < T.autoflareAGL && linvel.y < -T.autoflareMaxDescent) {
      const overage = -linvel.y - T.autoflareMaxDescent;
      // Honest cost: this is exactly as strong pointed straight down
      // whether you meant to flare or meant to slam it -- AUTOFLARE cannot
      // tell the difference, so a deliberate fast/hard landing gets fought too.
      force.y += overage * T.autoflareGain;
    }

    const torqueLocal = new THREE.Vector3(torquePitch, torqueYaw, torqueRoll),
      // Torque command is expressed in the body's local axes above; rotate
      // it into world space the same way the force already is, since
      // Rapier's addTorque expects world-frame torque.
      torque = torqueLocal.applyQuaternion(quat);

    return { force, torque, motorThrust: this.motorThrust.slice() };
  }
}
