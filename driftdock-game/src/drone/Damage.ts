import { T } from "./Tuning";

/** Rotor-loss state machine, per the brief: "obstacle contact above force
 *  threshold at speed = lose a rotor... three-rotor flight is flyable with
 *  constant yaw drift... two rotors = crash." Pure state -- no Rapier/THREE
 *  here; Drone.ts feeds it contact forces and reads `alive`/`crashed` each
 *  step, main.ts wires the actual contact-force events and repair pads. */
export class Damage {
  alive = [true, true, true, true];
  crashed = false;
  private cooldown = 0;

  /** Call from the physics contact-force callback with the event's total
   *  force magnitude. A cooldown after each loss stops one violent impact
   *  (which can generate several contact-force events in quick succession)
   *  from stripping all four rotors at once. */
  registerContact(force: number) {
    if (this.crashed || this.cooldown > 0 || force < T.damageForceThreshold) return;
    const idx = this.alive.findIndex((a) => a);
    if (idx === -1) return;
    this.alive[idx] = false;
    this.cooldown = T.damageCooldown;
    const aliveCount = this.alive.filter(Boolean).length;
    if (aliveCount <= 2) this.crashed = true;
    return idx;
  }

  tick(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);
  }

  /** Repair pads restore exactly one lost rotor per the brief ("brief hover
   *  to fix" -- singular result per pad visit, not a full reset). Returns
   *  the restored index, or -1 if already at full health. */
  repairOne() {
    const idx = this.alive.findIndex((a) => !a);
    if (idx !== -1) this.alive[idx] = true;
    return idx;
  }

  aliveCount() {
    return this.alive.filter(Boolean).length;
  }

  reset() {
    this.alive = [true, true, true, true];
    this.crashed = false;
    this.cooldown = 0;
  }
}
