/** Milestone 3: flight-assist modules, cyclable via F (keyboard) or the
 *  gamepad's assist button. Per the brief: each assist is an HONEST TRADE --
 *  one real benefit, one real mechanical cost -- never a pure difficulty
 *  setting. FlightModel.ts reads `mode` each step and applies the actual
 *  physics consequence; this file is just the catalog + cycling order. */
export type AssistMode = "OFF" | "STABILIZE" | "POSHOLD" | "GOVERNOR" | "AUTOFLARE";

export const ASSIST_ORDER: AssistMode[] = ["OFF", "STABILIZE", "POSHOLD", "GOVERNOR", "AUTOFLARE"];

export const ASSIST_INFO: Record<AssistMode, { label: string; benefit: string; cost: string }> = {
  // Keyboard is ALWAYS the stabilized angle-PD baseline already (see
  // FlightModel.ts's top comment) -- STABILIZE only changes anything for a
  // connected gamepad (forces that same safe baseline over true acro).
  // Reported directly as "F doesn't really change anything" -- true, for
  // exactly this one step, on keyboard -- so the benefit text now says so
  // instead of silently doing nothing.
  OFF: { label: "OFF", benefit: "full authority, true acro on gamepad", cost: "no auto-level, can flip and dive uncorrected" },
  STABILIZE: {
    label: "STABILIZE",
    benefit: "auto-levels, tilt capped -- can't tumble (gamepad only; keyboard is always this)",
    cost: "hard tilt ceiling caps max acceleration",
  },
  POSHOLD: {
    label: "POSHOLD",
    benefit: "brakes toward zero velocity when centered -- steadies mining hover",
    cost: "constant counter-thrust robs top speed",
  },
  GOVERNOR: { label: "GOVERNOR", benefit: "hard speed ceiling, can't overspeed", cost: "top speed capped even when you want to push it" },
  AUTOFLARE: {
    label: "AUTOFLARE",
    benefit: "arrests descent rate near the ground -- softens pad touchdowns",
    cost: "fights you on purpose-fast, purpose-hard landings",
  },
};

export function nextAssist(mode: AssistMode): AssistMode {
  return ASSIST_ORDER[(ASSIST_ORDER.indexOf(mode) + 1) % ASSIST_ORDER.length];
}
