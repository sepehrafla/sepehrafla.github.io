export type Intent = "speed" | "safety";

/** Plain PID toward a setpoint the objective defines. No ML, no randomness --
 *  every failure is legible as "the setpoint was wrong for this terrain,"
 *  never "the AI got unlucky." See CENTAUR_DESIGN.md §3. */
export class ThrottleController {
  integral = 0;
  lastErr = 0;
  kp = 0.16;
  ki = 0.015;
  kd = 0.01;

  setpointFor(intent: Intent, maxSpeed: number) {
    // 'speed': always floor it -- this is exactly why a fully-delegated bike
    // never finds the cave. Nothing in this function scores curiosity.
    if (intent === "speed") return maxSpeed;
    // 'safety': comfortably below max, leaves margin for upcoming terrain.
    return maxSpeed * 0.55;
  }

  /** speed/maxSpeed in m/s. Returns 0..1 throttle magnitude (no reverse). */
  step(intent: Intent, speed: number, maxSpeed: number, dt: number) {
    const target = this.setpointFor(intent, maxSpeed),
      err = target - speed;
    this.integral = Math.max(-40, Math.min(40, this.integral + err * dt));
    const deriv = dt > 1e-4 ? (err - this.lastErr) / dt : 0;
    this.lastErr = err;
    const out = this.kp * err + this.ki * this.integral + this.kd * deriv;
    return Math.max(0, Math.min(1, out));
  }

  reset() {
    this.integral = 0;
    this.lastErr = 0;
  }
}
