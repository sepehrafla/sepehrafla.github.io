import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import { buildBaseModules, MODULE_TIERS, type BaseModules } from "./BaseModules";
import { buildResourceField, buildBoulders, type ResourceNode } from "./ResourceField";
import { Autopilot } from "../drone/Autopilot";
import { T } from "../drone/Tuning";
import type { Drone } from "../drone/Drone";
import type { Sound } from "../core/Sound";

const BASE_POS = new THREE.Vector3(0, 0, 0);
const TIER_NAMES = ["Habitat Module", "Solar Array + Comms", "Storage Tank", "Perimeter Lighting", "Vehicle Bay"];

export type AutopilotPhase = "OFF" | "SCAN" | "SEEK_RESOURCE" | "MINE" | "SEEK_BASE" | "DELIVER";
export type NarrationEntry = { text: string; t: number };

/** The whole game, now: gather resources, build the base, manually or with
 *  the AI autopilot doing the whole loop hands-off. The AI's behavior is
 *  deliberately made VISIBLE, not just numerically correct -- a scan-ring
 *  pulse while it's picking a target, a dashed beacon line to wherever
 *  it's currently headed, the targeted node's beacon brightening, and a
 *  narration log of what it just decided and why. */
export class MoonBaseState {
  carried = 0;
  delivered = 0;
  aiEngaged = false;
  aiPhase: AutopilotPhase = "OFF";
  targetNodeIndex = -1;
  narration: NarrationEntry[] = [];

  private nodes: ResourceNode[];
  private modules: BaseModules;
  private mineHoldTimer = 0;
  private autopilot = new Autopilot();
  private aiHoldTimer = 0;
  private scanTimer = 0;
  private unlockedTier = -1;
  private beaconLine: THREE.Line;
  private scanRing: THREE.Mesh;

  constructor(scene: THREE.Scene, physics: Physics) {
    this.nodes = buildResourceField(scene);
    buildBoulders(scene);
    this.modules = buildBaseModules(scene, BASE_POS);
    this.modules.blueprints[0].visible = true; // preview the first locked tier immediately

    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(BASE_POS.x, 0, BASE_POS.z));
    physics.world.createCollider(RAPIER.ColliderDesc.cylinder(0.15, 5), body);

    // The visual ground (Environment.ts's buildGround(), an 800x800 plane at
    // y=0) had NO matching collider anywhere except this 5m pad -- reported
    // as "press the down arrow and it goes below the surface": land/descend
    // literally anywhere off the pad (i.e. almost the entire visible
    // ground) and there was nothing to stop the drone, so it fell straight
    // through the regolith with zero resistance. One large flat collider
    // under the whole play area fixes it everywhere at once, not just near
    // the base.
    const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.1, 400), groundBody);

    this.beaconLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0x6fe8d8, dashSize: 0.6, gapSize: 0.35, transparent: true, opacity: 0.7 }),
    );
    this.beaconLine.visible = false;
    scene.add(this.beaconLine);

    this.scanRing = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 1.9, 32),
      new THREE.MeshBasicMaterial({ color: 0x6fe8d8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
    );
    this.scanRing.rotation.x = -Math.PI / 2;
    this.scanRing.visible = false;
    scene.add(this.scanRing);

    this.narrate("Systems idle. Press V to engage the AI.");
  }

  get totalResources() {
    return this.nodes.length;
  }
  get finalTarget() {
    return MODULE_TIERS[MODULE_TIERS.length - 1];
  }

  toggleAI() {
    this.aiEngaged = !this.aiEngaged;
    if (this.aiEngaged) {
      this.aiPhase = "SCAN";
      this.aiHoldTimer = 0;
      this.narrate("AI engaged -- scanning for resources...");
    } else {
      this.aiPhase = "OFF";
      this.beaconLine.visible = false;
      this.scanRing.visible = false;
      this.narrate("AI disengaged. Manual control.");
    }
  }

  update(dt: number, dronePos: THREE.Vector3, droneVel: THREE.Vector3, droneQuat: THREE.Quaternion, drone: Drone, sound: Sound, hoverThrottle: number) {
    const speed = droneVel.length();

    // --- mining: hover near an unmined node (works for manual OR AI flight
    // -- both drive the same real physics body, so this needs no branch).
    // Horizontal (XZ) distance + a height band, NOT full 3D distance --
    // the same bug class caught and fixed in milestone 5's repair pad:
    // the AI cruises at T.autopilotHoverHeight (2.5m) above a node sitting
    // at y=0, so a naive 3D-distance check against T.resourceMineRadius
    // (1.6m) can NEVER be satisfied at that altitude -- verified live via
    // a full Rapier-physics run: the AI arrived, "mined" for its own
    // internal timeout, never actually triggered real mining, and looped
    // re-targeting the same node forever. ---
    let nearIdx = -1;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.mined) continue;
      const dx = dronePos.x - n.position.x,
        dz = dronePos.z - n.position.z,
        height = dronePos.y - n.position.y;
      if (Math.hypot(dx, dz) < T.resourceMineRadius && height > -0.3 && height < 3) nearIdx = i;
    }
    if (nearIdx !== -1 && speed < 2 && this.carried < T.resourceCarryCapacity) {
      this.mineHoldTimer += dt;
      const n = this.nodes[nearIdx];
      n.glowMat.opacity = 0.35 + Math.min(1, this.mineHoldTimer / T.resourceMineHoldTime) * 0.5;
      if (this.mineHoldTimer >= T.resourceMineHoldTime) {
        n.mined = true;
        n.mesh.visible = false;
        this.carried = Math.min(T.resourceCarryCapacity, this.carried + (n.rare ? 2 : 1));
        this.mineHoldTimer = 0;
        sound.repairChime();
        this.narrate(`Mined ${n.rare ? "a rare " : "a "}crystal -- carrying ${this.carried}/${T.resourceCarryCapacity}`);
      }
    } else this.mineHoldTimer = 0;

    // --- delivery: proximity to the base pad ---
    if (this.carried > 0 && dronePos.distanceTo(BASE_POS) < T.baseDeliverRadius) {
      this.delivered += this.carried;
      this.narrate(`Delivered ${this.carried} -- base at ${this.delivered}/${this.finalTarget}`);
      this.carried = 0;
      sound.dockChime();
      this.checkTierUnlocks();
    }

    if (!this.aiEngaged) return null;
    return this.runAutopilot(dt, dronePos, droneVel, droneQuat, hoverThrottle);
  }

  private checkTierUnlocks() {
    MODULE_TIERS.forEach((threshold, i) => {
      if (this.delivered >= threshold && this.unlockedTier < i) {
        this.unlockedTier = i;
        this.modules.tiers[i].forEach((m) => (m.visible = true));
        this.modules.blueprints[i].visible = false;
        if (this.modules.blueprints[i + 1]) this.modules.blueprints[i + 1].visible = true;
        this.narrate(`${TIER_NAMES[i]} online!`);
      }
    });
  }

  private nextUnminedNodeIndex(): number {
    return this.nodes.findIndex((n) => !n.mined);
  }

  private updateBeacon(from: THREE.Vector3, to: THREE.Vector3) {
    const pos = new Float32Array([from.x, from.y, from.z, to.x, to.y, to.z]);
    this.beaconLine.geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.beaconLine.geometry.attributes.position.needsUpdate = true;
    this.beaconLine.computeLineDistances();
  }

  private runAutopilot(dt: number, dronePos: THREE.Vector3, droneVel: THREE.Vector3, droneQuat: THREE.Quaternion, hoverThrottle: number) {
    this.scanRing.visible = this.aiPhase === "SCAN";
    if (this.scanRing.visible) {
      this.scanRing.position.set(dronePos.x, 0.05, dronePos.z);
      this.scanTimer += dt;
      this.scanRing.scale.setScalar(1 + Math.sin(this.scanTimer * 3) * 0.2);
    }

    if (this.aiPhase === "SCAN") {
      this.beaconLine.visible = false;
      this.aiHoldTimer += dt;
      if (this.aiHoldTimer > 0.8) {
        const idx = this.nextUnminedNodeIndex();
        if (idx === -1) {
          this.aiPhase = "OFF";
          this.aiEngaged = false;
          this.narrate("All resources gathered -- AI standing down.");
          return null;
        }
        if (this.targetNodeIndex !== -1) this.nodes[this.targetNodeIndex].beaconMat.opacity = 0.12;
        this.targetNodeIndex = idx;
        this.nodes[idx].beaconMat.opacity = 0.8;
        this.aiPhase = "SEEK_RESOURCE";
        this.aiHoldTimer = 0;
        const n = this.nodes[idx];
        this.narrate(`Target locked: ${n.rare ? "rare " : ""}node ${idx + 1} (${Math.round(dronePos.distanceTo(n.position))}m away)`);
      }
      return this.autopilot.computeCommand(dronePos, dronePos, droneVel, droneQuat, hoverThrottle);
    }

    if (this.aiPhase === "MINE" || this.aiPhase === "DELIVER") {
      this.beaconLine.visible = false;
      this.aiHoldTimer += dt;
      const holdDone = this.aiHoldTimer >= T.autopilotMineHoldTime;
      if (this.aiPhase === "MINE" && (holdDone || this.carried >= T.resourceCarryCapacity)) {
        if (this.targetNodeIndex !== -1) this.nodes[this.targetNodeIndex].beaconMat.opacity = 0.12;
        const goBase = this.carried >= T.resourceCarryCapacity || this.nextUnminedNodeIndex() === -1;
        this.aiPhase = goBase ? "SEEK_BASE" : "SCAN";
        this.aiHoldTimer = 0;
        if (goBase) this.narrate("Cargo full -- returning to base.");
      } else if (this.aiPhase === "DELIVER" && holdDone) {
        this.aiPhase = this.nextUnminedNodeIndex() !== -1 ? "SCAN" : "OFF";
        if (this.aiPhase === "OFF") {
          this.aiEngaged = false;
          this.narrate("All resources gathered -- AI standing down.");
        }
        this.aiHoldTimer = 0;
      }
      return this.autopilot.computeCommand(dronePos, dronePos, droneVel, droneQuat, hoverThrottle);
    }

    const target =
      this.aiPhase === "SEEK_BASE"
        ? BASE_POS.clone().add(new THREE.Vector3(0, T.autopilotHoverHeight, 0))
        : this.targetNodeIndex !== -1
          ? this.nodes[this.targetNodeIndex].position.clone().add(new THREE.Vector3(0, T.autopilotHoverHeight, 0))
          : null;
    if (!target) {
      this.aiPhase = "SCAN";
      this.aiHoldTimer = 0;
      return this.autopilot.computeCommand(dronePos, dronePos, droneVel, droneQuat, hoverThrottle);
    }

    this.beaconLine.visible = true;
    this.updateBeacon(dronePos, target);

    if (this.autopilot.hasArrived(target, dronePos, droneVel)) {
      if (this.aiPhase === "SEEK_BASE") {
        this.aiPhase = "DELIVER";
        this.narrate("Arrived at base -- delivering cargo.");
      } else {
        this.aiPhase = "MINE";
        this.narrate("Arrived at node -- mining.");
      }
      this.aiHoldTimer = 0;
    }
    return this.autopilot.computeCommand(target, dronePos, droneVel, droneQuat, hoverThrottle);
  }

  private narrate(text: string) {
    this.narration.unshift({ text, t: performance.now() });
    if (this.narration.length > 5) this.narration.length = 5;
  }
}
