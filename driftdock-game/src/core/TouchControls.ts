const MAX_RADIUS = 46; // px, matches the CSS base ring's usable travel
const DEADZONE = 0.08; // same threshold Input.ts's gamepad tier uses on yaw/pitch/roll

export type TouchState = {
  active: boolean; // true while at least one stick is currently touched
  pitch: number;
  roll: number;
  yaw: number;
  throttle: number;
};

/** Two on-screen virtual joysticks (left = throttle/yaw, right = pitch/roll)
 *  plus AI/camera/restart buttons -- the only way to play this game on a
 *  touchscreen at all, since there's no keyboard there. The axis mapping
 *  and formulas below are a direct mirror of Input.ts's existing gamepad
 *  tier (`readGamepad()`) -- same Mode-2 RC layout, same sign conventions,
 *  same throttle formula -- so this is provably consistent with an
 *  already-shipped, already-correct control scheme rather than a new one
 *  invented from scratch.
 *
 *  Buttons dispatch real KeyboardEvents (KeyV/KeyC/KeyR) instead of
 *  duplicating main.ts's key-handling logic -- the same
 *  dispatchEvent(new KeyboardEvent(...)) pattern already used for this
 *  project's own console-driven testing, so a tap and a physical keypress
 *  are provably the same code path, not two forks that can drift apart. */
export class TouchControls {
  static get isTouchDevice() {
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }

  private leftId: number | null = null;
  private rightId: number | null = null;
  private leftX = 0;
  private leftY = 0; // -1..1, raw stick offset -- same sign convention as a gamepad axis (up = negative)
  private rightX = 0;
  private rightY = 0;
  private leftEl: HTMLElement;
  private rightEl: HTMLElement;
  private leftKnob: HTMLElement;
  private rightKnob: HTMLElement;
  private aiBtn: HTMLButtonElement;

  constructor(private root: HTMLElement) {
    this.leftEl = req(root, "#tc-left");
    this.rightEl = req(root, "#tc-right");
    this.leftKnob = req(root, "#tc-left-knob");
    this.rightKnob = req(root, "#tc-right-knob");
    this.aiBtn = req(root, "#tc-ai") as HTMLButtonElement;
    root.classList.remove("hide");

    this.leftEl.addEventListener("touchstart", (e) => this.onStart(e, "left"), { passive: false });
    this.rightEl.addEventListener("touchstart", (e) => this.onStart(e, "right"), { passive: false });
    // touchmove/end are on window, not the stick element -- a finger that
    // drags off the small base circle must keep steering until it actually
    // lifts, exactly like a real analog stick's travel isn't bounded by
    // where you first touched.
    addEventListener("touchmove", (e) => this.onMove(e), { passive: false });
    addEventListener("touchend", (e) => this.onEnd(e));
    addEventListener("touchcancel", (e) => this.onEnd(e));

    this.wireButton("#tc-ai", "KeyV");
    this.wireButton("#tc-cam", "KeyC");
    this.wireButton("#tc-restart", "KeyR");
  }

  /** Reflects moonBase.aiEngaged onto the AI button so it's obvious at a
   *  glance whether a tap is about to engage or disengage -- call once per
   *  frame from main.ts, same as the rest of the HUD. */
  setAiEngaged(engaged: boolean) {
    this.aiBtn.classList.toggle("active", engaged);
  }

  read(): TouchState {
    return {
      active: this.leftId !== null || this.rightId !== null,
      // Mirrors Input.ts's readGamepad() exactly: axes[3]-equivalent (up =
      // negative) negated so "drag up/forward" = +pitch, per FlightModel's
      // "+pitchCmd = forward" convention.
      pitch: -dz(this.rightY),
      roll: dz(this.rightX),
      yaw: dz(this.leftX),
      throttle: clamp01((1 - this.leftY) / 2),
    };
  }

  private wireButton(sel: string, code: string) {
    const btn = req(this.root, sel);
    btn.addEventListener(
      "click",
      () => {
        dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
        dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
        if (navigator.vibrate) navigator.vibrate(8);
      },
      { passive: true },
    );
  }

  private onStart(e: TouchEvent, side: "left" | "right") {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (side === "left" && this.leftId === null) this.leftId = t.identifier;
    if (side === "right" && this.rightId === null) this.rightId = t.identifier;
  }

  private onMove(e: TouchEvent) {
    let handled = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.leftId) {
        this.updateStick(this.leftEl, this.leftKnob, t, "left");
        handled = true;
      }
      if (t.identifier === this.rightId) {
        this.updateStick(this.rightEl, this.rightKnob, t, "right");
        handled = true;
      }
    }
    if (handled) e.preventDefault();
  }

  private updateStick(base: HTMLElement, knob: HTMLElement, t: Touch, side: "left" | "right") {
    const r = base.getBoundingClientRect(),
      cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    let dx = t.clientX - cx,
      dy = t.clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_RADIUS) {
      dx = (dx * MAX_RADIUS) / dist;
      dy = (dy * MAX_RADIUS) / dist;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    if (side === "left") {
      this.leftX = dx / MAX_RADIUS;
      this.leftY = dy / MAX_RADIUS;
    } else {
      this.rightX = dx / MAX_RADIUS;
      this.rightY = dy / MAX_RADIUS;
    }
  }

  private onEnd(e: TouchEvent) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.leftId) {
        this.leftId = null;
        this.leftX = 0;
        this.leftY = 0;
        this.leftKnob.style.transform = "";
      }
      if (t.identifier === this.rightId) {
        this.rightId = null;
        this.rightX = 0;
        this.rightY = 0;
        this.rightKnob.style.transform = "";
      }
    }
  }
}

function req(root: HTMLElement, sel: string) {
  const el = root.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`TouchControls: missing element ${sel}`);
  return el;
}

function dz(v: number) {
  return Math.abs(v) < DEADZONE ? 0 : v;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
