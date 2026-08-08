import * as THREE from "three";
import concreteColor from "../assets/textures/concrete/color.jpg";
import concreteNormal from "../assets/textures/concrete/normal.jpg";
import concreteRough from "../assets/textures/concrete/roughness.jpg";
import metalColor from "../assets/textures/metal/color.jpg";
import metalNormal from "../assets/textures/metal/normal.jpg";
import metalRough from "../assets/textures/metal/roughness.jpg";
import metalMetalness from "../assets/textures/metal/metalness.jpg";
import rustColor from "../assets/textures/rust/color.jpg";
import rustNormal from "../assets/textures/rust/normal.jpg";
import rustRough from "../assets/textures/rust/roughness.jpg";

// Real CC0 PBR textures (ambientCG) drive the ground and dock materials --
// see src/assets/CREDITS.md for provenance. An HDRI-based image lighting
// pass (Poly Haven, applied via scene.environment) was tried too, but was
// dropped: verified live that even at envMapIntensity 0.06 it fully blew
// out the concrete texture's real detail under ACES tone mapping (nulling
// scene.environment was the only thing that brought the texture back) --
// an outdoor sun-capture HDRI's raw radiance is just too far above this
// scene's other lights to tame cheaply. The direct-mapped textures alone
// already read as real material without it.

/** Sky dome stays a cheap procedural gradient + sun -- no load time, and it
 *  matches the game's HUD palette better than a photo sky would. */
export function buildSky(scene: THREE.Scene) {
  const geo = new THREE.SphereGeometry(400, 24, 16),
    mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x1a2740) },
        uHorizon: { value: new THREE.Color(0x3d5570) },
        uSun: { value: new THREE.Vector3(0.35, 0.25, -0.6).normalize() },
      },
      vertexShader: `varying vec3 vDir;void main(){vDir=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        uniform vec3 uTop,uHorizon,uSun;varying vec3 vDir;
        void main(){
          float h=clamp(vDir.y*0.5+0.15,0.,1.);
          vec3 col=mix(uHorizon,uTop,pow(h,0.7));
          float sun=smoothstep(0.9992,0.9999,dot(normalize(vDir),normalize(uSun)));
          col+=sun*vec3(1.,0.85,0.55)*1.1;
          float glow=pow(max(dot(normalize(vDir),normalize(uSun)),0.),80.)*0.18;
          col+=glow*vec3(1.,0.7,0.4);
          gl_FragColor=vec4(col,1.);
        }`,
    }),
    mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}

function realTexture(url: string, repeat: number, srgb = false) {
  const tex = new THREE.TextureLoader().load(url);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Real CC0 concrete PBR ground (was a canvas-drawn flat-gray checker) --
 *  the cyan grid overlay is kept as a second transparent layer just above
 *  it so the "better navigation" distance/altitude cues survive the switch
 *  to a real material. */
export function buildGround(scene: THREE.Scene) {
  const repeat = 90,
    mat = new THREE.MeshStandardMaterial({
      map: realTexture(concreteColor, repeat, true),
      normalMap: realTexture(concreteNormal, repeat),
      roughnessMap: realTexture(concreteRough, repeat),
      roughness: 1,
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

/** A landmark dock/hangar structure -- real weathered-metal materials, a
 *  visible destination that also gives the arena scale and orientation
 *  cues ("the world the drone sees" needs a few real, readable structures,
 *  not just scattered pylons). Geometry/material only, a flythrough
 *  silhouette -- the actual dockable target is MovingDock.ts's pad. */
export function buildDock(scene: THREE.Scene, position: THREE.Vector3) {
  const group = new THREE.Group();
  group.position.copy(position);
  const { panelMat, trimMat } = dockMaterials();

  // Two side walls + a roof beam, open front/back -- a hangar bay silhouette
  // large enough to fly through, not just past.
  const wallGeo = new THREE.BoxGeometry(0.5, 6, 8);
  for (const side of [-1, 1]) {
    const wall = new THREE.Mesh(wallGeo, panelMat);
    wall.position.set(side * 4, 3, 0);
    group.add(wall);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.5, 8), panelMat);
  roof.position.set(0, 6, 0);
  group.add(roof);
  // Weathered trim beams along the bay mouth -- visual framing + a hint of
  // wear that pure-metal panels alone don't sell.
  for (const z of [-4, 4]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.3, 0.3), trimMat);
    beam.position.set(0, 6.3, z);
    group.add(beam);
  }

  scene.add(group);
  return group;
}
