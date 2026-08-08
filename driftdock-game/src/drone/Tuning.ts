// All constants live here so a full retune is a one-file diff. Values below
// are starting points for milestone 1 -- expect these to move once actual
// flight testing (not just static analysis) happens, same lesson learned
// repeatedly on the 2D project's motor torque/PID gains: Rapier's applied
// force/impulse units rarely match a naive "physically plausible" guess on
// the first try. Verify empirically before trusting any number here.
export const T = {
  step: 1 / 120,

  // --- airframe ---
  mass: 1, // kg, per brief ("mass ~1")
  armLength: 0.15, // m, rotor distance from center (X configuration)
  linearDamping: 0.05, // air resistance only -- no arcade brakes, ever
  angularDamping: 2.2,

  // --- propulsion ---
  // Thrust-to-weight ~2.4:1 at full throttle on all 4 motors, typical for a
  // racing-class FPV frame. hoverThrustPerMotor is derived, not hand-set,
  // so gravity changes never silently break hover.
  maxThrustPerMotor: 6, // N
  motorSpinUpRate: 40, // 1/s, how fast per-motor thrust chases its target (near-instant but not a step function)

  // --- keyboard rate model ---
  // Keys command angular RATE (rad/s), not angle -- attack/release envelope
  // shapes taps into small corrections and holds into full authority.
  maxPitchRate: 2.4, // rad/s
  maxRollRate: 2.4,
  maxYawRate: 3.2,
  rateAttack: 9, // 1/s, how fast commanded rate ramps toward the key-held target
  rateRelease: 6, // 1/s, how fast it decays back to 0 on key-up
  tiltCapKeyboard: (35 * Math.PI) / 180, // rad -- stabilize-mode ceiling, never exceeded on keyboard tier
  // Attitude PD gains. NOT guessable from "reasonable-looking" numbers --
  // the collider's small size gives it a tiny moment of inertia (a box
  // 0.24x0.1x0.24m, Ixx~0.0056 kg*m^2), so gains like kp=6/kd=3 that look
  // sane in isolation caused ~650 rad/s^2 angular accel and diverged to
  // NaN within 2-3 physics steps, every time, across a full gain sweep at
  // that order of magnitude. Had to sweep two full orders of magnitude
  // down before anything converged. Verified stable and non-oscillating:
  // full-deflection pitch command reached 34.8/35deg by t=10s with zero
  // overshoot. Convergence is unhurried -- deliberately not re-tuned for
  // snappier response here, since that's feel-tuning (milestone 2's job),
  // not milestone 1's "is the control loop sound" gate.
  attitudeKp: 0.12,
  attitudeKd: 0.22,

  throttleRate: 1.4, // 1/s, how fast Shift/Ctrl move the throttle setpoint 0..1

  // --- milestone 3: gamepad true-acro tier ---
  // No angle target, no tilt cap -- sticks command RAW angular rate directly
  // (a rate-damping controller, torque ~ kRate*(targetRate-angvel)), same
  // shape as a real Betaflight/acro-mode quad. Uncapped means you CAN flip
  // and dive with nothing correcting you -- that's the honest trade for
  // full authority, per the brief.
  trueAcroMaxRate: 5.2, // rad/s, higher than the keyboard tier's capped angle ceiling implies
  trueAcroKRate: 0.35, // torque gain on (targetRate - angvel), tuned down from attitudeKd's scale for the same tiny-inertia reason as milestone 1

  // --- milestone 3: assist costs ---
  posHoldGain: 1.6, // extra counter-thrust toward zero horizontal velocity when POSHOLD is active and sticks are near-centered
  posHoldDeadzone: 0.08, // stick input below this magnitude counts as "centered" for POSHOLD
  governorMaxSpeed: 14, // m/s hard ceiling while GOVERNOR is active
  autoflareAGL: 3, // m -- below this height AUTOFLARE starts fighting descent rate
  autoflareMaxDescent: 2, // m/s -- descent rate AUTOFLARE tries to hold once triggered
  autoflareGain: 2.2, // extra upward thrust gain per m/s of descent-rate overage

  // --- milestone 4: docking ---
  // Triple tolerance per the brief exactly: position <0.3m, closure <0.4
  // m/s, attitude <10deg -- all three must hold simultaneously.
  dockPositionTol: 0.3, // m
  dockClosureTol: 0.4, // m/s
  dockAttitudeTolDeg: 10, // deg
  // Not in the brief verbatim -- added deliberately so a single lucky frame
  // at the tolerance boundary can't register as a dock; the pose has to
  // actually be held, which is also what makes POSHOLD's "docking becomes
  // deliberate" benefit real rather than cosmetic.
  dockHoldTime: 0.35, // s, continuous within-tolerance time required
  dockOverlayRange: 12, // m, DockingOverlay fades in inside this distance
  dockPatrolRadius: 3, // m, how far the pad swings from its center
  dockPatrolPeriod: 6, // s, full swing cycle
} as const;

export const gravity = 9.81;
export const hoverThrustPerMotor = (T.mass * gravity) / 4;
export const hoverThrottle = hoverThrustPerMotor / T.maxThrustPerMotor;
