import "./style.css";
import * as THREE from "three";
import { Physics } from "./core/Physics";
import { Input } from "./core/Input";
import { Sound } from "./core/Sound";
import { Drone } from "./drone/Drone";
import { FPVCamera } from "./camera/FPVCamera";
import { VisualPipeline } from "./render/VisualPipeline";
import { buildSky, buildGround, buildDock } from "./world/Environment";
import { buildArena } from "./world/Arena";
import { WorldTriggers } from "./world/Triggers";
import { MovingDock } from "./world/MovingDock";
import { DockChecker } from "./world/Gates";
import { DockingOverlay } from "./hud/DockingOverlay";
import { GhostSession } from "./replay/GhostSession";
import { T } from "./drone/Tuning";
import { ASSIST_INFO } from "./drone/Assists";

const game = document.querySelector<HTMLElement>("#game")!,
  hud = document.querySelector<HTMLElement>("#hud")!,
  speedEl = document.querySelector<HTMLElement>("#speed")!,
  altEl = document.querySelector<HTMLElement>("#alt")!,
  throttleEl = document.querySelector<HTMLElement>("#throttle")!,
  ladder = document.querySelector<HTMLElement>("#ladder")!,
  velVector = document.querySelector<HTMLElement>("#vel-vector")!,
  assistEl = document.querySelector<HTMLElement>("#assist")!,
  assistCostEl = document.querySelector<HTMLElement>("#assist-cost")!,
  tierEl = document.querySelector<HTMLElement>("#tier")!,
  rotorsEl = document.querySelector<HTMLElement>("#rotors")!,
  crashEl = document.querySelector<HTMLElement>("#crash-msg")!,
  fallback = document.querySelector<HTMLElement>("#fallback")!;

const SPAWN = new THREE.Vector3(0, 2, 0);

async function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x0b0e14);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  game.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x263346, 30, 220);
  scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x1a1208, 1.0));
  const sun = new THREE.DirectionalLight(0xffe9c4, 1.6);
  sun.position.set(30, 60, -50); // matches Environment.ts's sky sun direction
  scene.add(sun);
  buildSky(scene);
  buildGround(scene);
  buildDock(scene, new THREE.Vector3(0, 0, 18)); // landmark hangar bay, real weathered-metal materials

  const physics = ((globalThis as typeof globalThis & { __ddPhysics?: Physics }).__ddPhysics = await Physics.create()),
    input = ((globalThis as typeof globalThis & { __ddInput?: Input }).__ddInput = new Input()),
    sound = new Sound(),
    drone = ((globalThis as typeof globalThis & { __ddDrone?: Drone }).__ddDrone = new Drone(scene, physics, input, SPAWN)),
    fpv = new FPVCamera(innerWidth / innerHeight),
    pipeline = new VisualPipeline(renderer, scene, fpv.camera),
    arena = buildArena(scene, physics),
    triggers = ((globalThis as typeof globalThis & { __ddTriggers?: WorldTriggers }).__ddTriggers = new WorldTriggers(arena, scene, SPAWN)),
    // MovingDock, milestone 4: "charging pad on a patrolling platform."
    dock = ((globalThis as typeof globalThis & { __ddDock?: MovingDock }).__ddDock = new MovingDock(physics, scene, new THREE.Vector3(0, 1.2, 12))),
    dockChecker = new DockChecker(),
    // InvertedDock, milestone 5: "pad faces downward," fixed (not
    // patrolling, per the brief), mounted high for real approach room
    // underneath. Reuses MovingDock/DockChecker/DockingOverlay wholesale --
    // same pose-gate math, just targetUp flipped.
    invertedDock = new MovingDock(physics, scene, new THREE.Vector3(-14, 6, 30), { patrol: false, inverted: true }),
    invertedDockChecker = new DockChecker(),
    dockOverlay = new DockingOverlay(),
    ghosts = new GhostSession(scene); // milestone 6: course/medal/ghost, see GhostSession.ts
  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    fpv.resize(innerWidth / innerHeight);
    pipeline.resize(innerWidth, innerHeight);
  });

  // --- damage: contact-force events above threshold on the drone's own
  // collider (the only one with CONTACT_FORCE_EVENTS + a matching
  // threshold enabled, see Drone.ts) register a rotor loss. Filtering by
  // collider handle rather than trusting "a or b" blindly, since either
  // side of the pair could be the drone depending on creation order. ---
  const popEffects: { mesh: THREE.Mesh; life: number }[] = [];
  physics.contact = (force, a, b) => {
    if (a.handle !== drone.collider.handle && b.handle !== drone.collider.handle) return;
    const idx = drone.damage.registerContact(force);
    if (idx === undefined) return;
    sound.rotorPop();
    const p = drone.position(),
      burst = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff6a3d, transparent: true, opacity: 0.9 }),
      );
    burst.position.set(p.x, p.y, p.z);
    scene.add(burst);
    popEffects.push({ mesh: burst, life: 0.4 });
  };

  const splat = document.createElement("div");
  splat.className = "streaks";
  game.appendChild(splat);

  // Debug-only kill switch: this environment's document.hidden is not a
  // reliable signal that rAF is actually paused, which caused hours of
  // confusion earlier -- isolated physics tests via devtools console were
  // silently racing against this very loop, corrupting results in ways
  // that looked exactly like a force-application units bug but weren't.
  // __ddPause lets instrumented testing genuinely stop this loop first.
  (globalThis as typeof globalThis & { __ddPause?: () => void }).__ddPause = () => (paused = true);
  // ?paused=1 skips scheduling the loop's first frame entirely, so isolated
  // physics testing has a genuinely clean start -- calling __ddPause() from
  // devtools after the fact still leaves a window where the loop has
  // already run a few frames before the pause call lands.
  let paused = new URLSearchParams(location.search).has("paused");
  let last = performance.now(),
    started = false,
    crashTimer = 0, // >0 while the drift-away replay is playing; controls are cut for its duration
    wasCrashed = false;

  const respawn = (pos: THREE.Vector3) => {
    drone.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    drone.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    drone.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    drone.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    dockChecker.reset();
    invertedDockChecker.reset();
  };

  const loop = (now: number) => {
    if (paused) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!started) {
      started = true;
      sound.start();
    }

    // While a crash-drift replay is playing, real control input is cut --
    // input.step()/drone.fixed() are skipped, so the drone just carries its
    // last-known momentum under gravity/damping alone (Rapier still steps
    // it; nothing is re-applying our custom force/torque). That IS the
    // "drift-away replay of the impact," not a separate fake camera.
    const controlsActive = crashTimer <= 0;
    physics.step(
      dt,
      (step) => {
        if (controlsActive) {
          input.step(step);
          drone.fixed(step);
        }
        dock.fixed(step);
        invertedDock.fixed(step);
      },
      () => {},
    );

    if (input.consumeRestart()) {
      respawn(SPAWN);
      triggers.resetForRestart(SPAWN);
      drone.damage.reset();
      crashTimer = 0;
      crashEl.classList.add("hide");
    }

    // --- crash sequence: two rotors lost = crashed (Damage.ts), 3s drift-
    // away replay, then checkpoint respawn -- "crashes cost time, never
    // progress." Rotor health resets on respawn so the loop is replayable,
    // not a one-hit run-ender; the brief doesn't specify either way, but a
    // permanently-crippled drone after one checkpoint would make the
    // section itself unplayable rather than "hard but completable." ---
    if (drone.damage.crashed && !wasCrashed) {
      crashTimer = T.crashDriftDuration;
      crashEl.textContent = "ROTORS CRITICAL — DRIFTING";
      crashEl.classList.remove("hide");
    }
    wasCrashed = drone.damage.crashed;
    if (crashTimer > 0) {
      crashTimer -= dt;
      if (crashTimer <= 0) {
        respawn(triggers.lastCheckpointPos);
        drone.damage.reset();
        crashEl.classList.add("hide");
      }
    }

    fpv.update(drone);
    const v = drone.velocity(),
      speed = Math.hypot(v.x, v.y, v.z),
      p = drone.position(),
      dronePos = new THREE.Vector3(p.x, p.y, p.z),
      droneVel = new THREE.Vector3(v.x, v.y, v.z);

    triggers.update(dt, dronePos, droneVel, drone, sound);
    sound.updateRotors(drone.motorThrust, T.maxThrustPerMotor, drone.damage.alive);
    sound.updateAirflow(speed);

    // --- MovingDock + InvertedDock: DockingOverlay (ISS-style) +
    // triple-tolerance check. Only one overlay element exists, so whichever
    // dock is currently closer (and in range) claims it each frame -- with
    // the two docks placed far apart, in practice only one is ever in range
    // at once. ---
    const dP = dock.dockPoint(),
      iP = invertedDock.dockPoint(),
      nearerIsInverted = dronePos.distanceTo(iP) < dronePos.distanceTo(dP);
    dockChecker.update(
      dockOverlay,
      dronePos,
      droneVel,
      drone.mesh.quaternion,
      dP,
      dock.velocity,
      dock.targetUp,
      fpv.camera.quaternion,
      dt,
      nearerIsInverted ? 0 : T.dockOverlayRange, // suppress if the inverted dock has priority this frame
      () => sound.dockChime(),
    );
    invertedDockChecker.update(
      dockOverlay,
      dronePos,
      droneVel,
      drone.mesh.quaternion,
      iP,
      invertedDock.velocity,
      invertedDock.targetUp,
      fpv.camera.quaternion,
      dt,
      nearerIsInverted ? T.dockOverlayRange : 0,
      () => sound.dockChime(),
    );

    // --- milestone 6: course progress + ghost record/playback ---
    ghosts.update(dt, dronePos, drone.mesh.quaternion);
    if (ghosts.lockStabilize) drone.assist = "STABILIZE"; // progression: courses 1-2 force STABILIZE on, per the brief

    // --- rotor-pop particle burst cleanup ---
    for (let i = popEffects.length - 1; i >= 0; i--) {
      const e = popEffects[i];
      e.life -= dt;
      e.mesh.scale.setScalar(1 + (0.4 - e.life) * 8);
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, e.life / 0.4) * 0.9;
      if (e.life <= 0) {
        scene.remove(e.mesh);
        popEffects.splice(i, 1);
      }
    }

    // --- HUD: attitude ladder + velocity vector ---
    const { pitch, roll } = drone.flight.attitude(drone.mesh.quaternion);
    ladder.style.transform = `rotate(${roll}rad) translateY(${(pitch * 180) / Math.PI / 90 * 260}px)`;
    if (speed > 1.2) {
      const aim = dronePos.clone().add(droneVel.clone().normalize().multiplyScalar(8));
      aim.project(fpv.camera);
      if (aim.z < 1 && Math.abs(aim.x) < 1.4 && Math.abs(aim.y) < 1.4) {
        velVector.classList.remove("hide");
        velVector.style.left = `${(aim.x * 0.5 + 0.5) * innerWidth}px`;
        velVector.style.top = `${(1 - (aim.y * 0.5 + 0.5)) * innerHeight}px`;
      } else velVector.classList.add("hide");
    } else velVector.classList.add("hide");

    // --- velocity-reactive streaks: fade in above 20 m/s ---
    splat.style.opacity = Math.max(0, Math.min(0.5, (speed - 20) / 25)).toFixed(2);

    speedEl.textContent = speed.toFixed(1);
    altEl.textContent = p.y.toFixed(1);
    throttleEl.textContent = Math.round(input.throttle * 100).toString();
    const info = ASSIST_INFO[drone.assist];
    assistEl.textContent = info.label;
    assistCostEl.textContent = drone.assist === "OFF" ? info.cost : `cost: ${info.cost}`;
    tierEl.textContent = input.gamepadConnected ? (drone.assist === "OFF" ? "ACRO" : "ACRO+ASSIST") : "STAB (keyboard)";
    rotorsEl.textContent = drone.damage.alive.map((a) => (a ? "●" : "○")).join(" ");
    rotorsEl.className = drone.damage.aliveCount() <= 3 ? "warn" : "";
    game.dataset.telemetry = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;

    pipeline.render();
  };
  if (!paused) requestAnimationFrame(loop);
  hud.classList.remove("hide");
}

start().catch((e) => {
  console.error(e);
  fallback.textContent = "WebGL / physics init failed: " + e;
});
