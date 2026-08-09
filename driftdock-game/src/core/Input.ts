import { T, hoverThrottle } from "../drone/Tuning";

const DEADZONE = 0.08;

/** Two input tiers, per the brief: keyboard is a rate-simplified model
 *  (attack/release envelope, always effectively stabilized). A connected
 *  gamepad drives raw stick values straight through -- no envelope, no
 *  smoothing -- which is what makes milestone 3's true-acro assist mode
 *  possible (FlightModel treats OFF+gamepad specially). Auto-detected via
 *  the standard gamepadconnected event; falls back to keyboard the instant
 *  no gamepad is present. */
export class Input {
  pitch = 0; // -1 = nose down, +1 = nose up (stick convention; sign resolved in FlightModel)
  roll = 0;
  yaw = 0;
  throttle = hoverThrottle; // 0..1 setpoint, Shift/Ctrl ramp it (keyboard) or the left stick sets it directly (gamepad) -- starts at the
  // computed hover point (not a flat 0.5) so the drone actually hovers on
  // spawn instead of climbing away by default
  brakeHeld = false; // Space -- momentum-brake assist, wired in a later milestone
  restart = false; // edge-triggered
  cycleAssist = false; // edge-triggered
  gamepadConnected = false;

  private keys = new Set<string>();
  private gamepadIndex: number | null = null;
  private prevButtons: boolean[] = [];

  constructor() {
    addEventListener(
      "keydown",
      (e) => {
        // Cmd/Meta (macOS) suppresses the keyup for any other key still
        // physically held once Meta itself is pressed -- a documented OS/
        // browser quirk, not a bug in this code -- so a player who taps Cmd
        // mid-flight (even by accident, e.g. reaching for Cmd+Tab) can leave
        // a movement key permanently stuck "held" in `keys` with no keyup
        // ever coming to clear it, producing exactly the kind of sustained
        // un-commanded drift/instability a player would describe as the
        // drone "getting confused." Bailing out entirely on any keydown
        // carrying metaKey (and clearing below) means we never add a key
        // that might not get a matching keyup.
        if (e.metaKey) {
          this.keys.clear();
          return;
        }
        if (
          ["KeyW", "KeyS", "KeyA", "KeyD", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)
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
    // Defense in depth: some browsers fire visibilitychange on a tab/app
    // switch without a matching window blur (blur is the common path, but
    // not guaranteed on every platform) -- clearing here too closes that gap.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.keys.clear();
    });

    addEventListener("gamepadconnected", (e) => {
      this.gamepadIndex = e.gamepad.index;
      this.gamepadConnected = true;
    });
    addEventListener("gamepaddisconnected", (e) => {
      if (e.gamepad.index === this.gamepadIndex) {
        this.gamepadIndex = null;
        this.gamepadConnected = false;
      }
    });
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
    if (this.gamepadConnected && this.readGamepad()) return;

    // Field convention: +pitch = forward (W), +roll = rightward (D), +yaw =
    // turn left (ArrowLeft) -- verified against the live physics rather
    // than assumed; FlightModel.ts negates pitch/roll internally where they
    // become body-frame angle targets (see its comment for why).
    const targetPitch = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0),
      targetRoll = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0),
      targetYaw = (this.keys.has("ArrowLeft") ? 1 : 0) - (this.keys.has("ArrowRight") ? 1 : 0);
    this.pitch = chase(this.pitch, targetPitch, dt);
    this.roll = chase(this.roll, targetRoll, dt);
    this.yaw = chase(this.yaw, targetYaw, dt);
    this.brakeHeld = this.keys.has("Space");
    const throttleUp = this.keys.has("ArrowUp"),
      throttleDown = this.keys.has("ArrowDown");
    if (throttleUp) this.throttle = Math.min(1, this.throttle + T.throttleRate * dt);
    if (throttleDown) this.throttle = Math.max(0, this.throttle - T.throttleRate * dt);
  }

  /** Mode-2 RC layout: left stick = throttle (Y) + yaw (X), right stick =
   *  pitch (Y) + roll (X). Raw pass-through, no envelope -- true acro needs
   *  the stick's actual instantaneous deflection, not a chased target.
   *  Returns false if the gamepad object isn't available this frame
   *  (disconnected mid-flight, browser quirk) so step() can fall back. */
  private readGamepad(): boolean {
    const pad = navigator.getGamepads?.()[this.gamepadIndex!];
    if (!pad) return false;
    const dz = (v: number) => (Math.abs(v) < DEADZONE ? 0 : v);
    this.yaw = dz(pad.axes[0] ?? 0);
    this.throttle = clamp01((1 - (pad.axes[1] ?? -1)) / 2);
    this.roll = dz(pad.axes[2] ?? 0);
    this.pitch = -dz(pad.axes[3] ?? 0);
    this.brakeHeld = !!pad.buttons[6]?.pressed; // left trigger
    const btnR = !!pad.buttons[0]?.pressed, // A/cross -- restart
      btnCycle = !!pad.buttons[1]?.pressed; // B/circle -- cycle assist
    if (btnR && !this.prevButtons[0]) this.restart = true;
    if (btnCycle && !this.prevButtons[1]) this.cycleAssist = true;
    this.prevButtons = pad.buttons.map((b) => b.pressed);
    return true;
  }
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function chase(current: number, target: number, dt: number) {
  const rate = Math.abs(target) > Math.abs(current) ? T.rateAttack : T.rateRelease;
  const delta = target - current;
  return Math.abs(delta) < rate * dt ? target : current + Math.sign(delta) * rate * dt;
}
