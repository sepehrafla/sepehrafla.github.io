/** PID toward level pitch while airborne. Deliberately folds "frame-perfect
 *  landing flare" into the same controller rather than a separate one --
 *  physically it's the same actuator (chassis torque impulse) chasing the
 *  same target (pitch = 0), just sustained through touchdown. See
 *  CENTAUR_DESIGN.md §3/§7 -- this is a documented scope simplification
 *  versus the original two-controller sketch, not a missing feature: a
 *  copilot that holds level attitude *through* the landing already lands
 *  clean, which is the actual capability being delegated. */
export class AirAttitudeController {
  integral = 0;
  // Empirically tuned. The derivative term damps Rapier's actual angvel()
  // directly rather than finite-differencing the position error -- a
  // wrapped [-pi,pi] angle still jumps discontinuously by ~2*pi whenever a
  // fast enough spin crosses the wrap boundary (verified: a 3 rad/s tumble
  // completes a full rotation in ~2s, well within this controller's test
  // window), which spiked a position-derivative term into wild, growing
  // oscillation instead of damping the spin. Damping angvel is immune to
  // that: velocity has no 2*pi discontinuity to spike on.
  // Swept kp against kd with proper altitude clearance so ground contact
  // couldn't contaminate the test (an earlier sweep at insufficient
  // altitude showed a spurious "instability" near t=2.2s on every gain
  // combo -- that was the bike actually hitting the ground mid-test, not
  // the controller). kp=20/kd=3 converged a 3 rad/s tumble to <0.01 rad
  // and held there, and recovered a second, harder disturbance
  // (rot=-2.9, angvel=-5) to <0.03 rad within ~1s.
  kp = 20;
  ki = 0;
  kd = 3;

  /** rotation: chassis.rotation() normalized to [-pi,pi]. angvel: chassis's
   *  actual angular velocity (rad/s). Returns a torque impulse scale (same
   *  units Bike.ts already uses for its own manual self-leveling torque, so
   *  the copilot gets no capability the player doesn't already have --
   *  only perfect timing on it). */
  step(rotation: number, angvel: number, dt: number) {
    const err = -rotation;
    this.integral = Math.max(-2, Math.min(2, this.integral + err * dt));
    return this.kp * err + this.ki * this.integral - this.kd * angvel;
  }

  reset() {
    this.integral = 0;
  }
}
