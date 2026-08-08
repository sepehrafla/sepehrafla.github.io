import { ThrottleController, type Intent } from "./controllers/ThrottleController";

export type Subsystem = "throttle";

/** Step 1 of the CENTAUR build order (see CENTAUR_DESIGN.md §7): one
 *  pinnable subsystem (throttle), one intent the player can choose (speed),
 *  no conditions, no drone, no bots yet. Deliberately the smallest slice
 *  that proves the core loop: pin it, then use the freed attention to lean
 *  through terrain you couldn't otherwise react to in time. */
export class Copilot {
  pins: Partial<Record<Subsystem, Intent>> = {};
  bandwidth = 1;
  private throttleCtl = new ThrottleController();

  isPinned(sub: Subsystem) {
    return sub in this.pins;
  }

  pin(sub: Subsystem, intent: Intent) {
    if (!this.isPinned(sub) && Object.keys(this.pins).length >= this.bandwidth) return;
    this.pins[sub] = intent;
    if (sub === "throttle") this.throttleCtl.reset();
  }

  unpin(sub: Subsystem) {
    delete this.pins[sub];
  }

  toggleThrottlePin(intent: Intent = "speed") {
    if (this.isPinned("throttle")) this.unpin("throttle");
    else this.pin("throttle", intent);
  }

  /** null when throttle isn't delegated -- caller falls back to manual input. */
  throttleOutput(speed: number, maxSpeed: number, dt: number): number | null {
    const intent = this.pins.throttle;
    if (!intent) return null;
    return this.throttleCtl.step(intent, speed, maxSpeed, dt);
  }
}
