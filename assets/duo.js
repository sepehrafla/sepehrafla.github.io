// A foldable iPhone running an AI agent — built the way Apple's product
// viewer is: one WebGL scene holds the body AND the screens, so nothing can
// drift apart in any browser, and a hit area on the stage lets you grab and
// turn it. Where Apple maps baked screenshots onto the glass, these screens are
// canvases redrawn from a timeline, so the agent's UI animates live.
//
// Proportions follow iPhone Duo (apple.com/iphone-duo/specs): 164.6 × 117.8 mm
// open and 84.1 × 117.8 mm closed, so each half is about 82 × 118 mm.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1, H = 1.43;                    // one half, 82 × 118 mm
const T = 0.039, BEV = 0.012, RAD = 0.15; // 5.2 mm per half when open
const TF = T + BEV;                       // front surface; the hinge sits here
const SW = W - 0.05, SH = H - 0.07;       // inner screen, per half
const CW = W - 0.07;                      // cover screen
const SRAD = 0.1;                         // screen corner radius
const PXU = 360;                          // screen canvas: CSS px per world unit (drawn at 2×)
const IMG = 'assets/photos/agent-clinic.webp';
const ROOM = 'assets/photos/ar-reception.jpg';
const PI = Math.PI;

const POSE = {
  ask:    { fold: PI,   rx: 0.10, ry: -0.40,    rz: 0,       px: -0.5, py: 0 },
  fold:   { fold: 0,    rx: 0.10, ry: -0.30,    rz: 0,       px: 0,    py: 0 },
  build:  { fold: 0,    rx: 0.10, ry: -0.28,    rz: 0,       px: 0,    py: 0 },
  gen:    { fold: 0,    rx: 0.12, ry: 0.14,     rz: -PI / 2, px: 0,    py: 0 },
  edit:   { fold: 1.62, rx: -1.0, ry: 0,        rz: -PI / 2, px: 0,    py: -0.18 },
  arBack: { fold: 0,    rx: 0.08, ry: PI - 0.5, rz: 0,       px: 0,    py: 0 },
  ar:     { fold: 0,    rx: 0.05, ry: -0.16,    rz: 0,       px: 0,    py: 0 }
};
const DUR = { ask: 4.6, build: 6.8, gen: 6.0, edit: 6.5, ar: 10.5, fold: 1 };

/* ───────────────────────── a tiny canvas UI kit ───────────────────────── */
const FONT = '-apple-system, "SF Pro Text", "SF Pro Display", Inter, "Helvetica Neue", Arial, sans-serif';
const cl = v => Math.min(1, Math.max(0, v));
const eo = x => 1 - Math.pow(1 - cl(x), 3);
const eio = x => { x = cl(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const rr = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
function text(g, s, x, y, size, weight, color, o = {}) {
  g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
  if (!o.maxW) { g.fillText(s, x, y); return size * (o.lh || 1.3); }
  const words = s.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > o.maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  const lh = size * (o.lh || 1.3);
  lines.forEach((l, i) => g.fillText(l, x, y + i * lh));
  return lines.length * lh;
}
function pop(g, t, start, draw) {
  const p = eo((t - start) / 0.5); if (p <= 0) return;
  g.save(); g.globalAlpha *= p; g.translate(0, (1 - p) * 8); draw(); g.restore();
}
function statusBar(g, w, color = '#1d1d1f') {
  text(g, '9:41', 22, 25, 13, 600, color);
  g.strokeStyle = color; g.lineWidth = 1.3; rr(g, w - 45, 14, 23, 11, 3.5); g.stroke();
  g.fillStyle = color; rr(g, w - 43, 16, 15, 7, 1.5); g.fill();
}
function agentIcon(g, x, y, s) {
  let fill;
  if (g.createConicGradient) { fill = g.createConicGradient(3.5, x + s / 2, y + s / 2); [['#5e5ce6', 0], ['#bf5af2', .25], ['#ff375f', .5], ['#ff9f0a', .75], ['#5e5ce6', 1]].forEach(([c, p]) => fill.addColorStop(p, c)); }
  else { fill = g.createLinearGradient(x, y, x + s, y + s); fill.addColorStop(0, '#5e5ce6'); fill.addColorStop(1, '#ff375f'); }
  g.fillStyle = fill; rr(g, x, y, s, s, s * .3); g.fill();
  text(g, '✦', x + s / 2, y + s / 2 + 1, s * .5, 700, '#fff', { align: 'center', base: 'middle' });
}
function cover(g, img, x, y, w, h, r = 0, sharp = 1) {
  if (!img.complete || !img.naturalWidth) { g.fillStyle = '#e9e7f3'; rr(g, x, y, w, h, r); g.fill(); return; }
  g.save(); rr(g, x, y, w, h, r); g.clip();
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight), iw = img.naturalWidth * s, ih = img.naturalHeight * s;
  if (sharp >= 0.999) g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  else {                                                   // a blur that works everywhere: draw small, scale up smoothly
    const k = 0.02 + 0.98 * sharp * sharp, tw = Math.max(4, Math.round(w * k)), th = Math.max(3, Math.round(h * k));
    const off = cover.off || (cover.off = document.createElement('canvas')); off.width = tw; off.height = th;
    const o = off.getContext('2d'); o.imageSmoothingQuality = 'high';
    o.drawImage(img, (tw - iw * k) / 2, (th - ih * k) / 2, iw * k, ih * k);
    g.imageSmoothingQuality = 'high'; g.drawImage(off, x, y, w, h);
  }
  g.restore();
}
function tint(g, x, y, w, h, r, color, op) { g.save(); rr(g, x, y, w, h, r); g.clip(); g.globalCompositeOperation = op; g.fillStyle = color; g.fillRect(x, y, w, h); g.restore(); }

/* ───────────────────────── the agent app, drawn ───────────────────────── */
const PROMPT = 'Build a site for Riverside Dental with a hero image';
const STEPS = ['Plan the page', 'Write the copy', 'Generate hero image', 'Build and publish'];

function drawCover(g, w, h, t) {
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#f4f2ff'); bg.addColorStop(.45, '#fff'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  statusBar(g, w); g.fillStyle = '#000'; rr(g, w / 2 - 44, 9, 88, 26, 13); g.fill();
  agentIcon(g, 18, 56, 30); text(g, 'Agent', 56, 79, 24, 700, '#1d1d1f');
  const hh = text(g, 'What should we make today?', 18, 124, 19, 600, '#1d1d1f', { maxW: w - 36, lh: 1.2 });
  text(g, 'Sites, images, 3D.', 18, 124 + hh, 19, 600, '#8e8e93');
  const cy = h - 18 - 42, n = Math.floor((t - 0.4) / 0.03), sent = 0.4 + PROMPT.length * 0.03 + 0.3;
  g.fillStyle = '#f2f2f7'; rr(g, 18, cy, w - 36, 42, 21); g.fill();
  g.save(); rr(g, 30, cy, w - 90, 42, 0); g.clip();
  if (n > 0 && t < sent) {
    let s = PROMPT.slice(0, n); g.font = `400 14px ${FONT}`;
    while (g.measureText(s).width > w - 96) s = s.slice(1);
    text(g, s, 32, cy + 26, 14, 400, '#1d1d1f');
    if (Math.floor(t * 2) % 2 === 0) { g.font = `400 14px ${FONT}`; g.fillStyle = '#0a84ff'; g.fillRect(34 + g.measureText(s).width, cy + 12, 2, 18); }
  } else text(g, 'Ask the agent', 32, cy + 26, 14, 400, '#8e8e93');
  g.restore();
  g.fillStyle = n > 0 && t < sent ? '#0a84ff' : '#c7c7cc'; g.beginPath(); g.arc(w - 39, cy + 21, 15, 0, 7); g.fill();
  text(g, '↑', w - 39, cy + 22, 15, 700, '#fff', { align: 'center', base: 'middle' });
  if (t > sent) {
    const bw = (w - 36) * 0.86; g.font = `400 14px ${FONT}`;
    const lines = Math.ceil(g.measureText(PROMPT + '.').width / (bw - 24)) || 1, bh = lines * 18 + 18;
    let y = cy - 10 - 36;
    pop(g, t, sent + 0.5, () => {
      g.fillStyle = '#f2f2f7'; rr(g, 18, y, 150, 36, 18); g.fill();
      const a = 0.45 + 0.35 * Math.sin(t * 5); text(g, 'Planning the page…', 30, y + 23, 14, 400, `rgba(110,110,115,${a + .2})`);
    });
    y -= bh + 8;
    pop(g, t, sent, () => {
      g.fillStyle = '#0a84ff'; rr(g, w - 18 - bw, y, bw, bh, 18); g.fill();
      text(g, PROMPT + '.', w - 18 - bw + 12, y + 22, 14, 400, '#fff', { maxW: bw - 24, lh: 1.28 });
    });
  }
}

function stepIcon(g, x, y, state, t) {
  if (state === 'done') { g.fillStyle = '#34c759'; g.beginPath(); g.arc(x, y, 10.5, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x - 4.5, y); g.lineTo(x - 1, y + 3.5); g.lineTo(x + 5, y - 3.5); g.stroke(); return; }
  g.lineWidth = 2; g.strokeStyle = '#d1d1d6'; g.beginPath(); g.arc(x, y, 9.5, 0, 7); g.stroke();
  if (state === 'run') { g.strokeStyle = '#0a84ff'; g.beginPath(); g.arc(x, y, 9.5, t * 7, t * 7 + 4.2); g.stroke(); }
}
function drawAgent(g, w, h, t) {
  g.fillStyle = '#fafafc'; g.fillRect(0, 0, w, h); statusBar(g, w);
  agentIcon(g, 18, 42, 30); text(g, 'Agent', 56, 58, 19, 700, '#1d1d1f'); text(g, 'Riverside Dental · website', 56, 72, 11.5, 400, '#8e8e93');
  g.fillStyle = '#fff'; rr(g, 18, 86, w - 36, 48, 13); g.fill(); g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1; g.stroke();
  text(g, '“' + PROMPT + '.”', 29, 106, 12.5, 400, '#3a3a3c', { maxW: w - 58, lh: 1.3 });
  let done = 0;
  STEPS.forEach((s, i) => {
    const run = 0.7 + i * 1.15, fin = run + 0.9, state = t >= fin ? 'done' : t >= run ? 'run' : 'wait';
    if (state === 'done') done++;
    const y = 162 + i * 32; stepIcon(g, 29, y, state, t);
    text(g, s, 48, y + 5, 14.5, 500, state === 'wait' ? '#aeaeb2' : '#1d1d1f');
  });
  g.fillStyle = '#e5e5ea'; rr(g, 18, h - 40, w - 36, 5, 2.5); g.fill();
  const pg = g.createLinearGradient(18, 0, w - 18, 0); pg.addColorStop(0, '#5e5ce6'); pg.addColorStop(.5, '#bf5af2'); pg.addColorStop(1, '#ff375f');
  g.fillStyle = pg; rr(g, 18, h - 40, Math.max(0.01, (w - 36) * done / 4), 5, 2.5); g.fill();
  text(g, 'Live preview on the right', 18, h - 20, 11.5, 400, '#8e8e93');
}
function drawSite(g, w, h, t, img) {
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); statusBar(g, w);
  g.fillStyle = '#000'; g.beginPath(); g.arc(w / 2, 20, 7.5, 0, 7); g.fill();
  const x = 14, iw = w - 28;
  pop(g, t, 0.9, () => { text(g, 'Riverside Dental', x, 56, 13, 700, '#1d1d1f'); g.fillStyle = '#1d1d1f'; g.fillRect(w - 46, 49, 15, 2); g.fillRect(w - 28, 49, 15, 2); });
  pop(g, t, 1.4, () => {
    const a = eo((t - 3.2) / 0.8);
    g.fillStyle = '#eceaf6'; rr(g, x, 66, iw, 128, 15); g.fill();
    if (a < 1) { const sx = ((t * 0.8) % 1.6 - 0.3) * iw; const sg = g.createLinearGradient(x + sx - 60, 0, x + sx + 60, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(.5, 'rgba(255,255,255,.7)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); rr(g, x, 66, iw, 128, 15); g.clip(); g.fillStyle = sg; g.fillRect(x, 66, iw, 128); g.restore(); }
    if (a > 0) { g.save(); g.globalAlpha *= a; cover(g, img, x, 66, iw, 128, 15); g.restore(); }
  });
  pop(g, t, 2.2, () => text(g, 'Smiles, made simple.', x, 222, 22, 700, '#1d1d1f'));
  pop(g, t, 2.6, () => text(g, 'Gentle care, same‑week visits, and a team that remembers you.', x, 240, 11.5, 400, '#6e6e73', { maxW: iw, lh: 1.3 }));
  pop(g, t, 3.0, () => { g.fillStyle = '#0071e3'; rr(g, x, 266, 96, 28, 14); g.fill(); text(g, 'Book a visit', x + 48, 281, 12.5, 600, '#fff', { align: 'center', base: 'middle' }); });
  const cw = (iw - 12) / 3;
  [['Cleanings', '#0a84ff'], ['Implants', '#34c759'], ['Whitening', '#ff9f0a']].forEach(([n, c], i) => pop(g, t, 3.4 + i * 0.2, () => {
    const cx = x + i * (cw + 6); g.fillStyle = '#f5f5f7'; rr(g, cx, 306, cw, 52, 11); g.fill(); g.fillStyle = c; rr(g, cx + 7, 314, 17, 17, 5); g.fill(); text(g, n, cx + 7, 348, 10.5, 600, '#1d1d1f');
  }));
  pop(g, t, 4.2, () => { text(g, '★★★★★', x, 380, 11, 400, '#ff9f0a'); text(g, '4.9 from 312 patients', x + 62, 380, 11, 400, '#6e6e73'); });
}
// Portrait and tabletop turn the device a quarter turn; draw those layouts turned back
function rotated(g, w, h, draw) { g.save(); g.translate(0, h); g.rotate(-PI / 2); draw(h, w); g.restore(); }
const noise = (() => { const c = document.createElement('canvas'); c.width = 96; c.height = 64; return c; })();
function drawGenTop(g, w, h, t, img) {
  rotated(g, w, h, (W2, H2) => {
    const s = eio((t - 0.5) / 3.4);
    g.fillStyle = '#000'; g.fillRect(0, 0, W2, H2); cover(g, img, 0, 0, W2, H2, 0, s);
    if (s < 1) {
      const n = noise.getContext('2d'), d = n.createImageData(96, 64);
      for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = v * .8; d.data[i + 1] = v * .85; d.data[i + 2] = v; d.data[i + 3] = 255; }
      n.putImageData(d, 0, 0); g.save(); g.globalAlpha = (1 - s) * 0.85; g.globalCompositeOperation = 'screen'; g.imageSmoothingEnabled = false; g.drawImage(noise, 0, 0, W2, H2); g.restore();
    }
    g.fillStyle = 'rgba(30,30,34,.5)'; rr(g, 16, H2 - 46, 238, 30, 15); g.fill(); text(g, '✦ Bright dental clinic, morning light', 28, H2 - 26, 12.5, 500, '#fff');
  });
}
function drawGenBot(g, w, h, t, img) {
  rotated(g, w, h, (W2, H2) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W2, H2);
    const p = Math.min(100, Math.floor(cl((t - 0.5) / 3.0) * 100));
    text(g, 'Variants', 20, 40, 19, 700, '#1d1d1f');
    text(g, p < 100 ? `Generating… ${p}%` : 'Done · 4 variants', W2 - 20, 40, 13, 400, '#8e8e93', { align: 'right' });
    const tw = (W2 - 40 - 24) / 4, th = tw * .75;
    const tints = [null, ['rgba(255,70,120,.32)', 'color'], ['rgba(255,255,255,.22)', 'screen'], ['rgba(210,140,60,.4)', 'multiply']];
    tints.forEach((tn, i) => pop(g, t, 1.5 + i * 0.42, () => {
      const x = 20 + i * (tw + 8), y = 58; cover(g, img, x, y, tw, th, 11); if (tn) tint(g, x, y, tw, th, 11, tn[0], tn[1]);
      if (i === 0 && t > 3.9) { g.strokeStyle = '#0a84ff'; g.lineWidth = 3; rr(g, x - 1.5, y - 1.5, tw + 3, th + 3, 12); g.stroke(); }
    }));
    g.fillStyle = '#e5e5ea'; rr(g, 20, H2 - 30, W2 - 40, 5, 2.5); g.fill();
    g.fillStyle = '#0a84ff'; rr(g, 20, H2 - 30, Math.max(0.01, (W2 - 40) * p / 100), 5, 2.5); g.fill();
  });
}
function drawEditTop(g, w, h, t, img) {
  rotated(g, w, h, (W2, H2) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, W2, H2); cover(g, img, 0, 0, W2, H2);
    const rv = eio((t - 1.9) / 2.0);
    if (rv > 0) { g.save(); g.beginPath(); g.rect(0, 0, W2 * rv, H2); g.clip(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(255,150,40,.85)'; g.fillRect(0, 0, W2, H2); g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgba(255,190,120,.18)'; g.fillRect(0, 0, W2, H2); g.restore(); }
    if (t > 0.9 && t < 4.25) {
      const pts = [[.02, .04], [.44, .02], [.46, .7], [.3, .96], [.03, .96]];
      g.save(); g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo : g.moveTo).call(g, a * W2, b * H2)); g.closePath();
      g.fillStyle = 'rgba(10,132,255,.12)'; g.fill(); g.setLineDash([9, 7]); g.lineDashOffset = -t * 40; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.stroke(); g.restore();
    }
    if (t > 4.25) pop(g, t, 4.25, () => { g.fillStyle = 'rgba(255,255,255,.92)'; rr(g, W2 / 2 - 48, 14, 96, 30, 15); g.fill(); text(g, '✓ Edited', W2 / 2, 30, 13, 600, '#1d1d1f', { align: 'center', base: 'middle' }); });
  });
}
function drawEditBot(g, w, h, t) {
  rotated(g, w, h, (W2, H2) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, W2, H2);
    g.fillStyle = '#f2f2f7'; rr(g, 20, 18, W2 - 40, 40, 15); g.fill(); agentIcon(g, 30, 26, 24); text(g, 'Warm up the window light', 64, 43, 14, 500, '#1d1d1f');
    const a = eio((t - 1.9) / 1.6);
    [['Warmth', .22, .78, 42], ['Exposure', .48, .62, 12]].forEach(([n, v0, v1, d], i) => {
      const y = 84 + i * 34, v = v0 + (v1 - v0) * a, x0 = 108, tw = W2 - 20 - 44 - x0;
      text(g, n, 20, y + 4, 12.5, 400, '#3a3a3c');
      g.fillStyle = '#e5e5ea'; rr(g, x0, y - 2, tw, 5, 2.5); g.fill(); g.fillStyle = '#ff9f0a'; rr(g, x0, y - 2, tw * v, 5, 2.5); g.fill();
      g.fillStyle = '#fff'; g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 6; g.beginPath(); g.arc(x0 + tw * v, y + .5, 9.5, 0, 7); g.fill(); g.shadowBlur = 0;
      text(g, '+' + Math.round(d * a), W2 - 20, y + 4, 12.5, 400, '#3a3a3c', { align: 'right' });
    });
    const press = t > 4.0 && t < 4.25 ? 0.94 : 1, bw = (W2 - 49) / 2, by = H2 - 54;
    g.fillStyle = '#f2f2f7'; rr(g, 20, by, bw, 36, 12); g.fill(); text(g, 'Undo', 20 + bw / 2, by + 19, 13.5, 600, '#1d1d1f', { align: 'center', base: 'middle' });
    g.save(); g.translate(29 + bw * 1.5, by + 18); g.scale(press, press); g.fillStyle = '#0a84ff'; rr(g, -bw / 2, -18, bw, 36, 12); g.fill(); text(g, 'Apply', 0, 1, 13.5, 600, '#fff', { align: 'center', base: 'middle' }); g.restore();
  });
}

/* ───────────────────────── device ───────────────────────── */
function halfShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(0, -h); s.lineTo(w - r, -h); s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r); s.quadraticCurveTo(w, h, w - r, h); s.lineTo(0, h); s.lineTo(0, -h);
  return s;
}
function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function screenGeo(w, h, [tl, tr, br, bl]) {   // rounded rect with its own radius per corner, UVs 0..1
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + bl, y); s.lineTo(x + w - br, y); if (br) s.quadraticCurveTo(x + w, y, x + w, y + br);
  s.lineTo(x + w, y + h - tr); if (tr) s.quadraticCurveTo(x + w, y + h, x + w - tr, y + h); s.lineTo(x + tl, y + h);
  if (tl) s.quadraticCurveTo(x, y + h, x, y + h - tl); s.lineTo(x, y + bl); if (bl) s.quadraticCurveTo(x, y, x + bl, y);
  const geo = new THREE.ShapeGeometry(s, 24), p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) - x) / w, (p.getY(i) - y) / h);
  return geo;
}
function screen(w, h, corners) {
  const c = document.createElement('canvas'); c.width = Math.round(w * PXU * 2); c.height = Math.round(h * PXU * 2);
  const g = c.getContext('2d'); g.scale(2, 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, roughness: 0.14, metalness: 0, envMapIntensity: 0.4, toneMapped: false });
  const mesh = new THREE.Mesh(screenGeo(w, h, corners), mat);
  return { c, g, tex, mesh, w: w * PXU, h: h * PXU, last: -1 };
}

function buildBody() {
  const titanium = new THREE.MeshPhysicalMaterial({ color: 0xd8d4cd, metalness: 1, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.3 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x050507, roughness: 0.06, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.04 });
  const back = new THREE.MeshPhysicalMaterial({ color: 0xece8e1, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, side: THREE.DoubleSide });
  const lensGlass = new THREE.MeshPhysicalMaterial({ color: 0x0b0b12, roughness: 0.04, metalness: 0.3, clearcoat: 1, emissive: 0x2a6bff, emissiveIntensity: 0 });
  const ring = new THREE.MeshPhysicalMaterial({ color: 0xcfcbc4, metalness: 1, roughness: 0.18 });
  const ext = { depth: T, bevelEnabled: true, bevelThickness: BEV, bevelSize: BEV, bevelSegments: 6, curveSegments: 36 };
  const halfGeo = new THREE.ExtrudeGeometry(halfShape(W, H / 2, RAD), ext);
  const faceGeo = new THREE.ShapeGeometry(halfShape(W - 0.003, H / 2 - 0.003, RAD - 0.003), 36);
  const half = withBack => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(halfGeo, titanium));
    const f = new THREE.Mesh(faceGeo, glass); f.position.z = TF + 0.001; g.add(f);
    const b = new THREE.Mesh(faceGeo, withBack ? back : glass); b.position.z = -BEV - 0.001; g.add(b);
    return g;
  };
  const R = half(true);
  const plateau = new THREE.Mesh(new THREE.ExtrudeGeometry(rrect(0.34, 0.5, 0.1), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 4, curveSegments: 24 }), back);
  plateau.position.set(W - 0.26, H / 2 - 0.34, -BEV - 0.03); R.add(plateau);
  for (const [x, y] of [[W - 0.26, H / 2 - 0.2], [W - 0.26, H / 2 - 0.36], [W - 0.26, H / 2 - 0.52]]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.024, 40), ring); r.rotation.x = PI / 2; r.position.set(x, y, -BEV - 0.042); R.add(r);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.026, 40), lensGlass); l.rotation.x = PI / 2; l.position.set(x, y, -BEV - 0.044); R.add(l);
  }
  const L = half(false); L.scale.x = -1; L.position.z = -TF;
  return { R, L, lensGlass };
}

/* ───────────────────────── AR, rendered into the open screen ───────────────────────── */
function signTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 300;
  const g = c.getContext('2d');
  g.fillStyle = '#0a2a5c'; g.beginPath(); g.roundRect(40, 60, 180, 180, 46); g.fill();
  g.fillStyle = '#fff'; g.beginPath();
  g.moveTo(90, 110); g.bezierCurveTo(90, 90, 120, 88, 130, 100); g.bezierCurveTo(140, 88, 170, 90, 170, 110);
  g.bezierCurveTo(172, 150, 160, 200, 150, 200); g.bezierCurveTo(140, 200, 140, 160, 130, 160); g.bezierCurveTo(120, 160, 120, 200, 110, 200);
  g.bezierCurveTo(100, 200, 88, 150, 90, 110); g.fill();
  g.fillStyle = '#0a2a5c'; g.font = `700 96px ${FONT}`; g.fillText('Riverside', 262, 150);
  g.fillStyle = '#3a78c9'; g.font = `500 64px ${FONT}`; g.fillText('DENTAL', 266, 226);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function buildAR(renderer) {
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(52, (2 * SW) / SH, 0.05, 50);
  const tex = new THREE.TextureLoader().load(ROOM); tex.colorSpace = THREE.SRGBColorSpace;
  const feed = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 6.44), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  feed.position.z = -5; scene.add(feed);
  const anchor = new THREE.Group(); anchor.position.set(0, 0.95, -4.95); scene.add(anchor);
  const N = 260, dp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { dp[i * 3] = (Math.random() - .5) * 3.4; dp[i * 3 + 1] = (Math.random() - .5) * 2.2; }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  const dots = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0, depthWrite: false }));
  anchor.add(dots);
  const ret = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.38, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); ret.position.z = 0.01; anchor.add(ret);
  const ripple = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.33, 64), new THREE.MeshBasicMaterial({ color: 0x64d2ff, transparent: true, opacity: 0 })); ripple.position.z = 0.012; anchor.add(ripple);
  const sign = new THREE.Group(); anchor.add(sign);
  sign.add(new THREE.Mesh(new THREE.ExtrudeGeometry(rrect(3.0, 0.9, 0.16), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 5, curveSegments: 24 }),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.15, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08 })));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 0.85), new THREE.MeshBasicMaterial({ map: signTexture(), transparent: true, toneMapped: false }));
  face.position.z = 0.085; sign.add(face);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.4), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform float uA; varying vec2 vUv; void main(){ vec2 d = (vUv - .5) * vec2(1.,1.9); float a = smoothstep(.55,.1,length(d)) * .35 * uA; gl_FragColor = vec4(0.,0.,0.,a); }'
  }));
  shadow.position.set(0.05, -0.12, 0.005); anchor.add(shadow);
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(3, 2, 4); scene.add(sun);
  const hc = document.createElement('canvas'); hc.width = 1024; hc.height = 128;
  const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace;
  const hud = { last: null, draw(msg, ok) {
    const g = hc.getContext('2d'); g.clearRect(0, 0, 1024, 128);
    if (msg) { g.font = `600 38px ${FONT}`; const w = g.measureText(msg).width + (ok ? 36 : 0) + 76;
      g.fillStyle = 'rgba(28,28,30,.62)'; g.beginPath(); g.roundRect(512 - w / 2, 24, w, 80, 40); g.fill();
      g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(msg, 512 - w / 2 + 38 + (ok ? 36 : 0), 65);
      if (ok) { g.fillStyle = '#30d158'; g.beginPath(); g.arc(512 - w / 2 + 44, 64, 11, 0, 7); g.fill(); } }
    ht.needsUpdate = true; } };
  const hudScene = new THREE.Scene(), hudCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const hudMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.175 * (2 * SW) / SH), new THREE.MeshBasicMaterial({ map: ht, transparent: true, toneMapped: false }));
  hudMesh.position.y = 0.78; hudScene.add(hudMesh);
  const rt = new THREE.WebGLRenderTarget(1280, Math.round(1280 * SH / (2 * SW)), { colorSpace: THREE.SRGBColorSpace, samples: 4 });
  return { scene, cam, rt, dots, ret, ripple, sign, shadow, hud, hudScene, hudCam };
}

/* ───────────────────────── mount ───────────────────────── */
export function mount({ stage, pills, slider, still }) {
  stage.querySelector('.loading')?.remove();
  const backdrop = document.createElement('div'); backdrop.className = 'backdrop';
  const cv = document.createElement('canvas');
  const hint = document.createElement('span'); hint.className = 'duo-hint'; hint.textContent = 'Drag to turn it';
  stage.prepend(cv); stage.prepend(backdrop); stage.append(hint);

  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  const scene3 = new THREE.Scene();
  scene3.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(3, 4, 6); scene3.add(key);

  // rig: device → hinge (the left half turns about it)
  const dev = new THREE.Group(), hinge = new THREE.Group(); hinge.position.z = TF; dev.add(hinge); scene3.add(dev);
  const body = buildBody(); dev.add(body.R); hinge.add(body.L);
  const img = new Image(); img.src = IMG;
  const sL = screen(SW, SH, [SRAD, 0, 0, SRAD]), sR = screen(SW, SH, [0, SRAD, SRAD, 0]), sC = screen(CW, SH, [SRAD, SRAD, SRAD, SRAD]);
  sR.mesh.position.set(0.012 + SW / 2, 0, TF + 0.0015); dev.add(sR.mesh);
  sL.mesh.position.set(-(0.012 + SW / 2), 0, 0.0015); hinge.add(sL.mesh);
  sC.mesh.position.set(-W / 2, 0, -(T + 2 * BEV) - 0.0015); sC.mesh.rotation.y = PI; hinge.add(sC.mesh);

  // AR, shown across the open inner screens
  const ar = buildAR(renderer);
  const arPlane = new THREE.Mesh(screenGeo(2 * SW + 0.024, SH, [SRAD, SRAD, SRAD, SRAD]), new THREE.MeshBasicMaterial({ map: ar.rt.texture, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  arPlane.position.z = TF + 0.003; dev.add(arPlane);

  const size = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.position.z = w < 520 ? 8.2 : w < 760 ? 7.2 : 6.3; camera.updateProjectionMatrix();
  };
  new ResizeObserver(size).observe(stage); size();

  // pose, parallax, grab
  const cur = { ...POSE.ask }, tgt = { ...POSE.ask }, par = { x: 0, y: 0 }, grab = { x: 0, y: 0, tx: 0, ty: 0 };
  let dragging = false, lastX = 0, lastY = 0, releasedAt = 0;
  const applyPose = () => {
    dev.rotation.set(cur.rx + par.y + grab.x, cur.ry + par.x + grab.y, cur.rz, 'XYZ');
    dev.position.set(cur.px * Math.cos(cur.ry + grab.y), cur.py, 0);
    hinge.rotation.y = cur.fold;
  };
  let auto = !still, tour;
  const stopAuto = () => { auto = false; clearTimeout(tour); };
  stage.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY; stage.classList.add('dragging', 'touched');
    stage.setPointerCapture(e.pointerId); stopAuto();
  });
  stage.addEventListener('pointermove', e => {
    const b = stage.getBoundingClientRect();
    if (dragging) {
      grab.ty += (e.clientX - lastX) * 0.012; grab.tx = Math.max(-0.9, Math.min(0.9, grab.tx + (e.clientY - lastY) * 0.008));
      lastX = e.clientX; lastY = e.clientY; par.x = par.y = 0;
    } else if (e.pointerType === 'mouse') {
      par.x = ((e.clientX - b.left) / b.width - .5) * 0.2; par.y = ((e.clientY - b.top) / b.height - .5) * 0.12;
    }
  });
  const release = () => { if (!dragging) return; dragging = false; releasedAt = performance.now(); stage.classList.remove('dragging'); };
  stage.addEventListener('pointerup', release); stage.addEventListener('pointercancel', release);
  stage.addEventListener('pointerleave', () => { par.x = par.y = 0; });

  // scenes
  let scene = 'ask', t0 = performance.now(), arState = { t0: 0, on: false }, backTimer;
  const order = ['ask', 'build', 'gen', 'edit', 'ar'];
  const show = (name, user) => {
    if (user) stopAuto();
    clearTimeout(tour); clearTimeout(backTimer);
    scene = name; t0 = performance.now(); arState.on = false;
    Object.assign(tgt, POSE[name] || POSE.build);
    if (name === 'ar') {                                     // turn around: the camera lights up, then the room appears
      Object.assign(tgt, POSE.arBack);
      arState = { t0: performance.now() + 1700, on: true };
      backTimer = setTimeout(() => Object.assign(tgt, POSE.ar), 1700);
    }
    grab.tx = grab.ty = 0;
    [sL, sR, sC].forEach(s => s.last = -1);
    pills.forEach(b => { const on = b.dataset.scene === name; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    if (auto) tour = setTimeout(() => show(order[(order.indexOf(name) + 1) % order.length]), DUR[name] * 1000);
  };
  pills.forEach(b => b.addEventListener('click', e => { if (e.target === slider) return; show(b.dataset.scene, true); }));
  slider.addEventListener('input', () => {
    if (scene !== 'fold') show('fold', true);
    tgt.fold = PI * (1 - slider.value / 100); tgt.px = -0.5 * (1 - slider.value / 100);
  });
  ['pointerdown', 'click'].forEach(ev => slider.addEventListener(ev, e => e.stopPropagation()));

  // redraw a screen only while something on it moves, at most ~30 times a second
  const paint = (s, draw, live) => {
    if (s.last >= 0 && (!live || performance.now() - s.last < 33)) return;
    s.g.clearRect(0, 0, s.w, s.h); draw(s.g, s.w, s.h); s.tex.needsUpdate = true; s.last = performance.now();
  };
  const screens = t => {
    const settled = t > (DUR[scene] || 1) + 0.6;
    const tc = scene === 'ask' ? t : 99;                     // cover: the conversation, fully typed once the story moves on
    paint(sC, (g, w, h) => drawCover(g, w, h, tc), scene === 'ask');
    const inner = scene === 'fold' || scene === 'ask' ? 'build' : scene;
    const ti = scene === 'fold' || scene === 'ask' ? 99 : t, live = !settled && scene !== 'ask' && scene !== 'fold';
    if (inner === 'build') { paint(sL, (g, w, h) => drawAgent(g, w, h, ti), live); paint(sR, (g, w, h) => drawSite(g, w, h, ti, img), live); }
    else if (inner === 'gen') { paint(sL, (g, w, h) => drawGenTop(g, w, h, ti, img), live); paint(sR, (g, w, h) => drawGenBot(g, w, h, ti, img), live); }
    else if (inner === 'edit') { paint(sL, (g, w, h) => drawEditTop(g, w, h, ti, img), live); paint(sR, (g, w, h) => drawEditBot(g, w, h, ti), live); }
    else { paint(sL, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }, false); paint(sR, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }, false); }
  };

  // render loop, only while on screen
  let running = false;
  const clock = new THREE.Clock();
  const frame = () => {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.25), t = clock.elapsedTime, now = performance.now();
    const k = 1 - Math.exp(-dt * 3);
    for (const key in tgt) cur[key] += (tgt[key] - cur[key]) * k;
    if (!dragging && now - releasedAt > 2600) { grab.tx *= 1 - k * 0.6; grab.ty *= 1 - k * 0.6; }
    grab.x += (grab.tx - grab.x) * (1 - Math.exp(-dt * 10)); grab.y += (grab.ty - grab.y) * (1 - Math.exp(-dt * 10));
    applyPose();
    screens((now - t0) / 1000);

    const since = (now - arState.t0) / 1000;
    body.lensGlass.emissiveIntensity += ((arState.on && since < 0 ? 0.9 + 0.3 * Math.sin(t * 9) : 0) - body.lensGlass.emissiveIntensity) * Math.min(1, k * 2);
    arPlane.material.opacity += ((arState.on && since > -0.2 ? 1 : 0) - arPlane.material.opacity) * (1 - Math.exp(-dt * 4));
    arPlane.visible = arPlane.material.opacity > 0.01;
    if (arPlane.visible) {
      ar.cam.rotation.set(-(cur.rx + par.y + grab.x) * 0.5 + Math.sin(t * .35) * 0.01, -(cur.ry + par.x + grab.y) * 0.55 + Math.sin(t * .27) * 0.015 - 0.09, 0);
      const scan = eo((since - 0.4) / 1.2), lock = eo((since - 1.8) / 0.5), place = eo((since - 2.7) / 0.9);
      ar.dots.material.opacity = 0.75 * scan * (1 - lock);
      ar.ret.material.opacity = lock * (1 - place); ar.ret.scale.setScalar(1.3 - 0.3 * lock);
      const rp = cl((since - 2.9) / 1.1);
      ar.ripple.material.opacity = rp > 0 && rp < 1 ? (1 - rp) * 0.9 : 0; ar.ripple.scale.setScalar(1 + rp * 5);
      ar.sign.scale.setScalar(Math.max(0.001, place * (1 + 0.06 * Math.sin(place * PI))));
      ar.sign.position.z = 0.6 * (1 - place); ar.sign.visible = place > 0.001;
      ar.shadow.material.uniforms.uA.value = place;
      const msg = since < 0 ? '' : since < 1.8 ? 'Looking for a wall…' : since < 2.7 ? 'Wall found · tap to place' : 'Placed · Riverside Dental sign';
      if (msg !== ar.hud.last) { ar.hud.draw(msg, msg.startsWith('Placed')); ar.hud.last = msg; }
      renderer.setRenderTarget(ar.rt); renderer.clear(); renderer.render(ar.scene, ar.cam);
      renderer.autoClear = false; renderer.render(ar.hudScene, ar.hudCam); renderer.autoClear = true;
      renderer.setRenderTarget(null);
    }
    renderer.render(scene3, camera);
    requestAnimationFrame(frame);
  };
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) { clock.getDelta(); requestAnimationFrame(frame); if (auto) show(scene); }
    else clearTimeout(tour);
  }, { threshold: 0.15 }).observe(stage);

  const start = () => { if (still) { show('build'); Object.assign(cur, POSE.build); } else show('ask'); applyPose(); };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);
  img.onload = () => [sL, sR, sC].forEach(s => s.last = -1);
}
