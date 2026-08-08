import * as THREE from "three";
import type { Sound } from "../feel/Sound";
import type { Particles } from "../feel/Particles";

/** Ghost riders on the safe road -- the visible cost of playing it safe.
 *  The longer you go without taking a risk (no spark earned, riding flat
 *  and level instead of exploring), the more often someone else roars past
 *  and claims a reward that could have been yours. Purely atmospheric --
 *  never blocks or damages the player, just dramatizes the cost of staying
 *  still. The world doesn't lecture; it just shows you what you're missing. */
type Rival = { root: THREE.Group; x: number; speed: number; dir: 1 | -1; life: number; trailAt: number };

export class Rivals {
  items: Rival[] = [];
  safeTimer = 0;
  spawnAt = 5 + Math.random() * 4;
  pressure = 0; // ramps up the longer the player stays idle-safe, shortens the gap between rivals

  constructor(
    public scene: THREE.Scene,
    public sound: Sound,
    public particles: Particles,
    public ground: (x: number) => number,
  ) {}

  makeGhost(x: number, y: number, dir: 1 | -1) {
    const root = new THREE.Group(),
      s = dir,
      body = new THREE.Mesh(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-1 * s, 0.1, 0),
          new THREE.Vector3(0.7 * s, 0.16, 0),
          new THREE.Vector3(1 * s, 0.95, 0),
          new THREE.Vector3(-0.4 * s, 0.78, 0),
        ]),
        new THREE.MeshBasicMaterial({ color: 0x1c1e22, transparent: true, opacity: 0.55 }),
      ),
      rim = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 0.62, 16),
        new THREE.MeshBasicMaterial({ color: 0xf2c04f, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
      );
    rim.position.set(-0.5 * s, 0, 0.01);
    root.add(body, rim);
    for (const wx of [-0.85 * s, 0.85 * s]) {
      const w = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.4, 14),
        new THREE.MeshBasicMaterial({ color: 0x1c1e22, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
      );
      w.position.set(wx, -0.35, 0);
      root.add(w);
    }
    root.position.set(x, y, 1.5);
    this.scene.add(root);
    return root;
  }

  spawn(playerX: number, playerY: number) {
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1,
      x = playerX - dir * 26,
      y = this.ground(x) + 1.05,
      speed = dir * (16 + Math.random() * 6);
    this.items.push({ root: this.makeGhost(x, y, dir), x, speed, dir, life: 5, trailAt: 0 });
    this.sound.tone(dir > 0 ? 180 : 140, 0.5, 0.05);
  }

  /** dt: frame delta. atRisk: true while the player is off the safe baseline
   *  (exploring / airborne) or recently earned a spark -- resets the pressure. */
  update(dt: number, playerX: number, playerY: number, atRisk: boolean) {
    if (atRisk) {
      this.safeTimer = 0;
      this.pressure = Math.max(0, this.pressure - dt * 0.4);
    } else {
      this.safeTimer += dt;
      if (this.safeTimer > this.spawnAt) {
        this.spawn(playerX, playerY);
        this.pressure = Math.min(1, this.pressure + 0.22);
        this.safeTimer = 0;
        this.spawnAt = Math.max(2.5, 7 - this.pressure * 4) + Math.random() * 3;
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const r = this.items[i];
      r.x += r.speed * dt;
      r.life -= dt;
      const y = this.ground(r.x) + 1.05;
      r.root.position.set(r.x, y, 1.5);
      r.root.rotation.z = Math.sin(r.x * 0.3) * 0.05;
      r.trailAt += dt;
      if (r.trailAt > 0.045) {
        r.trailAt = 0;
        this.particles.emit(r.x - r.dir * 0.7, y - 0.2, 0xf2c04f, 1, 1.6);
      }
      if (r.life <= 0 || Math.abs(r.x - playerX) > 60) {
        this.scene.remove(r.root);
        this.items.splice(i, 1);
      }
    }
  }
}
