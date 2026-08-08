import "./style.css";
import * as THREE from "three";
import { Physics, RAPIER } from "./core/Physics";
import { Input } from "./core/Input";
import { Sound } from "./core/Sound";
import { Drone } from "./drone/Drone";
import { FPVCamera } from "./camera/FPVCamera";
import { VisualPipeline } from "./render/VisualPipeline";
import { buildSky, buildGround, buildDock } from "./world/Environment";
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
  fallback = document.querySelector<HTMLElement>("#fallback")!;

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
    drone = ((globalThis as typeof globalThis & { __ddDrone?: Drone }).__ddDrone = new Drone(scene, physics, input)),
    fpv = new FPVCamera(innerWidth / innerHeight),
    pipeline = new VisualPipeline(renderer, scene, fpv.camera);
  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    fpv.resize(innerWidth / innerHeight);
    pipeline.resize(innerWidth, innerHeight);
  });

  // Real ground collider matches Environment.ts's visual ground exactly.
  const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.1, 400).setTranslation(0, -0.1, 0), groundBody);

  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x552200, roughness: 0.5 }),
    pylonPositions: [number, number][] = [
      [10, 0],
      [10, -8],
      [-6, 12],
      [0, 25],
      [-15, 5],
    ];
  for (const [x, z] of pylonPositions) {
    const h = 4,
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 12), pylonMat);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, h / 2, z));
    physics.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.3), body);
  }

  // --- one SlotThread: two wall segments barely wider than the drone,
  // requiring precision to pass. Geometry-only at this milestone (pose-
  // gate scoring is a later milestone); the collider IS the challenge. ---
  const slotCenter = new THREE.Vector3(-8, 2, -20),
    slotGap = 0.9, // drone frame is ~0.3m across the diagonal; this is tight but flyable
    wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3040, emissive: 0x0d1622, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const w = 3,
      mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 4, 0.4), wallMat);
    mesh.position.set(slotCenter.x + side * (slotGap / 2 + w / 2), slotCenter.y, slotCenter.z);
    scene.add(mesh);
    const body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, 2, 0.2), body);
  }

  // --- one boost ring: flying through gives a forward velocity surge.
  // Distance-to-axis + plane-crossing check each frame, not a Rapier
  // sensor event -- simpler and more predictable given this session's
  // track record with this Rapier build's less-common APIs. ---
  const boostCenter = new THREE.Vector3(10, 3, -8),
    boostRadius = 1.6,
    boostRingMat = new THREE.MeshStandardMaterial({
      color: 0xffd24a,
      emissive: 0xffb020,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.4,
    }),
    boostRing = new THREE.Mesh(new THREE.TorusGeometry(boostRadius, 0.09, 12, 32), boostRingMat);
  boostRing.position.copy(boostCenter);
  scene.add(boostRing);
  let boostCooldown = 0,
    lastSideOfBoost = 1; // +1/-1, which side of the ring's plane the drone is on

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
    tickTimer = 0,
    started = false;
  const loop = (now: number) => {
    if (paused) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!started) {
      started = true;
      sound.start();
    }

    physics.step(
      dt,
      (step) => {
        input.step(step);
        drone.fixed(step);
      },
      () => {},
    );

    if (input.consumeRestart()) {
      drone.body.setTranslation({ x: 0, y: 2, z: 0 }, true);
      drone.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      drone.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      drone.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }

    fpv.update(drone);
    const v = drone.velocity(),
      speed = Math.hypot(v.x, v.y, v.z),
      p = drone.position();

    // --- boost ring trigger: crossed the ring's Z-plane within its radius ---
    boostCooldown = Math.max(0, boostCooldown - dt);
    const toDrone = new THREE.Vector3(p.x, p.y, p.z).sub(boostCenter),
      sideNow = Math.sign(toDrone.z) || 1,
      radialDist = Math.hypot(toDrone.x, toDrone.y);
    if (sideNow !== lastSideOfBoost && radialDist < boostRadius && boostCooldown <= 0) {
      const dir = new THREE.Vector3(v.x, v.y, v.z);
      if (dir.lengthSq() > 0.01) dir.normalize();
      else dir.set(0, 0, -1);
      drone.body.applyImpulse({ x: dir.x * 8, y: dir.y * 8, z: dir.z * 8 }, true);
      boostCooldown = 1.2;
      sound.boost();
      (boostRingMat as THREE.MeshStandardMaterial).emissiveIntensity = 3.2;
    }
    lastSideOfBoost = sideNow;
    boostRingMat.emissiveIntensity += (1.6 - boostRingMat.emissiveIntensity) * Math.min(1, dt * 4);
    boostRing.rotation.z += dt * 0.4;

    // --- proximity ticker: geiger-style, rate scales with closeness to
    // the nearest pylon/wall. Cheap O(n) distance check, n is tiny here. ---
    let nearest = Infinity;
    for (const [x, z] of pylonPositions) nearest = Math.min(nearest, Math.hypot(p.x - x, p.z - z) - 0.3);
    nearest = Math.min(nearest, radialDist > boostRadius ? Infinity : Math.abs(toDrone.z));
    if (nearest < 4) {
      tickTimer -= dt;
      if (tickTimer <= 0) {
        sound.tick(0.05 + (1 - nearest / 4) * 0.15);
        tickTimer = 0.05 + (nearest / 4) * 0.4;
      }
    }

    sound.updateRotors(drone.motorThrust, T.maxThrustPerMotor);
    sound.updateAirflow(speed);

    // --- HUD: attitude ladder + velocity vector ---
    const { pitch, roll } = drone.flight.attitude(drone.mesh.quaternion);
    ladder.style.transform = `rotate(${roll}rad) translateY(${(pitch * 180) / Math.PI / 90 * 260}px)`;
    if (speed > 1.2) {
      const aim = new THREE.Vector3(p.x, p.y, p.z).add(new THREE.Vector3(v.x, v.y, v.z).normalize().multiplyScalar(8));
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
