# CENTAUR — design doc

> "A physics bike game where the skill ceiling isn't your reflexes — it's how
> well you communicate intent to a machine that's faster than you."

This document maps the CENTAUR pitch onto the actual `why-game` codebase:
what changes, what's new, what stays, and in what order to build it so each
slice is playable and testable on its own. It does not redesign anything
that already works — Rapier2D physics, the milestone-2 fun gate, the inkwash
paint shader, Daily Ride, GitHub Pages static deploy all carry over
unchanged, per the brief.

## 1. Core thesis, as a state machine

The whole pitch reduces to one small, honest data model:

```ts
type Subsystem = 'throttle' | 'brake' | 'airAttitude' | 'landing' | 'scan';
type Intent = 'speed' | 'safety' | 'seekAnomaly' | 'followLine';
type Condition = { intent: Intent; until?: 'leanForwardTwice' | 'nextLanding' | 'nextAnomaly' };

interface DelegationState {
  bandwidth: 1 | 2 | 3 | 4;               // upgrade tier -- how many concurrent pins
  pins: Partial<Record<Subsystem, Condition>>;  // what's delegated, to what objective
  proposing: boolean;                      // tier-4 unlock: AI shows a ghost-line, awaits accept/reject
}
```

Every subsystem is either **manual** (player's own input, real latency modeled)
or **pinned to an objective** (copilot drives it via a small deterministic
controller). Nothing stochastic, ever — the brief is explicit that AI
failure must be legible as "I told it the wrong thing," not bad luck. That
constraint is actually what keeps this simple to build: every controller is
a plain PID or rule table, no ML, fully replayable from recorded pin history.

## 2. What's new vs. what's reused

**Reused untouched:** `core/Physics.ts`, `core/Camera.ts` (mostly), the
Rapier joint setup in `bike/Bike.ts`, `world/Terrain.ts`'s height-field +
paint shader, `feel/*`, `ui/EndMap.ts`'s rendering approach (extended, not
replaced), Daily Ride's seeding.

**New modules:**

```
src/
  copilot/
    Copilot.ts          // owns DelegationState, runs one controller per pinned subsystem
    controllers/
      ThrottleController.ts   // PID toward target speed, or "seek anomaly" heading logic
      BrakeController.ts      // PID toward safe-landing speed given upcoming terrain
      AirAttitudeController.ts// PID toward a target pitch during airtime
      LandingController.ts    // frame-perfect flare: zero out angular velocity pre-contact
      ScanController.ts       // drives the scout drone's autonomous return path
    GhostLine.ts         // tier-4: samples the copilot's *proposed* input forward N steps,
                          // renders a translucent predicted path, exposes accept()/reject()
  ui/
    IntentGlyphs.ts      // the pinned-intent HUD: current glyph(s), lean-to-swap gesture,
                          // conditional-intent badge ("safety UNTIL...")
  world/
    ScoutDrone.ts        // throw arc (reuse Rivals.ts's simple ballistic pattern), flight-out,
                          // returns a terrain/anomaly preview payload
    BuilderBot.ts        // thrown packet -> unfold animation -> spawns a real Rapier polyline
                          // segment (bridge/ramp) that the *existing* Terrain collider system
                          // just treats as an extra static body
  bike/
    MergeVisual.ts        // ink-strand shader connecting rider silhouette to frame,
                          // driven by a single 0..1 "trust" value derived from bandwidth+pins
```

**Modified:**
- `bike/Bike.ts::fixed()` — before applying manual input, check `Copilot` for
  each pinned subsystem and let it override that subsystem's control signal.
  Manual and delegated inputs are mutually exclusive *per subsystem*, so a
  player can hold manual lean while throttle is pinned to `speed` — that's
  the whole "blend" the pitch describes, expressed as which keys of
  `DelegationState.pins` are set.
- `main.ts` — wire `Copilot`, `IntentGlyphs`, `ScoutDrone`, `BuilderBot` into
  the loop; extend the contact/impact handling to treat AI-caused crashes
  identically to player-caused ones (same wipe/respawn path — the game
  doesn't need to know *whose* mistake it was, only the replay log does).
- `ui/EndMap.ts` — second line color for the copilot's proposed path,
  "sync %" stat (see §6).
- `world/Terrain.ts` — a `requiresDelegation` flag per generated feature
  (e.g. a cliff-drop chunk can require `landing` pinned to spawn safely, or
  spawn but punish an unpinned attempt hard) — this is how sections gate on
  delegation split without inventing a separate zone system.

**Open tension to flag now, not discover later:** `world/Rivals.ts`
currently dramatizes "others are risking and profiting while you play safe."
CENTAUR's thesis is about *delegation*, not risk-vs-stillness. Both can
coexist (a rival could even be reflavored as "a fully-autonomous rider" who
rides the safe road at optimal speed forever and never takes the cave —
literally dramatizing "full auto, no purpose" from the brief) but that reflavor
is a real decision, not a given. Recommend folding Rivals into this arc
explicitly in phase 2 rather than running two unrelated meta-narratives.

## 3. The copilot controller (no ML, deterministic, replayable)

Each controller is intentionally small and boring:

```ts
class ThrottleController {
  // classic PID, objective sets the setpoint
  step(objective: Intent, state: BikeTelemetry, dt: number): number /* -1..1 throttle */ {
    const target = this.setpointFor(objective, state); // e.g. 'speed' -> T.maxWheelSpeed
    const err = target - state.speed;
    this.integral += err * dt;
    const out = this.kp*err + this.ki*this.integral + this.kd*(err-this.lastErr)/dt;
    this.lastErr = err;
    return clamp(out, -1, 1);
  }
}
```

`setpointFor('speed', ...)` always returns max sustainable speed — full
stop. `setpointFor('safety', ...)` returns a speed that respects upcoming
terrain curvature sampled from `Terrain.height()` a few meters ahead (this
is also literally the reason "full auto forever" never finds the cave: a
safety-objective controller has no term for "anomaly glow off-road," so it
will *never* produce a heading toward one — the failure to explore isn't
scripted, it falls directly out of what the objective function scores).

`LandingController` is the "frame-perfect flare" — it zeroes angular
velocity in the last N ms before ground contact using the exact same
`chassis.applyTorqueImpulse` the player's own self-leveling code already
uses (see `Bike.ts`'s `settling` branch) — the copilot doesn't get new
capabilities, it gets perfect timing on capabilities the player already has.
That symmetry matters: it's what makes delegation *fair* rather than a
stat boost.

## 4. Failure readability

Every pin change gets one log entry: `{t, subsystem, intent, condition}`.
`EndMap`'s render pass already draws a route line from `bike.onTrace`; add a
second pass that walks the pin log and draws small glyph markers at the x
position where each pin was set. A crash while `throttle` was pinned to
`speed` renders a small "speed" glyph right at the wipeout marker — the
player can *see* "I told it to maintain speed" lined up with "and it did,
off a cliff," without a word of explanation text, honoring the game's
existing "never a lecture" rule.

## 5. Bandwidth progression (replaces bike-tier cosmetic-only unlocks)

Current `Bike.setTier()` only recolors the bike per spark threshold. Extend
tier meaning:

| Tier | Unlocks |
|---|---|
| 0 | 1 pin slot, unconditional only |
| 1 | 2 concurrent pin slots |
| 2 | conditional intents (`until` clause) |
| 3 | `ScoutDrone` unlocked |
| 4 | `BuilderBot` unlocked |
| 5 | AI proposing — `GhostLine` renders, lean-to-accept/reject |

This reuses the existing spark-threshold unlock cadence
(`Math.min(4, Math.floor(sparkCount/3))` today) — extend the divisor table
rather than inventing a parallel currency.

## 6. EndMap / Daily Ride scoring

Add `syncPercent = matchingSteps / totalSteps` where a step "matches" if the
player's most recent manual input agrees with what the copilot *would have*
proposed at tier 5, or trivially 100% for any subsystem currently pinned
(you asked it to do exactly that, so it's definitionally in sync). Share
string becomes `"CENTAUR #211 — 4/5 ✦ 1:07 · 82% sync"`.

## 7. Build order (each step playable alone)

1. ✅ **Shipped.** `Copilot` + `ThrottleController` + one pinnable intent
   (`speed`) + a single glyph in the HUD, no conditions, no drone, no bots.
   Verified: pinned throttle with zero manual gas input still accelerated
   the bike; unpinned falls back to manual with no regression.
2. ✅ **Shipped**, with two real deviations from the original sketch worth
   recording:
   - `LandingController` was folded into `AirAttitudeController` rather
     than built separately — same actuator (chassis torque), same target
     (pitch 0), sustained through touchdown. A standalone landing
     controller would have been near-duplicate code for no behavioral gain.
   - The PID gains were **not** guessable from first principles, same
     lesson as the propulsion-motor units earlier in this project: an
     initial kp=6/ki=0.4/kd=1.1 (finite-differencing the position error)
     diverged on a hard tumble instead of converging. Root cause: a wrapped
     `[-pi,pi]` angle still jumps discontinuously by ~2π whenever the body
     completes a full rotation fast enough (a 3 rad/s tumble does that in
     ~2s, well within the test window), which spikes a *position*-derivative
     term. Fix was architectural, not just re-tuning: damp Rapier's actual
     `angvel()` directly (no 2π discontinuity to spike on) rather than
     differencing position. Also caught a test-harness trap worth flagging
     for future controller work here: an early gain sweep showed every
     single (kp, kd) combination "diverging" at ~t=2.2s — that was the test
     rig's fault (insufficient drop altitude, the bike was actually hitting
     the ground mid-test), not the controller; always give free-flight
     tests enough clearance to stay airborne for the full test window, or
     you'll tune against a phantom bug. Final gains (kp=20, kd=3, ki=0)
     converged a 3 rad/s tumble to <0.01 rad and held it there, and
     recovered a second, harder disturbance to <0.03 rad within ~1s.
   - Bandwidth is unconditionally 2 for now — tier-gating it to spark
     progression (the table in §5) is deferred; `Bike.setTier()`'s existing
     5-color array would need reconciling with the 6-row tier table there
     first, and that's its own decision, not a mechanical follow-on.
3. Conditional intents (`until` clause), one-tap swap gesture.
4. `ScoutDrone` (reuses `Rivals.ts`'s throw-arc/return pattern almost
   directly — same ballistic math, different payload).
5. `BuilderBot` (pre-authored unfold animation per the brief — not real
   simulation — spawns a static Rapier body once the animation completes).
6. `GhostLine` + accept/reject, tier-5 unlock.
7. `EndMap` two-line render + sync%, Daily Ride share-string update.
8. Decide Rivals.ts's fate (reflavor vs. remove vs. keep parallel) —
   flagged in §2, don't leave it as an accidental second theme.

Steps 1–2 are the smallest slice that could ship and be judged on its own
merits; that's the recommended starting point for the next session.
