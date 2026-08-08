import { T, hoverThrottle } from "../drone/Tuning";

/** Keyboard rate model: keys command a target rate; pitch/roll/yaw command
 *  values (-1..1) chase that target through an attack/release envelope so a
 *  tap reads as a small nudge and a hold reads as full authority. Gamepad
 *  acro tier (true two-stick, no envelope, no tilt cap) is milestone 3 --
 *  this class is keyboard-only for milestone 1's gate. */
export class Input {
  pitch = 0; // -1 = nose down, +1 = nose up (stick convention; sign resolved in FlightModel)
  roll = 0;
  yaw = 0;
  throttle = hoverThrottle; // 0..1 setpoint, Shift/Ctrl ramp it -- starts at the
  // computed hover point (not a flat 0.5) so the drone actually hovers on
  // spawn instead of climbing away by default
  brakeHeld = false; // Space -- momentum-brake assist, wired in a later milestone
  restart = false; // edge-triggered
  cycleAssist = false; // edge-triggered

  private keys = new Set<string>();

  constructor() {
    addEventListener(
      "keydown",
      (e) => {
        if (
          ["KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "Space"].includes(
            e.code,
          )
        )
          e.preventDefault();
        if (e.code === "KeyR" && !this.keys.has("KeyR")) this.restart = true;
        if (e.code === "KeyF" && !this.keys.has("KeyF")) this.cycleAssist = true;
        this.keys.add(e.code);
      },
      { passive: false },
    );
    addEventListener("keyup", (e) => this.keys.delete(e.code));
    addEventListener("blur", () => this.keys.clear());
  }

  consumeRestart() {
    const v = this.restart;
    this.restart = false;
    return v;
  }

  consumeCycleAssist() {
    const v = this.cycleAssist;
    this.cycleAssist = false;
    return v;
  }

  /** Advances the smoothed pitch/roll/yaw commands and the throttle setpoint.
   *  Call once per fixed physics step (120Hz), not once per render frame --
   *  the attack/release rates in Tuning.ts are calibrated in 1/s and need a
   *  stable dt to feel consistent. */
  step(dt: number) {
    const targetPitch = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0),
      targetRoll = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0),
      targetYaw = (this.keys.has("KeyE") ? 1 : 0) - (this.keys.has("KeyQ") ? 1 : 0);
    this.pitch = chase(this.pitch, targetPitch, dt);
    this.roll = chase(this.roll, targetRoll, dt);
    this.yaw = chase(this.yaw, targetYaw, dt);
    this.brakeHeld = this.keys.has("Space");
    const throttleUp = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      throttleDown = this.keys.has("ControlLeft") || this.keys.has("ControlRight");
    if (throttleUp) this.throttle = Math.min(1, this.throttle + T.throttleRate * dt);
    if (throttleDown) this.throttle = Math.max(0, this.throttle - T.throttleRate * dt);
  }
}

function chase(current: number, target: number, dt: number) {
  const rate = Math.abs(target) > Math.abs(current) ? T.rateAttack : T.rateRelease;
  const delta = target - current;
  return Math.abs(delta) < rate * dt ? target : current + Math.sign(delta) * rate * dt;
}
