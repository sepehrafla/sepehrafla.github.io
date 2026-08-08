import * as THREE from "three";
import type { Arena } from "./Arena";
import type { Drone } from "../drone/Drone";
import type { Sound } from "../core/Sound";
import { T } from "../drone/Tuning";

/** Per-frame proximity/trigger logic for everything in Arena.ts: boost
 *  ring, geiger ticker, repair pad, checkpoint, DuctReverse beacon, FogIFR
 *  zone. Distance/plane checks each frame rather than Rapier sensor events,
 *  same reasoning as the boost ring always used: simpler and more
 *  predictable given this session's track record with this Rapier build's
 *  less-common APIs. One instance, `update()` once per render frame. */
export class WorldTriggers {
  lastCheckpointPos: THREE.Vector3;
  private boostCooldown = 0;
  private lastSideOfBoost = 1; // +1/-1, which side of the boost ring's plane the drone is on
  private tickTimer = 0;
  private repairHoldTimer = 0;
  private ductTagged = false;

  constructor(private arena: Arena, private scene: THREE.Scene, spawn: THREE.Vector3) {
    this.lastCheckpointPos = spawn.clone();
  }

  resetForRestart(spawn: THREE.Vector3) {
    this.lastCheckpointPos.copy(spawn);
    this.arena.checkpoint.mesh.userData.hit = false;
  }

  update(dt: number, dronePos: THREE.Vector3, droneVel: THREE.Vector3, drone: Drone, sound: Sound) {
    const a = this.arena;

    // --- boost ring ---
    this.boostCooldown = Math.max(0, this.boostCooldown - dt);
    const toBoost = dronePos.clone().sub(a.boostCenter),
      sideNow = Math.sign(toBoost.z) || 1,
      radialDist = Math.hypot(toBoost.x, toBoost.y);
    if (sideNow !== this.lastSideOfBoost && radialDist < a.boostRadius && this.boostCooldown <= 0) {
      const dir = droneVel.clone();
      if (dir.lengthSq() > 0.01) dir.normalize();
      else dir.set(0, 0, -1);
      drone.body.applyImpulse({ x: dir.x * 8, y: dir.y * 8, z: dir.z * 8 }, true);
      this.boostCooldown = 1.2;
      sound.boost();
      a.boostRingMat.emissiveIntensity = 3.2;
    }
    this.lastSideOfBoost = sideNow;
    a.boostRingMat.emissiveIntensity += (1.6 - a.boostRingMat.emissiveIntensity) * Math.min(1, dt * 4);
    a.boostRing.rotation.z += dt * 0.4;

    // --- geiger proximity ticker: nearest pylon or boost-ring rim ---
    let nearest = Infinity;
    for (const [x, z] of a.pylonPositions) nearest = Math.min(nearest, Math.hypot(dronePos.x - x, dronePos.z - z) - 0.3);
    nearest = Math.min(nearest, radialDist > a.boostRadius ? Infinity : Math.abs(toBoost.z));
    if (nearest < 4) {
      this.tickTimer -= dt;
      if (this.tickTimer <= 0) {
        sound.tick(0.05 + (1 - nearest / 4) * 0.15);
        this.tickTimer = 0.05 + (nearest / 4) * 0.4;
      }
    }

    // --- repair pad: brief hover inside restores one lost rotor. Horizontal
    // (XZ) distance + a separate height band -- a naive 3D-distance check
    // against the pad's radius would make this nearly impossible to
    // trigger at a real hover altitude (verified: pad sits at y~0.03, so a
    // drone hovering at a realistic y~1.5-2 already spends almost the
    // entire radius budget on vertical distance alone, leaving well under
    // half a meter of horizontal slack -- basically "graze the ground
    // exactly over the pad," not "hover over the pad"). ---
    const speed = droneVel.length(),
      padDx = dronePos.x - a.repairPad.position.x,
      padDz = dronePos.z - a.repairPad.position.z,
      padHorizDist = Math.hypot(padDx, padDz),
      padHeight = dronePos.y - a.repairPad.position.y,
      overRepairPad = padHorizDist < a.repairPad.radius && padHeight > -0.3 && padHeight < 2.5 && speed < 2;
    if (overRepairPad && drone.damage.aliveCount() < 4) {
      this.repairHoldTimer += dt;
      a.repairPad.mat.emissiveIntensity = 1.3 + Math.min(1, this.repairHoldTimer / T.repairHoldTime) * 1.5;
      if (this.repairHoldTimer >= T.repairHoldTime) {
        drone.damage.repairOne();
        sound.repairChime();
        this.repairHoldTimer = 0;
      }
    } else {
      this.repairHoldTimer = 0;
      a.repairPad.mat.emissiveIntensity = 1.3;
    }

    // --- checkpoint: crossing updates the crash-respawn point ---
    if (dronePos.distanceTo(a.checkpoint.position) < a.checkpoint.radius && !a.checkpoint.mesh.userData.hit) {
      a.checkpoint.mesh.userData.hit = true;
      this.lastCheckpointPos.copy(dronePos);
      sound.checkpoint();
    }

    // --- DuctReverse: tag the beacon at the dead end. No enforcement of
    // "must back out" -- the tunnel geometry itself makes turning around
    // impractical, per the brief; this just confirms the tag. ---
    if (!this.ductTagged && dronePos.distanceTo(a.duct.beaconPos) < 0.6) {
      this.ductTagged = true;
      sound.checkpoint();
      (a.duct.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = 6;
    }

    // --- FogIFR: tighten scene.fog near/far while inside the zone --
    // "visibility ~5m... this is IFR flying." Lerps back out smoothly at
    // the boundary rather than snapping, so the transition itself doesn't
    // read as a bug. ---
    const distToFog = dronePos.distanceTo(a.fogZone.center),
      inFog = THREE.MathUtils.clamp(1 - (distToFog - a.fogZone.radius) / 8, 0, 1),
      fog = this.scene.fog as THREE.Fog;
    fog.near = THREE.MathUtils.lerp(30, 1.5, inFog);
    fog.far = THREE.MathUtils.lerp(220, 6, inFog);
  }
}
