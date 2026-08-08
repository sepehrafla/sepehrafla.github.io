import * as THREE from "three";

/** Ghost recording/playback + a compact binary encoding for the brief's
 *  "downloadable ghost = compressed keyframe file others can load via URL
 *  fragment... no backend, ever." Fixed sample interval (no per-sample
 *  timestamp needed) + fixed-point Int16 quantization keeps a full 90s run
 *  well under a URL's practical length limit: ~150ms interval * 90s = 600
 *  samples * 8 bytes/sample (3x pos + 4x quat, Int16 each) = 4.8KB raw,
 *  ~6.4KB base64 -- long, but URLs comfortably hold tens of KB in every
 *  modern browser, and this is deliberately generous precision headroom,
 *  not a tuned-down minimum. */
const SAMPLE_INTERVAL = 0.15; // s
const POS_SCALE = 100; // fixed-point: 1 unit = 1cm, +-327m range
const QUAT_SCALE = 32767; // fixed-point: quaternion components are always in [-1,1]

export type GhostSample = { pos: THREE.Vector3; quat: THREE.Quaternion };

/** Records drone pose at a fixed real-time interval during a run. */
export class GhostRecorder {
  private samples: GhostSample[] = [];
  private sinceLast = 0;

  reset() {
    this.samples = [];
    this.sinceLast = 0;
  }

  /** Call every physics/render step with the elapsed dt and current pose. */
  tick(dt: number, pos: THREE.Vector3, quat: THREE.Quaternion) {
    this.sinceLast += dt;
    if (this.sinceLast < SAMPLE_INTERVAL) return;
    this.sinceLast = 0;
    this.samples.push({ pos: pos.clone(), quat: quat.clone() });
  }

  encode(): string {
    return encodeGhost(this.samples);
  }

  /** Read-only snapshot for Results.ts's top-down path drawing -- called
   *  right before reset() on finish, so the just-completed run's samples
   *  don't disappear before the results screen can use them. */
  samplesSnapshot(): GhostSample[] {
    return this.samples.slice();
  }
}

/** Plays back recorded samples, interpolating between the two bracketing
 *  the current elapsed time so ghost motion stays smooth despite the
 *  coarse (150ms) sample rate. */
export class GhostPlayer {
  constructor(private samples: GhostSample[]) {}

  static fromEncoded(encoded: string): GhostPlayer | null {
    const samples = decodeGhost(encoded);
    return samples ? new GhostPlayer(samples) : null;
  }

  /** Returns the interpolated pose at `elapsed` seconds into the run, or
   *  null once the ghost has finished (elapsed past its last sample). */
  poseAt(elapsed: number): GhostSample | null {
    if (this.samples.length < 2) return null;
    const idx = elapsed / SAMPLE_INTERVAL,
      i = Math.floor(idx);
    if (i < 0) return this.samples[0];
    if (i >= this.samples.length - 1) return null;
    const a = this.samples[i],
      b = this.samples[i + 1],
      t = idx - i,
      pos = new THREE.Vector3().lerpVectors(a.pos, b.pos, t),
      quat = new THREE.Quaternion().slerpQuaternions(a.quat, b.quat, t);
    return { pos, quat };
  }
}

function encodeGhost(samples: GhostSample[]): string {
  const buf = new Int16Array(samples.length * 7);
  samples.forEach((s, i) => {
    const o = i * 7;
    buf[o] = Math.round(s.pos.x * POS_SCALE);
    buf[o + 1] = Math.round(s.pos.y * POS_SCALE);
    buf[o + 2] = Math.round(s.pos.z * POS_SCALE);
    buf[o + 3] = Math.round(s.quat.x * QUAT_SCALE);
    buf[o + 4] = Math.round(s.quat.y * QUAT_SCALE);
    buf[o + 5] = Math.round(s.quat.z * QUAT_SCALE);
    buf[o + 6] = Math.round(s.quat.w * QUAT_SCALE);
  });
  const bytes = new Uint8Array(buf.buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // URL-fragment-safe base64 (fragments technically allow standard base64
  // chars too, but +/= can confuse naive URL-copying/paste flows -- swap
  // to the URL-safe alphabet and strip padding, same trick JWTs use).
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeGhost(encoded: string): GhostSample[] | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/"),
      binary = atob(b64),
      bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.length % 14 !== 0) return null; // 7 Int16s * 2 bytes = 14 bytes/sample
    const buf = new Int16Array(bytes.buffer),
      samples: GhostSample[] = [];
    for (let i = 0; i < buf.length; i += 7) {
      samples.push({
        pos: new THREE.Vector3(buf[i] / POS_SCALE, buf[i + 1] / POS_SCALE, buf[i + 2] / POS_SCALE),
        quat: new THREE.Quaternion(buf[i + 3] / QUAT_SCALE, buf[i + 4] / QUAT_SCALE, buf[i + 5] / QUAT_SCALE, buf[i + 6] / QUAT_SCALE),
      });
    }
    return samples.length >= 2 ? samples : null;
  } catch {
    return null; // malformed/tampered fragment -- fail closed, no ghost rather than a crash
  }
}
