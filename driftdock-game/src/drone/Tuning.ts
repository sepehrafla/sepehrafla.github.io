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

  // --- milestone 5: damage ---
  // "Obstacle contact above force threshold at speed = lose a rotor."
  // totalForceMagnitude() from Rapier's contact-force events is in newtons;
  // this threshold is a starting point, not measured against a real crash
  // -- flag for retuning once playtesting happens (same caveat as every
  // other untested constant in this file).
  damageForceThreshold: 40, // N
  damageCooldown: 1.0, // s, minimum time between rotor losses so one hard hit can't strip all four in one contact event
  rotorLossYawDrift: 0.35, // Nm, constant yaw torque bias per lost rotor -- our FlightModel is an abstracted attitude PD, not a true per-motor mixer, so a missing rotor's real asymmetric-thrust yaw drift is approximated as a fixed bias the pilot must trim against with yaw input, rather than derived from motor geometry
  repairHoldTime: 1.5, // s, continuous hover inside a repair pad's radius to restore one lost rotor
  repairPadRadius: 1.5, // m
  crashDriftDuration: 3, // s, "ISS-style drift-away replay" -- controls cut, camera keeps drifting on last-known velocity while it decays
  crashDriftDamping: 0.6, // 1/s, how fast the drift-replay's residual velocity decays (cosmetic only, not the real physics body)

  // --- milestone 7: copilot ghost-line ---
  copilotSampleSpacing: 1.0, // m, spline sample density -- fine enough for the magnetism/sync distance checks to feel smooth, not so fine it's wasted work over a ~100m course
  copilotSyncTolerance: 3.5, // m, within this distance of the line counts as "synced" for sync%
  copilotMagnetRadius: 5, // m, magnetism only pulls inside this distance -- "subtle," not a rail
  copilotMagnetForce: 1.4, // extra force gain toward the line, scaled by (1 - dist/radius) -- deliberately weak relative to the drone's own ~6N/motor thrust, a nudge the pilot can out-fly, not an autopilot
  copilotPreviewSeconds: 3, // s, how far ahead the highlighted preview marker sits, per the brief's "3s ahead"
  copilotCruiseSpeed: 9, // m/s, nominal speed used to convert the 3s preview window into a distance along the line when the drone itself is nearly stationary (e.g. idle before the run starts)

  // --- moon base: AI autopilot (extends the copilot concept to full
  // hands-off control, per the user's ask) ---
  // A real PD controller, not a scripted animation: desired world-space
  // horizontal acceleration = kP*(target-pos) - kD*vel, rotated into the
  // drone's current body-local frame (accounting for yaw), then expressed
  // as a pitch/roll command in the SAME units and sign convention Input.ts
  // produces -- it drives the actual FlightModel a human pilot uses, not a
  // parallel fake-physics path.
  //
  // The first gain set here (kp=0.35, kd=0.55, cap=0.8) LOOKED right and
  // passed a naive "does it ever cross the arrival radius" check, but a
  // longer live test caught it in a genuine limit-cycle orbit: it flew
  // straight through the target at 6+ m/s, overshot by ~10m, and swung
  // back and forth indefinitely -- never actually arriving in any
  // meaningful sense. The bug was outer-loop gains tuned as if tilt
  // produces acceleration instantly; the real inner attitude-PD loop
  // (FlightModel's own kp/kd) has real lag, and an outer loop that
  // aggressive rings against it. Swept down empirically (same rigor as
  // milestone 1's attitude-PD tuning) checking for genuine SETTLING --
  // staying within arrival tolerance for the back half of a 30s run, not
  // just touching it once -- across both a ~17m and a ~52m test distance.
  // This set settles cleanly at both (final distance <0.1m, zero
  // oscillation) in a still-reasonable ~11s/~21s respectively.
  autopilotKp: 0.15, // 1/s^2-ish gain on position error -> normalized tilt command
  autopilotKd: 0.9, // damping gain on velocity -- deliberately large relative to kp, see above
  autopilotMaxTiltCmd: 0.6, // never commands full deflection -- leaves headroom so it doesn't oscillate at the tilt cap
  autopilotThrottleKp: 0.6,
  autopilotThrottleKd: 0.9,
  autopilotArriveRadius: 1.2, // m, "close enough" to a waypoint to advance the state machine
  autopilotMineHoldTime: 2.0, // s, how long the autopilot hovers at a resource node to "mine" it (matches the manual mine time)
  autopilotHoverHeight: 2.5, // m, cruise altitude the autopilot holds over waypoints

  // --- moon base: resource gathering ---
  resourceMineRadius: 1.6, // m
  resourceMineHoldTime: 1.6, // s, brief deliberate hover to mine, same shape as the repair pad
  resourceCarryCapacity: 3,
  baseDeliverRadius: 3.5, // m
} as const;

export const gravity = 9.81;
export const hoverThrustPerMotor = (T.mass * gravity) / 4;
export const hoverThrottle = hoverThrustPerMotor / T.maxThrustPerMotor;
