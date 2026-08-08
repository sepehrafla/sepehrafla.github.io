import "./style.css";
import "./polish.css";
import * as THREE from "three";
import { Physics } from "./core/Physics";
import { RideCamera } from "./core/Camera";
import { Input } from "./core/Input";
import { load, save, fresh, type RideMode } from "./core/SaveState";
import { dailyKey, hash } from "./core/Seed";
import { Terrain } from "./world/Terrain";
import { Anomalies } from "./world/Anomalies";
import { Rivals } from "./world/Rivals";
import { Bike } from "./bike/Bike";
import { Particles } from "./feel/Particles";
import { Sound } from "./feel/Sound";
import { Juice } from "./feel/Juice";
import { EndMap } from "./ui/EndMap";
const game = document.querySelector<HTMLElement>("#game")!,
  title = document.querySelector<HTMLElement>("#title")!,
  ride = document.querySelector<HTMLButtonElement>("#ride")!,
  daily = document.querySelector<HTMLButtonElement>("#daily")!,
  end = document.querySelector<HTMLButtonElement>("#end")!,
  hudSparks = document.querySelector<HTMLElement>("#sparks")!,
  distance = document.querySelector<HTMLElement>("#distance")!,
  timer = document.querySelector<HTMLElement>("#timer")!,
  mapPanel = document.querySelector<HTMLElement>("#map")!,
  mapCanvas = document.querySelector<HTMLCanvasElement>("#map-canvas")!,
  keep = document.querySelector<HTMLButtonElement>("#keep")!,
  again = document.querySelector<HTMLButtonElement>("#again")!,
  fallback = document.querySelector<HTMLElement>("#fallback")!,
  touch = document.querySelector<HTMLElement>(".touch")!;
async function start(mode: RideMode) {
  title.classList.add("hide");
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xd9d7d0);
  game.prepend(renderer.domElement);
  const scene = new THREE.Scene(),
    camera = new RideCamera(renderer),
    physics = await Physics.create(),
    input = new Input(renderer.domElement),
    particles = new Particles(scene),
    sound = new Sound(),
    juice = new Juice(),
    saved = load(),
    state =
      mode === "free"
        ? saved
        : Object.assign(fresh(), {
            bestDaily: saved.bestDaily,
            streak: saved.streak,
            lastDaily: saved.lastDaily,
          }),
    key = dailyKey(),
    seed = mode === "daily" ? hash(key) : hash("why-freeride"),
    terrain = new Terrain(scene, physics, state, seed);
  terrain.stream(0);
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 80),
    new THREE.ShaderMaterial({
      uniforms: { uPaint: { value: 0 }, uTime: { value: 0 } },
      vertexShader: `varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `uniform float uPaint,uTime;varying vec2 v;
        float n(vec2 p){return fract(sin(dot(p,vec2(41.,289.)))*43758.);}
        float cloud(vec2 p){float c=0.;for(int i=0;i<3;i++){float fi=float(i);vec2 q=p+vec2(uTime*(.006+fi*.003)+fi*17.,fi*9.);c+=smoothstep(.5,.9,n(floor(q*3.))*.6+n(floor(q*1.3))*.4)*(1.-fi*.22);}return clamp(c,0.,1.);}
        void main(){
          float paper=n(floor(v*240.))*.05;
          vec3 g=vec3(.82-paper);
          vec3 c=mix(vec3(.42,.72,.68),vec3(.96,.65,.44),v.y);
          float sun=smoothstep(.22,0.,distance(v,vec2(.78,.72)));
          c+=sun*vec3(1.,.85,.55)*.5;
          g+=sun*.12;
          float cl=cloud(v*vec2(6.,2.5))*smoothstep(.15,.6,v.y)*.16;
          c=mix(c,vec3(1.),cl); g=mix(g,vec3(.95),cl*.6);
          gl_FragColor=vec4(mix(g,c,uPaint*.38),1.);
        }`,
    }),
  );
  sky.position.set(100, 12, -10);
  scene.add(sky);
  const bike = new Bike(scene, physics, input, particles, sound, (x) =>
    terrain.height(x),
  );
  bike.setTier(state.tier);
  const anomalies = new Anomalies(
      scene,
      state,
      terrain,
      particles,
      sound,
      juice,
      mode,
      seed,
    ),
    rivals = ((globalThis as typeof globalThis & { __whyRivals?: Rivals }).__whyRivals =
      new Rivals(scene, sound, particles, (x) => terrain.height(x))),
    route = new EndMap(mapCanvas, state, mode),
    splat = document.createElement("div");
  let sinceRisk = 0;
  splat.className = "splat";
  game.append(splat);
  let started = performance.now(),
    last = started,
    paintTick = 0,
    ended = false,
    sparkCount = mode === "free" ? state.sparks : 0;
  sound.start();
  sound.startEngine();
  if (matchMedia("(pointer:coarse)").matches) touch.classList.add("show");
  bike.onWipe = () => {
    juice.freeze(7);
    juice.shake(0.7);
    splat.classList.remove("show");
    requestAnimationFrame(() => splat.classList.add("show"));
  };
  bike.onLand = (flip) => {
    if (flip) juice.freeze(3);
  };
  bike.onTrace = (x, y, speed) => route.point(x, y, speed);
  anomalies.onSpark = (amount) => {
    sparkCount += amount;
    sinceRisk = 0;
    bike.setTier(
      mode === "free" ? state.tier : Math.min(4, Math.floor(sparkCount / 3)),
    );
    route.spark(bike.position().x);
    hudSparks.textContent = `${sparkCount} ✦`;
  };
  // Measured contact forces: ~306N at rest, ~4.1kN peak riding rough terrain,
  // ~400kN on a hard landing. Sit the gate above normal riding so only genuine
  // slams shake, and take the max per step so several contact pairs in one step
  // can't stack into permanent max trauma.
  const IMPACT_MIN = 7000;
  let pendingImpact = 0;
  physics.contact = (force, a, b) => {
    const aa = a as typeof a & { tag?: string },
      bb = b as typeof b & { tag?: string };
    if (
      force > IMPACT_MIN &&
      (aa.tag === "bike" ||
        bb.tag === "bike" ||
        aa.tag === "chassis" ||
        bb.tag === "chassis")
    )
      pendingImpact = Math.max(pendingImpact, force);
  };
  const finish = () => {
    if (ended) return;
    ended = true;
    if (mode === "free") save(state);
    else {
      const elapsed = (performance.now() - started) / 1000,
        old = saved.bestDaily[key];
      if (!old || elapsed < old.time)
        saved.bestDaily[key] = { time: elapsed, sparks: anomalies.dailyFound };
      if (saved.lastDaily !== key) {
        saved.streak++;
        saved.lastDaily = key;
      }
      save(saved);
    }
    route.render();
    mapPanel.classList.add("show");
  };
  end.addEventListener("click", finish);
  keep.addEventListener("click", () => route.save());
  again.addEventListener("click", () => location.reload());
  const loop = (now: number) => {
    if (ended) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (juice.step())
      physics.step(
        dt,
        (step) => {
          bike.fixed(step);
          const p = bike.position();
          terrain.stream(p.x);
          paintTick += step;
          if (paintTick > 0.6) {
            paintTick = 0;
            terrain.updatePaint(p.x, 0.15);
            if (mode === "free") save(state);
          }
        },
        () => {},
      );
    if (pendingImpact > 0) {
      juice.shake(Math.min(0.62, (pendingImpact - IMPACT_MIN) / 80000));
      sound.impact(pendingImpact);
      pendingImpact = 0;
    }
    const p = bike.position(),
      v = bike.velocity();
    game.dataset.telemetry = `${p.x.toFixed(2)},${p.y.toFixed(2)},${v.x.toFixed(2)},${bike.chassis.rotation().toFixed(2)},${bike.wiped ? 1 : 0},${input.gas ? 1 : 0}`;
    anomalies.update(now / 1000, p.x, p.y);
    // "At risk" = off the safe baseline (exploring above/below road, or airborne)
    // or a spark was just earned. Staying glued to flat, grounded road is the
    // one thing that summons a rival rider past you.
    const offBaseline = Math.abs(p.y - terrain.height(p.x)) > 2.2;
    if (offBaseline || bike.air > 0.15) sinceRisk = 0;
    else sinceRisk += dt;
    rivals.update(dt, p.x, p.y, sinceRisk < 0.05);
    camera.update(dt, p.x, p.y, v.x, bike.air);
    juice.update(dt, camera.camera);
    particles.update(dt);
    const skyMat = sky.material as THREE.ShaderMaterial;
    skyMat.uniforms.uPaint.value = Math.min(1, sparkCount / 12);
    skyMat.uniforms.uTime.value = now / 1000;
    sky.position.x = p.x + 30;
    hudSparks.textContent = `${sparkCount} ✦`;
    distance.textContent = String(Math.max(0, Math.floor(p.x))).padStart(
      4,
      "0",
    );
    if (mode === "daily") {
      const left = Math.max(0, 75 - (now - started) / 1000);
      timer.textContent = `${Math.ceil(left)}`;
      if (left <= 0 || p.x > 160) finish();
    }
    renderer.render(scene, camera.camera);
  };
  requestAnimationFrame(loop);
}
ride.addEventListener("click", () =>
  start("free").catch((e) => {
    console.error(e);
    fallback.textContent = "WebGL is required.";
  }),
);
daily.addEventListener("click", () =>
  start("daily").catch((e) => {
    console.error(e);
    fallback.textContent = "WebGL is required.";
  }),
);
