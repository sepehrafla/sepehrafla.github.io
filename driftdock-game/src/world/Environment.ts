import * as THREE from "three";
import metalColor from "../assets/textures/metal/color.jpg";
import metalNormal from "../assets/textures/metal/normal.jpg";
import metalRough from "../assets/textures/metal/roughness.jpg";
import metalMetalness from "../assets/textures/metal/metalness.jpg";
import rustColor from "../assets/textures/rust/color.jpg";
import rustNormal from "../assets/textures/rust/normal.jpg";
import rustRough from "../assets/textures/rust/roughness.jpg";
import moonColor from "../assets/textures/moon/color.jpg";
import moonNormal from "../assets/textures/moon/normal.jpg";
import moonRough from "../assets/textures/moon/roughness.jpg";

// Lunar re-theme: the sky and ground are now a real airless-moon look
// (starfield, black sky, cratered regolith) instead of the earlier blue-
// sky/concrete arena. Physics gravity is deliberately NOT changed to real
// lunar gravity (1.62 m/s^2) -- every tuned constant across 8 milestones
// (hover throttle, assist gains, all course par times) was calibrated
// against the current gravity, and retuning all of it is out of scope for
// a reskin. This is a visual/thematic change, not a physics one. The
// hangar/dock still uses the real CC0 metal textures (see
// src/assets/CREDITS.md) -- weathered metal reads just as well as a lunar
// base module as it did as an Earth hangar.

/** Airless-moon sky: black gradient (no atmosphere = no horizon haze),
 *  a hard sun disc, and a scattered starfield -- stars are visible in
 *  real lunar-surface photos precisely because there's no air to scatter
 *  light and wash them out. A small painted Earth sits low on the
 *  horizon, the classic "lunar surface" signature shot. */
export function buildSky(scene: THREE.Scene) {
  const geo = new THREE.SphereGeometry(400, 24, 16),
    mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x000000) },
        uHorizon: { value: new THREE.Color(0x0a0a12) },
        uSun: { value: new THREE.Vector3(0.35, 0.25, -0.6).normalize() },
        uStars: { value: starTexture() },
      },
      vertexShader: `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        uniform vec3 uTop,uHorizon,uSun;uniform sampler2D uStars;varying vec3 vDir;
        void main(){
          vec3 d=normalize(vDir);
          float h=clamp(d.y*0.5+0.15,0.,1.);
          vec3 col=mix(uHorizon,uTop,pow(h,0.4));
          // equirectangular lookup for the star sprite sheet
          vec2 uv=vec2(atan(d.z,d.x)/6.2831853+0.5, acos(clamp(d.y,-1.,1.))/3.1415926);
          vec3 stars=texture2D(uStars,uv).rgb*clamp(d.y*3.0+0.2,0.,1.); // fade near the ground
          col+=stars;
          float sun=smoothstep(0.9993,0.9999,dot(d,normalize(uSun)));
          col+=sun*vec3(1.,0.97,0.9)*1.6;
          float glow=pow(max(dot(d,normalize(uSun)),0.),60.)*0.12;
          col+=glow*vec3(1.,0.85,0.6);
          gl_FragColor=vec4(col,1.);
        }`,
    }),
    mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  scene.add(buildEarth());
  return mesh;
}

function starTexture() {
  const size = 1024,
    c = document.createElement("canvas");
  c.width = size;
  c.height = size / 2;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * c.width,
      y = Math.random() * c.height * 0.85, // keep the lower strip starless, near the "ground" band
      r = Math.random() < 0.08 ? Math.random() * 1.1 + 0.6 : Math.random() * 0.5 + 0.15,
      b = 0.4 + Math.random() * 0.6;
    ctx.fillStyle = `rgba(255,255,255,${b})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A small painted Earth, low on the horizon -- procedural (a swirled
 *  blue/green/white canvas texture on a sphere), not a photo, per the
 *  no-model/no-external-image-asset habit this project has kept even
 *  after adopting real PBR textures for close-up surfaces. */
function buildEarth() {
  const size = 256,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    grad = ctx.createRadialGradient(size * 0.4, size * 0.35, 4, size * 0.5, size * 0.5, size * 0.55);
  grad.addColorStop(0, "#6fb8e8");
  grad.addColorStop(0.55, "#2f6fb0");
  grad.addColorStop(1, "#173a63");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * size,
      y = Math.random() * size,
      w = 20 + Math.random() * 40,
      h = 8 + Math.random() * 14;
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(70,140,70,0.55)";
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * size,
      y = Math.random() * size,
      r = 15 + Math.random() * 25;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 24), new THREE.MeshBasicMaterial({ map: tex }));
  earth.position.set(-180, 55, -260);
  return earth;
}

function realTexture(url: string, repeat: number, srgb = false) {
  const tex = new THREE.TextureLoader().load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cratered regolith ground -- real photoscanned CC0 lunar regolith
 *  (Poly Haven's "Moon 01," scanned from an actual regolith simulant, see
 *  src/assets/CREDITS.md) instead of the earlier canvas-drawn procedural
 *  craters. A real diffuse+normal+roughness scan reads as genuine surface
 *  detail up close in a way procedural noise couldn't -- this is the same
 *  "reads as real material" upgrade already applied to the base's metal
 *  panels, now extended to the ground itself. The cyan grid overlay stays
 *  as a second transparent layer -- the "better navigation" distance/
 *  altitude cues survive the reskin either way. */
export function buildGround(scene: THREE.Scene) {
  const repeat = 55,
    mat = new THREE.MeshStandardMaterial({
      map: realTexture(moonColor, repeat, true),
      normalMap: realTexture(moonNormal, repeat),
      roughnessMap: realTexture(moonRough, repeat),
      roughness: 1,
      metalness: 0,
    }),
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), mat);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);

  const gridTex = gridOverlayTexture();
  gridTex.repeat.set(80, 80);
  const gridMat = new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false }),
    gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), gridMat);
  gridMesh.rotation.x = -Math.PI / 2;
  gridMesh.position.y = 0.01;
  scene.add(gridMesh);

  return mesh;
}

function gridOverlayTexture() {
  const size = 512,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(79,214,255,0.22)";
  ctx.lineWidth = 2;
  const cell = size / 16;
  for (let i = 0; i <= 16; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * cell);
    ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Shared real-metal materials -- used by the hangar landmark below and by
 *  MovingDock.ts's patrolling pad, so every dock-adjacent surface in the
 *  world reads as the same material family. */
export function dockMaterials() {
  const panelMat = new THREE.MeshStandardMaterial({
      map: realTexture(metalColor, 3, true),
      normalMap: realTexture(metalNormal, 3),
      roughnessMap: realTexture(metalRough, 3),
      metalnessMap: realTexture(metalMetalness, 3),
      metalness: 0.9,
      roughness: 0.7,
    }),
    trimMat = new THREE.MeshStandardMaterial({
      map: realTexture(rustColor, 2, true),
      normalMap: realTexture(rustNormal, 2),
      roughnessMap: realTexture(rustRough, 2),
      metalness: 0.6,
      roughness: 0.9,
    });
  return { panelMat, trimMat };
}
