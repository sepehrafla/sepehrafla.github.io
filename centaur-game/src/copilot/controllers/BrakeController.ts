export type BrakeIntent = "safety";

/** Looks a fixed distance ahead along the height field and brakes toward a
 *  speed that respects upcoming slope -- same "no ML, deterministic" rule
 *  as ThrottleController. Pin failure mode: pin 'safety' on a straight,
 *  flat run and it brakes for terrain that was never going to be a
 *  problem -- readable, not random. */
export class BrakeController {
  lookaheadM = 9;

  /** Returns 0..1 brake magnitude, continuous (not an impulse -- caller
   *  applies it every fixed step like manual brake input would be). */
  step(_intent: BrakeIntent, speed: number, x: number, ground: (x: number) => number) {
    const here = ground(x),
      ahead = ground(x + this.lookaheadM),
      drop = here - ahead, // positive = descending ahead (needs less brake), negative = climbing (more)
      rise = Math.max(0, -drop),
      // Comfortable climb rate scales the safe speed down as the slope
      // ahead steepens; flat or descending ground barely brakes at all.
      safeSpeed = Math.max(4, 16 - rise * 3.4),
      err = speed - safeSpeed;
    return err <= 0 ? 0 : Math.max(0, Math.min(1, err * 0.35));
  }
}
