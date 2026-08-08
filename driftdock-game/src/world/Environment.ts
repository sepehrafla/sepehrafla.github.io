import * as THREE from "three";

/** Procedural sky dome + ground -- no texture files, per the brief's
 *  no-model-files rule (extended here to no external textures either, same
 *  reasoning: keeps the whole game a single static bundle with zero asset
 *  provenance to track). Sky is a two-tone gradient with a soft sun disc;
 *  ground is a canvas-generated grid/checker so distance and altitude
 *  actually read at a glance (the "better navigation" ask -- a flat gray
 *  plane gives no depth cues at all). */
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

function gridTexture() {
  const size = 512,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#12161d";
  ctx.fillRect(0, 0, size, size);
  // Subtle checker for depth cueing.
  const cell = size / 16;
  ctx.fillStyle = "#171c25";
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);
  ctx.strokeStyle = "rgba(79,214,255,0.16)";
  ctx.lineWidth = 2;
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
  tex.repeat.set(80, 80);
  tex.anisotropy = 4;
  return tex;
}

export function buildGround(scene: THREE.Scene) {
  const mat = new THREE.MeshStandardMaterial({ map: gridTexture(), roughness: 0.96, metalness: 0 }),
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), mat);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
  return mesh;
}
