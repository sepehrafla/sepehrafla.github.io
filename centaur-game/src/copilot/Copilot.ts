import { ThrottleController, type Intent } from "./controllers/ThrottleController";
import { BrakeController, type BrakeIntent } from "./controllers/BrakeController";
import { AirAttitudeController } from "./controllers/AirAttitudeController";

export type Subsystem = "throttle" | "brake" | "airAttitude";
type PinIntent = Intent | BrakeIntent | "level";

/** Step 2 of the CENTAUR build order (CENTAUR_DESIGN.md §7): throttle from
 *  step 1, plus brake ('safety' -- brakes for upcoming slope, deterministic
 *  lookahead) and airAttitude ('level' -- holds pitch through flight and
 *  landing). Bandwidth is 2 concurrent pins for now; tier-gating the
 *  bandwidth to spark progression is deferred to a later step. */
export class Copilot {
  pins: Partial<Record<Subsystem, PinIntent>> = {};
  bandwidth = 2;
  private throttleCtl = new ThrottleController();
  private brakeCtl = new BrakeController();
  private airCtl = new AirAttitudeController();

  isPinned(sub: Subsystem) {
    return sub in this.pins;
  }

  pin(sub: Subsystem, intent: PinIntent) {
    if (!this.isPinned(sub) && Object.keys(this.pins).length >= this.bandwidth) return;
    this.pins[sub] = intent;
    if (sub === "throttle") this.throttleCtl.reset();
    if (sub === "airAttitude") this.airCtl.reset();
  }

  unpin(sub: Subsystem) {
    delete this.pins[sub];
  }

  toggle(sub: Subsystem, intent: PinIntent) {
    if (this.isPinned(sub)) this.unpin(sub);
    else this.pin(sub, intent);
  }

  toggleThrottlePin(intent: Intent = "speed") {
    this.toggle("throttle", intent);
  }

  /** null when throttle isn't delegated -- caller falls back to manual input. */
  throttleOutput(speed: number, maxSpeed: number, dt: number): number | null {
    const intent = this.pins.throttle as Intent | undefined;
    if (!intent) return null;
    return this.throttleCtl.step(intent, speed, maxSpeed, dt);
  }

  /** null when brake isn't delegated. Returns 0..1 brake magnitude. */
  brakeOutput(speed: number, x: number, ground: (x: number) => number): number | null {
    const intent = this.pins.brake as BrakeIntent | undefined;
    if (!intent) return null;
    return this.brakeCtl.step(intent, speed, x, ground);
  }

  /** null when airAttitude isn't delegated. Returns a torque-impulse scale. */
  airAttitudeOutput(rotation: number, angvel: number, dt: number): number | null {
    if (!this.pins.airAttitude) return null;
    return this.airCtl.step(rotation, angvel, dt);
  }
}
