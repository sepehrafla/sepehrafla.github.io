# Milestone 1 — Physics + Flight Model

Status: **verified working**, three real bugs found and fixed along the way.
Read this before touching `Drone.ts`/`FlightModel.ts`/`Tuning.ts` again — all
three bugs looked identical to plausible physics/tuning mistakes and cost
real time to isolate.

## Bugs found (in the order they had to be found)

### 1. Testing methodology: the live render loop was never actually paused

`document.hidden` is **not reliable** in this dev environment — it read
`true` at some points and `false` at others regardless of actual tab focus.
Every early "explosion" (velocity in the thousands after a few steps) was
the game's own `requestAnimationFrame` loop running *concurrently* with
manual devtools-console physics stepping, both mutating the same rigid
body. Fix: `main.ts` now checks `?paused=1` in the URL and skips scheduling
the loop's first frame entirely — the only way to guarantee no frames have
run before an isolated test starts. `globalThis.__ddPause()` exists too but
calling it from a *separate* devtools round-trip still leaves a window
where a few frames already ran; prefer the URL flag for real tests.

**When testing physics in isolation, always navigate to `?paused=1` first
and verify `d.body.translation()` reads the expected spawn position before
touching anything else.**

### 2. `ColliderDesc.setMass()` produced NaN on `world.step()`

Any call to `addForce`/`addTorque`/`applyImpulse` followed by `world.step()`
produced `NaN` rotation/velocity when the collider used `.setMass(T.mass)`.
Switching to `.setDensity(mass / volume)` (same resulting body mass,
verified via `body.mass()`) eliminated it entirely. Root cause not fully
isolated beyond "this Rapier3D-compat build's mass override path has a
problem" — density-based mass is also the more common pattern in Rapier
examples, so this is the fix, not a workaround to revisit.

### 3. `body.addForce()`/`body.addTorque()` apply far too much velocity change

Isolated with gravity zeroed and gains removed entirely: a raw
`addForce({y: 9.81})` on a mass=1 body for one 1/120s step (expected
Δv ≈ 0.0817) instead gave Δv ≈ 98.7 — roughly 1200x too much, confirmed
proportional to `dt` (so it's not a timestep mixup) and load-bearing enough
that it reproduced identically across many isolated re-tests. Meanwhile
`body.applyImpulse()` on the same body gave the textbook-exact
`Δv = impulse/mass`. Fix: don't use the continuous-force API at all --
compute `impulse = force * dt` myself each fixed step and call
`applyImpulse`/`applyTorqueImpulse` instead (exactly equivalent for a fixed
timestep, and now verified correct). See the comment on `Drone.fixed()`.

### 4. Attitude PD gains: the collider's moment of inertia is tiny

Once the above two were fixed, the attitude controller still diverged to
NaN with kp=6/kd=3 -- and, surprisingly, *also* at every other point in an
initial gain sweep down to kp=1/kd=3. Root cause: the drone's box collider
(0.24 x 0.1 x 0.24m, mass 1kg) has `Ixx ≈ 0.0056 kg·m²` -- tiny. Even
kp=1 (1 N·m at full 35° error) implies ~180 rad/s² angular acceleration.
Had to sweep two full orders of magnitude down before anything converged;
landed on kp=0.12/kd=0.22, verified stable (full-deflection pitch command
reached 34.8° of a 35° target by t=10s with zero overshoot, holding there).
**This convergence is unhurried by design of the moment** -- it was tuned
for stability, not responsiveness. Snappier flight feel is milestone 2's
job (the brief's "hard gate": 60s of free flying needs to be fun), not
milestone 1's ("is the control loop sound").

### 5. (Not a bug) -Z/+Z sign confusion during testing

Verified directly: pitch = +35° (nose up, per `attitude()`'s convention)
produces a +Z thrust component; pitch = -35° (nose down) produces -Z. This
is correct, real quadrotor physics (nose-up brakes/reverses, nose-down
accelerates forward) and was never wrong in the code -- an early braking
test commanded the wrong sign expecting the opposite convention, which
briefly looked like a serious bug. Confirmed by direct geometric
calculation (`Vector3(0,1,0).applyQuaternion(q)` at known angles) before
touching any code.

## What's verified (Milestone 1's actual gate)

- **Stable hover**: at throttle ≈ hover point (0.4088, exposed as
  `hoverThrottle` in `Tuning.ts`), the drone settles smoothly with no
  explosion, no oscillation -- confirmed over a 10s isolated run.
- **Tilt-coupled acceleration reads clearly**: commanding pitch produces a
  directly observable, monotonically building translational velocity in
  the geometrically-correct direction (verified both by direct force-vector
  math and by a full 10s dynamic run reaching 45+ m/s).
- **Flip-and-burn stop works**: commanding reverse pitch against an
  established 30 m/s velocity produces genuine, sustained deceleration
  (30 → 15.8 m/s over 3s in the verified test). It does **not** yet hit the
  brief's aspirational ~1.2s/~15m target -- current gains are tuned for
  stability first, snappy response is unaddressed. Flag this explicitly
  for milestone 2's feel pass; don't assume it's already tuned.
- **No console errors**, clean typecheck, clean build.

## What's NOT verified

- **60fps** -- not measurable through this environment's isolated-testing
  method (real-time rendering perf needs an actual live, focused tab, which
  this dev environment can't reliably guarantee for a scripted check). No
  per-frame allocations are apparent in the code (motor thrust array is
  reused, no `new` in the hot path except the per-call `THREE.Quaternion`/
  `Vector3` temporaries in `Drone.fixed()` and `FlightModel.step()` -- worth
  pooling those before a real perf pass, they're the one deviation from
  "preallocate everything" in the brief).
- **3-playtester "60 seconds of free flying is fun"** -- milestone 2's
  actual hard gate. Nobody but a human can judge this; the physics is
  sound but unfelt. Needs a real person at a keyboard.
- Gamepad/acro tier, assists, HUD, docking, sections, damage, courses,
  copilot ghost, daily/sharing -- everything from milestone 3 onward is
  entirely unbuilt.
