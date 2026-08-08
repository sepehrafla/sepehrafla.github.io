import "./style.css";
import * as THREE from "three";
import { Physics, RAPIER } from "./core/Physics";
import { Input } from "./core/Input";
import { Drone } from "./drone/Drone";
import { FPVCamera } from "./camera/FPVCamera";

const game = document.querySelector<HTMLElement>("#game")!,
  hud = document.querySelector<HTMLElement>("#hud")!,
  speedEl = document.querySelector<HTMLElement>("#speed")!,
  altEl = document.querySelector<HTMLElement>("#alt")!,
  throttleEl = document.querySelector<HTMLElement>("#throttle")!,
  fallback = document.querySelector<HTMLElement>("#fallback")!;

async function start() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x0b0e14);
  game.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0e14, 20, 140);
  scene.add(new THREE.HemisphereLight(0x8fb8ff, 0x1a1208, 1.6));
  const sun = new THREE.DirectionalLight(0xffe9c4, 2.2);
  sun.position.set(30, 60, 20);
  scene.add(sun);

  const physics = ((globalThis as typeof globalThis & { __ddPhysics?: Physics }).__ddPhysics = await Physics.create()),
    input = ((globalThis as typeof globalThis & { __ddInput?: Input }).__ddInput = new Input()),
    drone = ((globalThis as typeof globalThis & { __ddDrone?: Drone }).__ddDrone = new Drone(scene, physics, input)),
    fpv = new FPVCamera(innerWidth / innerHeight);
  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    fpv.resize(innerWidth / innerHeight);
  });

  // --- flat test arena + a few pylons (milestone 1 scope only; the real
  // Course/Sections system is a later milestone) ---
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.95 });
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  scene.add(groundMesh);
  const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.1, 200).setTranslation(0, -0.1, 0), groundBody);

  // grid lines so velocity/motion actually reads visually at milestone 1
  const grid = new THREE.GridHelper(400, 80, 0x2a3040, 0x1c2028);
  scene.add(grid);

  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x552200, roughness: 0.5 });
  for (const [x, z] of [
    [10, 0],
    [10, -8],
    [-6, 12],
    [0, 25],
    [-15, 5],
  ] as const) {
    const h = 4,
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 12), pylonMat);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, h / 2, z));
    physics.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.3), body);
  }

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
  let last = performance.now();
  const loop = (now: number) => {
    if (paused) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

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
    speedEl.textContent = speed.toFixed(1);
    altEl.textContent = p.y.toFixed(1);
    throttleEl.textContent = Math.round(input.throttle * 100).toString();
    game.dataset.telemetry = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)},${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;

    renderer.render(scene, fpv.camera);
  };
  if (!paused) requestAnimationFrame(loop);
  hud.classList.remove("hide");
}

start().catch((e) => {
  console.error(e);
  fallback.textContent = "WebGL / physics init failed: " + e;
});
