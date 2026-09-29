// A foldable iPhone running an AI agent. The body is lit in WebGL, the
// screens are real DOM placed on it with CSS3DRenderer, and the hologram is a
// third transparent WebGL layer on top — all three share one camera and one
// hinge, so they move as a single object.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1, H = 2.18, T = 0.056, BEV = 0.02, RAD = 0.27;
const TF = T + BEV;                 // front surface; the hinge sits here so closed halves meet screen to screen
const PX = 360;                     // DOM pixels per world unit
const SW = W - 0.06, SH = H - 0.1;  // inner screen (outer bezel .045, hinge side .015)
const CW = W - 0.09;                // cover screen
const IMG = 'assets/photos/agent-clinic.webp';
const PI = Math.PI;

// posture per scene: fold (0 open … π closed), view tilt, landscape turn, centring
const POSE = {
  ask:   { fold: PI,    rx: 0.10,  ry: -0.38, rz: 0,      px: -0.5, py: 0 },
  fold:  { fold: 0,     rx: 0.12,  ry: -0.32, rz: 0,      px: 0,    py: 0 },
  build: { fold: 0,     rx: 0.12,  ry: -0.30, rz: 0,      px: 0,    py: 0 },
  gen:   { fold: 0,     rx: 0.16,  ry: 0.10,  rz: -PI / 2, px: 0,   py: 0 },
  edit:  { fold: 1.62,  rx: -1.02, ry: 0,     rz: -PI / 2, px: 0,   py: -0.35 },
  holo:  { fold: 0,     rx: -1.12, ry: 0.0,   rz: -PI / 2, px: 0,   py: -0.62 }
};

/* ───────────────────────── screens (DOM) ───────────────────────── */
const sbar = dark => `<div class="sbar" style="color:${dark ? '#fff' : '#1d1d1f'}"><span>9:41</span><span class="bat"></span></div>`;
const STEPS = ['Plan the page', 'Write the copy', 'Generate hero image', 'Build and publish'];

function screens() {
  const C = document.createElement('div');
  C.className = 'scr scr-C';
  C.innerHTML = `<div class="dyn"></div>${sbar()}
    <div class="dsc dsc-ask"><div class="chat-h"><div class="ag-ic">✦</div><b>Agent</b></div>
      <div class="hi">What should we make today? <span>Sites, images, 3D.</span></div>
      <div class="thread"><div class="bub me pop"></div><div class="bub ai pop"><span class="shim">Planning the page…</span></div></div>
      <div class="composer"><span class="typed"><span class="ph">Ask the agent</span></span><i class="caret"></i><b class="send">↑</b></div></div>`;

  const L = document.createElement('div');
  L.className = 'scr scr-L';
  L.innerHTML = `${sbar()}
    <div class="dsc dsc-build agent"><div class="ag-head"><div class="ag-ic">✦</div><div><b>Agent</b><span>Riverside Dental · website</span></div></div>
      <div class="ask-q">“Build a site for Riverside Dental with a hero image.”</div>
      <ol class="steps">${STEPS.map(s => `<li><i></i>${s}</li>`).join('')}</ol>
      <div class="prog"><i></i></div><div class="ag-foot">Live preview on the right</div></div>
    <div class="dsc dsc-gen"><div class="rot gen-top" style="width:${SH * PX}px;height:${SW * PX}px"><img src="${IMG}" alt=""><canvas width="192" height="108"></canvas>
      <span class="chip2">✦ Bright dental clinic, morning light</span></div></div>
    <div class="dsc dsc-edit"><div class="rot edit-top" style="width:${SH * PX}px;height:${SW * PX}px"><img src="${IMG}" alt=""><img class="warm" src="${IMG}" alt="">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon class="ants" vector-effect="non-scaling-stroke" points="2,4 44,2 46,70 30,96 3,96"/></svg>
      <span class="toast2">✓ Edited</span></div></div>
    <div class="dsc dsc-holo"><div class="grid"></div><span>Spatial preview</span></div>`;

  const R = document.createElement('div');
  R.className = 'scr scr-R';
  R.innerHTML = `<div class="hole"></div>${sbar()}
    <div class="dsc dsc-build site"><div class="s-nav pop">Riverside Dental<em><i></i><i></i></em></div>
      <div class="s-hero pop"><img src="${IMG}" alt=""><div class="ph"></div></div>
      <div class="s-h1 pop">Smiles, made simple.</div><div class="s-p pop">Gentle care, same‑week visits, and a team that remembers you.</div>
      <span class="s-cta pop">Book a visit</span>
      <div class="s-cards"><div class="pop"><i style="background:#0a84ff"></i>Cleanings</div><div class="pop"><i style="background:#34c759"></i>Implants</div><div class="pop"><i style="background:#ff9f0a"></i>Whitening</div></div>
      <div class="s-stars pop"><b>★★★★★</b> 4.9 from 312 patients</div></div>
    <div class="dsc dsc-gen"><div class="rot gen-bot" style="width:${SH * PX}px;height:${SW * PX}px">
      <div class="row"><b>Variants</b><span class="pct">Generating… 0%</span></div>
      <div class="thumbs">${[0, 1, 2, 3].map(i => `<div class="pop"><img src="${IMG}" alt="" style="filter:${['none', 'hue-rotate(-25deg) saturate(1.3)', 'brightness(1.1) saturate(.7)', 'sepia(.35) saturate(1.4)'][i]}"></div>`).join('')}</div>
      <div class="gbar"><i></i></div></div></div>
    <div class="dsc dsc-edit"><div class="rot edit-bot" style="width:${SH * PX}px;height:${SW * PX}px">
      <div class="ask2"><div class="ag-ic">✦</div>Warm up the window light</div>
      <div class="sl" style="--v:22%"><span>Warmth</span><div class="tr"><i></i><b></b></div><span class="v">+0</span></div>
      <div class="sl" style="--v:48%"><span>Exposure</span><div class="tr"><i></i><b></b></div><span class="v">+0</span></div>
      <div class="btns"><span>Undo</span><span class="go">Apply</span></div></div></div>
    <div class="dsc dsc-holo"><div class="grid"></div><span>Rendering in 3D</span></div>`;
  return { C, L, R };
}

/* ───────────────────────── device (WebGL) ───────────────────────── */
function halfShape(w, h, r) {                      // right half: rounded on the outer (right) side, square on the hinge
  const s = new THREE.Shape();
  s.moveTo(0, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(0, h); s.lineTo(0, -h);
  return s;
}
function fullShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2;
  s.moveTo(x + r, -h); s.lineTo(x + w - r, -h); s.quadraticCurveTo(x + w, -h, x + w, -h + r);
  s.lineTo(x + w, h - r); s.quadraticCurveTo(x + w, h, x + w - r, h); s.lineTo(x + r, h);
  s.quadraticCurveTo(x, h, x, h - r); s.lineTo(x, -h + r); s.quadraticCurveTo(x, -h, x + r, -h);
  return s;
}

function buildBody() {
  const titanium = new THREE.MeshPhysicalMaterial({ color: 0xd8d4cd, metalness: 1, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x050507, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  const back = new THREE.MeshPhysicalMaterial({ color: 0xece8e1, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, side: THREE.DoubleSide });
  const lens = new THREE.MeshPhysicalMaterial({ color: 0x0b0b10, roughness: 0.05, metalness: 0.4, clearcoat: 1 });
  const ring = new THREE.MeshPhysicalMaterial({ color: 0xcfcbc4, metalness: 1, roughness: 0.18 });

  const ext = { depth: T, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 6, curveSegments: 36 };
  const halfGeo = new THREE.ExtrudeGeometry(halfShape(W, H / 2, RAD), ext);
  const faceGeo = new THREE.ShapeGeometry(halfShape(W - 0.004, H / 2 - 0.004, RAD - 0.004), 36);

  const half = withBack => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(halfGeo, titanium));
    const f = new THREE.Mesh(faceGeo, glass); f.position.z = TF + 0.0015; g.add(f);
    const b = new THREE.Mesh(faceGeo, withBack ? back : glass); b.position.z = -BEV - 0.0015; g.add(b);
    return g;
  };

  // right half, with the camera plateau on its back
  const R = half(true);
  const plateau = new THREE.Mesh(new THREE.ExtrudeGeometry(fullShape(0.62, 0.2, 0.12), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 4, curveSegments: 24 }), back);
  plateau.position.set(W - 0.4, H / 2 - 0.3, -BEV - 0.04); R.add(plateau);
  for (const [x, y] of [[W - 0.58, H / 2 - 0.3], [W - 0.4, H / 2 - 0.3], [W - 0.22, H / 2 - 0.3]]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.03, 40), ring); r.rotation.x = PI / 2; r.position.set(x, y, -BEV - 0.055); R.add(r);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.032, 40), lens); l.rotation.x = PI / 2; l.position.set(x, y, -BEV - 0.057); R.add(l);
  }
  // left half: mirrored; its back is the cover screen's black glass
  const L = half(false); L.scale.x = -1; L.position.z = -TF;
  return { R, L };
}

/* ───────────────────────── hologram (WebGL, top layer) ───────────────────────── */
function paneTexture(kind) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 300;
  const g = c.getContext('2d');
  g.strokeStyle = 'rgba(160,220,255,.95)'; g.fillStyle = 'rgba(120,200,255,.28)'; g.lineWidth = 4;
  const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); fill ? g.fill() : g.stroke(); };
  rr(6, 6, 500, 288, 28);
  g.fillStyle = 'rgba(200,235,255,.95)'; g.font = '600 34px -apple-system, Inter, sans-serif';
  if (kind === 0) { g.fillText('Riverside Dental', 36, 70); g.fillStyle = 'rgba(120,200,255,.35)'; for (let i = 0; i < 3; i++) rr(330 + i * 52, 44, 36, 36, 10, true); rr(36, 120, 440, 26, 8, true); rr(36, 164, 300, 26, 8, true); }
  if (kind === 1) { g.fillStyle = 'rgba(120,200,255,.3)'; rr(28, 28, 456, 150, 20, true); g.fillStyle = 'rgba(200,235,255,.95)'; g.font = '700 44px -apple-system, Inter, sans-serif'; g.fillText('Smiles, made simple.', 36, 240); }
  if (kind === 2) { g.fillStyle = 'rgba(120,200,255,.3)'; for (let i = 0; i < 3; i++) rr(28 + i * 156, 40, 140, 200, 20, true); }
  if (kind === 3) { g.fillStyle = 'rgba(120,200,255,.35)'; rr(150, 110, 212, 70, 35, true); g.fillStyle = 'rgba(220,240,255,.95)'; g.font = '600 30px -apple-system, Inter, sans-serif'; g.fillText('Book a visit', 176, 155); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const holoMat = map => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide,
  uniforms: { uMap: { value: map }, uTime: { value: 0 }, uA: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D uMap; uniform float uTime, uA; varying vec2 vUv;
    void main(){ vec4 t = texture2D(uMap, vUv);
      float scan = .7 + .3 * sin(vUv.y * 320. - uTime * 7.);
      float flick = .92 + .08 * sin(uTime * 31.) * sin(uTime * 13.);
      vec3 col = mix(vec3(.35,.75,1.), vec3(.75,.55,1.), vUv.x) * (t.a * 1.3 + .08);
      gl_FragColor = vec4(col * scan * flick * 1.25, (t.a * .85 + .1) * uA); }`
});

function buildHolo() {
  const g = new THREE.Group();
  const panes = [0, 1, 2, 3].map(k => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.88), holoMat(paneTexture(k)));
    m.rotation.z = PI / 2; g.add(m); return m;
  });
  // light cone from the screen up
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.55, 2.0, 48, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uA: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform float uA,uTime; varying vec2 vUv; void main(){ float a = (1. - vUv.y) * .22 * (.8 + .2 * sin(vUv.x * 60. + uTime * 2.)); gl_FragColor = vec4(.4,.7,1., a * uA); }'
  }));
  cone.rotation.x = PI / 2; cone.position.z = TF + 1.0; g.add(cone);
  // particles drifting up
  const N = 420, pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - .5) * 1.8; pos[i * 3 + 1] = (Math.random() - .5) * 1.2; pos[i * 3 + 2] = TF + Math.random() * 1.6; spd[i] = .15 + Math.random() * .35; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.022, color: 0x9fd8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(pts);
  return { g, panes, cone, pts, pos, spd, N };
}

/* ───────────────────────── mount ───────────────────────── */
export function mount({ stage, pills, slider, still }) {
  stage.querySelector('.loading')?.remove();
  const glB = document.createElement('canvas'), glF = document.createElement('canvas'), cssEl = document.createElement('div');
  glF.className = 'fx'; cssEl.className = 'css3d';
  stage.prepend(glF); stage.prepend(cssEl); stage.prepend(glB);

  const mkR = canvas => { const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; return r; };
  const rB = mkR(glB), rF = mkR(glF), rC = new CSS3DRenderer({ element: cssEl });
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50); camera.position.set(0, 0, 8.4);

  // three scenes, one rig each, driven by the same pose every frame
  const sB = new THREE.Scene(), sC = new THREE.Scene(), sF = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(rB); sB.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3, 4, 6); sB.add(key);
  const rig = () => { const d = new THREE.Group(), h = new THREE.Group(); h.position.z = TF; d.add(h); return { d, h }; };
  const B = rig(), Cc = rig(), F = rig();
  sB.add(B.d); sC.add(Cc.d); sF.add(F.d);
  const body = buildBody(); B.d.add(body.R); B.h.add(body.L);

  const { C, L, R } = screens();
  const place = (el, w, h, parent, x, z, ry = 0) => {
    el.style.width = w * PX + 'px'; el.style.height = h * PX + 'px';
    const o = new CSS3DObject(el); o.scale.setScalar(1 / PX); o.position.set(x, 0, z); o.rotation.y = ry; parent.add(o); return o;
  };
  const oR = place(R, SW, SH, Cc.d, 0.015 + SW / 2, TF + 0.003);
  place(L, SW, SH, Cc.h, -(0.015 + SW / 2), 0.003);
  place(C, CW, SH, Cc.h, -W / 2, -(T + 2 * BEV) - 0.003, PI);

  const holo = buildHolo(); F.d.add(holo.g);

  // size
  const size = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    [rB, rF].forEach(r => r.setSize(w, h, false)); rC.setSize(w, h);
    camera.aspect = w / h; camera.position.z = w < 520 ? 10.2 : 8.4; camera.updateProjectionMatrix();
  };
  new ResizeObserver(size).observe(stage); size();

  // pose: eased toward the target every frame
  const cur = { ...POSE.build }, tgt = { ...POSE.build }, par = { x: 0, y: 0 };
  let holoA = 0, holoStart = performance.now();
  const applyPose = () => {
    for (const r of [B, Cc, F]) {
      r.d.rotation.set(cur.rx + par.y, cur.ry + par.x, cur.rz, 'XYZ');
      r.d.position.set(cur.px * Math.cos(cur.ry), cur.py, 0);
      r.h.rotation.y = cur.fold;
    }
    // the inner right screen hides as the cover closes over it
    R.style.opacity = cur.fold > 2.2 ? Math.max(0, 1 - (cur.fold - 2.2) * 2.5) : 1;
  };
  stage.addEventListener('pointermove', e => {
    const b = stage.getBoundingClientRect();
    par.x = ((e.clientX - b.left) / b.width - .5) * 0.22; par.y = ((e.clientY - b.top) / b.height - .5) * 0.14;
  });
  stage.addEventListener('pointerleave', () => { par.x = par.y = 0; });

  /* ── scenes: what the agent does in each posture ── */
  let timers = [];
  const at = (ms, f) => timers.push(setTimeout(f, ms));
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const q = (el, s) => el.querySelector(s), qa = (el, s) => [...el.querySelectorAll(s)];
  const PROMPT = 'Build a site for Riverside Dental with a hero image';
  let noiseRAF = 0;

  const SCENES = {
    ask() {
      const typed = q(C, '.typed'), me = q(C, '.bub.me'), ai = q(C, '.bub.ai'), send = q(C, '.send');
      typed.innerHTML = '<span class="ph">Ask the agent</span>'; me.classList.remove('on'); ai.classList.remove('on'); send.classList.remove('hot');
      [...PROMPT].forEach((ch, i) => at(500 + i * 38, () => { if (i === 0) typed.textContent = ''; typed.textContent += ch; send.classList.add('hot'); }));
      const t = 500 + PROMPT.length * 38 + 350;
      at(t, () => { me.textContent = PROMPT + '.'; me.classList.add('on'); typed.innerHTML = '<span class="ph">Ask the agent</span>'; send.classList.remove('hot'); });
      at(t + 600, () => ai.classList.add('on'));
      return t + 2600;
    },
    build() {
      const steps = qa(L, '.steps li'), bar = q(L, '.prog i'), pops = qa(R, '.dsc-build .pop'), hero = q(R, '.s-hero');
      steps.forEach(s => s.className = ''); bar.style.width = '0'; pops.forEach(p => p.classList.remove('on')); hero.classList.remove('img');
      steps.forEach((s, i) => { at(700 + i * 1250, () => s.className = 'run'); at(700 + i * 1250 + 1000, () => { s.className = 'done'; bar.style.width = (i + 1) * 25 + '%'; }); });
      const plan = [[900, 0], [1500, 1], [2300, 2], [2700, 3], [3100, 4], [3500, 5], [3700, 6], [3900, 7], [4300, 8]];
      plan.forEach(([ms, i]) => at(ms, () => pops[i] && pops[i].classList.add('on')));
      at(3400, () => hero.classList.add('img'));
      return 7200;
    },
    gen() {
      const top = q(L, '.gen-top'), cv = q(L, '.gen-top canvas'), g = cv.getContext('2d'), th = qa(R, '.thumbs .pop'), pct = q(R, '.pct'), gb = q(R, '.gbar i');
      top.classList.remove('sharp'); th.forEach(t => t.classList.remove('on', 'sel')); gb.style.width = '0'; pct.textContent = 'Generating… 0%';
      const img = g.createImageData(cv.width, cv.height);
      cancelAnimationFrame(noiseRAF);
      const noise = () => { for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = v * .8; img.data[i + 1] = v * .85; img.data[i + 2] = v; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); noiseRAF = requestAnimationFrame(noise); };
      noise();
      at(500, () => top.classList.add('sharp'));
      for (let p = 0; p <= 100; p += 4) at(500 + p * 32, () => { pct.textContent = p < 100 ? `Generating… ${p}%` : 'Done · 4 variants'; gb.style.width = p + '%'; });
      th.forEach((t, i) => at(1600 + i * 450, () => t.classList.add('on')));
      at(4200, () => { th[0].classList.add('sel'); cancelAnimationFrame(noiseRAF); });
      return 6200;
    },
    edit() {
      const top = q(L, '.edit-top'), sl = qa(R, '.sl'), vs = qa(R, '.sl .v'), go = q(R, '.btns .go');
      top.classList.remove('sel', 'brushed', 'done'); sl[0].style.setProperty('--v', '22%'); sl[1].style.setProperty('--v', '48%'); vs.forEach(v => v.textContent = '+0'); go.classList.remove('press');
      at(900, () => top.classList.add('sel'));
      at(2000, () => { sl[0].style.setProperty('--v', '78%'); sl[1].style.setProperty('--v', '62%'); vs[0].textContent = '+42'; vs[1].textContent = '+12'; top.classList.add('brushed'); });
      at(4200, () => go.classList.add('press'));
      at(4450, () => { go.classList.remove('press'); top.classList.add('done'); top.classList.remove('sel'); });
      return 6800;
    },
    holo() { holoStart = performance.now(); return 7600; }
  };

  // run a scene: set the posture, then its animation
  let scene = 'build', auto = !still, tour, order = ['ask', 'build', 'gen', 'edit', 'holo'], oi = 1;
  const show = (name, user) => {
    if (user) { auto = false; clearTimeout(tour); }
    clear(); cancelAnimationFrame(noiseRAF);
    scene = name; stage.dataset.scene = name;
    Object.assign(tgt, POSE[name]);
    pills.forEach(b => { const on = b.dataset.scene === name || (name === 'fold' && b.dataset.scene === 'fold'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    const dur = SCENES[name] ? SCENES[name]() : 6000;
    if (auto) tour = setTimeout(() => { oi = (order.indexOf(name) + 1) % order.length; show(order[oi]); }, dur);
  };
  pills.forEach(b => b.addEventListener('click', e => { if (e.target === slider) return; show(b.dataset.scene, true); }));
  slider.addEventListener('input', () => {
    if (scene !== 'fold') show('fold', true);
    tgt.fold = PI * (1 - slider.value / 100); tgt.px = -0.5 * (1 - slider.value / 100);
    stage.dataset.scene = slider.value < 6 ? 'ask' : 'fold';
  });
  ['pointerdown', 'click'].forEach(ev => slider.addEventListener(ev, e => e.stopPropagation()));

  // render loop, only while on screen
  let running = false;
  const clock = new THREE.Clock();
  const frame = () => {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
    const k = 1 - Math.exp(-dt * (scene === 'ask' || scene === 'build' ? 2.6 : 3.2));
    for (const key in tgt) cur[key] += (tgt[key] - cur[key]) * k;
    applyPose();
    // hologram
    holoA += ((scene === 'holo' ? 1 : 0) - holoA) * (1 - Math.exp(-dt * 2.5));
    const holoT = (performance.now() - holoStart) / 1000;
    holo.panes.forEach((p, i) => {
      const rise = Math.min(1, Math.max(0, (holoT - 0.6 - i * 0.35) / 1.4)), e = 1 - Math.pow(1 - rise, 3);
      p.position.set(Math.sin(t * .6 + i) * 0.03, 0, TF + 0.2 + e * (0.34 + i * 0.4) + Math.sin(t * 1.2 + i) * 0.015);
      p.rotation.set(Math.sin(t * .5 + i) * 0.05, 0, PI / 2 + Math.sin(t * .4 + i) * 0.04);
      p.material.uniforms.uTime.value = t; p.material.uniforms.uA.value = holoA * e;
    });
    holo.cone.material.uniforms.uA.value = holoA; holo.cone.material.uniforms.uTime.value = t;
    holo.pts.material.opacity = holoA * 0.9;
    if (holoA > 0.01) {
      for (let i = 0; i < holo.N; i++) { holo.pos[i * 3 + 2] += holo.spd[i] * dt; if (holo.pos[i * 3 + 2] > TF + 2.0) holo.pos[i * 3 + 2] = TF; }
      holo.pts.geometry.attributes.position.needsUpdate = true;
    }
    holo.g.visible = holoA > 0.01;
    rB.render(sB, camera); rC.render(sC, camera); rF.render(sF, camera);
    requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) { clock.getDelta(); requestAnimationFrame(frame); if (auto && !timers.length) show(scene); }
    else { clearTimeout(tour); clear(); }
  }, { threshold: 0.15 }).observe(stage);

  if (still) { show('build'); Object.assign(cur, POSE.build); }
  else { Object.assign(cur, POSE.ask); show('ask'); }
  applyPose(); rB.render(sB, camera); rC.render(sC, camera);
}
