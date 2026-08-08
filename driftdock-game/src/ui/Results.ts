import * as THREE from "three";
import type { CourseDef, Medal } from "../world/Course";
import type { GhostSample } from "../replay/Ghost";

/** "Results PNG: top-down course map, your line (colored by speed),
 *  copilot's proposed line, divergence highlights, docks hit, medal.
 *  2160px offscreen render, download + Web Share." All top-down (X/Z
 *  plane) since altitude doesn't matter for "which way did you fly." */
export type ResultsData = {
  course: CourseDef;
  medal: Medal;
  time: number;
  syncPercent: number;
  divergences: number;
  playerSamples: GhostSample[]; // from GhostRecorder.samplesSnapshot(), before reset
  copilotLine: THREE.Vector3[] | null; // null if the copilot was never accepted/unlocked
  divergencePoints: THREE.Vector3[];
};

const SIZE = 2160;
const MEDAL_COLOR: Record<Medal, string> = { GOLD: "#ffd24a", SILVER: "#d8e2ea", BRONZE: "#d99a5b", NONE: "#8fa0b3" };

export async function generateResultsPNG(data: ResultsData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#0b0e14";
  ctx.fillRect(0, 0, SIZE, SIZE);
  paintGrain(ctx); // "keep the paper-grain overlay habit -- it unifies everything"

  const pad = 220,
    allXZ = [
      ...data.course.gates.map((g) => g.pos),
      ...data.playerSamples.map((s) => s.pos),
      ...(data.copilotLine ?? []),
    ],
    minX = Math.min(...allXZ.map((p) => p.x)),
    maxX = Math.max(...allXZ.map((p) => p.x)),
    minZ = Math.min(...allXZ.map((p) => p.z)),
    maxZ = Math.max(...allXZ.map((p) => p.z)),
    scale = Math.min((SIZE - pad * 2) / Math.max(1, maxX - minX), (SIZE - pad * 2) / Math.max(1, maxZ - minZ)),
    toScreen = (p: THREE.Vector3): [number, number] => [pad + (p.x - minX) * scale, pad + (p.z - minZ) * scale];

  // Copilot's proposed line -- thin, dim, drawn first so the player's own
  // line (drawn on top, brighter) reads as the main focus.
  if (data.copilotLine && data.copilotLine.length > 1) {
    ctx.strokeStyle = "rgba(255,210,74,0.45)";
    ctx.lineWidth = 5;
    ctx.setLineDash([14, 10]);
    strokePath(ctx, data.copilotLine.map(toScreen));
    ctx.setLineDash([]);
  }

  // Gates as rings, sized to their real tolerance radius.
  ctx.strokeStyle = "rgba(79,214,255,0.55)";
  ctx.lineWidth = 4;
  for (const gate of data.course.gates) {
    const [x, y] = toScreen(gate.pos);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(10, gate.radius * scale), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Player's own line, colored by speed (dim blue -> hot orange), computed
  // from consecutive sample deltas since GhostRecorder stores pose only.
  for (let i = 1; i < data.playerSamples.length; i++) {
    const a = data.playerSamples[i - 1],
      b = data.playerSamples[i],
      dist = a.pos.distanceTo(b.pos),
      speed = dist / 0.15, // fixed GhostRecorder sample interval
      t = THREE.MathUtils.clamp(speed / 22, 0, 1),
      [x1, y1] = toScreen(a.pos),
      [x2, y2] = toScreen(b.pos);
    ctx.strokeStyle = speedColor(t);
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Divergence highlights -- red rings where the player left the copilot line.
  for (const p of data.divergencePoints) {
    const [x, y] = toScreen(p);
    ctx.strokeStyle = "#ff6b6b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, 42, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Header: medal, course name, time, sync.
  ctx.textBaseline = "top";
  ctx.fillStyle = MEDAL_COLOR[data.medal];
  ctx.font = "700 120px ui-monospace, monospace";
  ctx.fillText(data.medal, pad, 60);
  ctx.fillStyle = "#eaf2ff";
  ctx.font = "44px ui-monospace, monospace";
  ctx.fillText(`${data.course.name}  ·  ${formatTime(data.time)}`, pad, 210);
  if (data.copilotLine) {
    ctx.fillStyle = "#ffd24a";
    ctx.font = "36px ui-monospace, monospace";
    ctx.fillText(`copilot sync ${data.syncPercent.toFixed(0)}%  ·  ${data.divergences} divergence${data.divergences === 1 ? "" : "s"}`, pad, 268);
  }
  ctx.fillStyle = "rgba(234,242,255,.4)";
  ctx.font = "28px ui-monospace, monospace";
  ctx.fillText("DRIFT/DOCK", pad, SIZE - 70);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png"));
}

/** Download, and Web Share when available (mobile-friendly) -- "download
 *  + Web Share" per the brief, no backend either way. */
export async function shareOrDownloadResults(data: ResultsData, filename: string) {
  const blob = await generateResultsPNG(data),
    file = new File([blob], filename, { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "DRIFT/DOCK results" });
      return;
    } catch {
      // user cancelled the share sheet, or it failed -- fall through to a
      // direct download rather than leaving them with nothing
    }
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function strokePath(ctx: CanvasRenderingContext2D, points: [number, number][]) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.stroke();
}

function speedColor(t: number) {
  const r = Math.round(THREE.MathUtils.lerp(79, 255, t)),
    g = Math.round(THREE.MathUtils.lerp(214, 138, t)),
    b = Math.round(THREE.MathUtils.lerp(255, 61, t));
  return `rgb(${r},${g},${b})`;
}

function paintGrain(ctx: CanvasRenderingContext2D) {
  // A small noise tile upscaled with nearest-neighbor (blocky, not
  // interpolated) rather than perturbing all ~4.6M pixels independently --
  // the naive per-pixel version made every pixel unique and defeated PNG's
  // compression almost entirely (~5MB for a mostly-flat background;
  // verified directly by generating one). Large repeated blocks compress
  // far better while still reading as grain at this viewing size.
  const tile = 180,
    off = document.createElement("canvas");
  off.width = off.height = tile;
  const octx = off.getContext("2d")!,
    d = octx.createImageData(tile, tile);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = 128 + (Math.random() - 0.5) * 10;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = n;
    d.data[i + 3] = 14;
  }
  octx.putImageData(d, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(off, 0, 0, SIZE, SIZE);
  ctx.globalCompositeOperation = "source-over";
  ctx.imageSmoothingEnabled = true;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60),
    sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}
