import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import { dockMaterials } from "./Environment";
import { Autopilot } from "../drone/Autopilot";
import { T } from "../drone/Tuning";
import type { Drone } from "../drone/Drone";
import type { Sound } from "../core/Sound";

/** Moon Base mode: a resource-gathering + base-building loop, alongside
 *  (not replacing) the Trial/Daily racing modes -- same drone, same
 *  physics, same arena, different objective. Placed east of the existing
 *  content (x 30-60, z 5-40) so nothing overlaps the courses. Playable
 *  manually or handed to the Autopilot (press V to toggle), which runs a
 *  real SEEK -> MINE -> SEEK -> DELIVER loop through the same flight
 *  controller a human pilot uses. */

const BASE_POS = new THREE.Vector3(45, 0, 20);
const RESOURCE_POSITIONS: THREE.Vector3[] = [
  new THREE.Vector3(35, 0, 8),
  new THREE.Vector3(52, 0, 6),
  new THREE.Vector3(58, 0, 22),
  new THREE.Vector3(48, 0, 36),
  new THREE.Vector3(32, 0, 28),
  new THREE.Vector3(40, 0, 14),
];
const MODULE_TIERS = [2, 4, 6]; // delivered-count thresholds that unlock habitat / solar / storage

type ResourceNode = { position: THREE.Vector3; mined: boolean; mesh: THREE.Group; light: THREE.MeshBasicMaterial };

function buildResourceNode(scene: THREE.Scene, position: THREE.Vector3): ResourceNode {
  const group = new THREE.Group(),
    crystalMat = new THREE.MeshStandardMaterial({ color: 0x6fe8d8, emissive: 0x1f8f80, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.2 });
  for (let i = 0; i < 4; i++) {
    const h = 0.4 + Math.random() * 0.5,
      shard = new THREE.Mesh(new THREE.ConeGeometry(0.13 + Math.random() * 0.08, h, 6), crystalMat);
    shard.position.set((Math.random() - 0.5) * 0.4, h / 2, (Math.random() - 0.5) * 0.4);
    shard.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
    group.add(shard);
  }
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x6fe8d8, transparent: true, opacity: 0.35 }),
    glow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  group.add(glow);
  group.position.copy(position);
  scene.add(group);
  return { position: position.clone(), mined: false, mesh: group, light: glowMat };
}

function buildBaseModules(scene: THREE.Scene, position: THREE.Vector3) {
  const { panelMat, trimMat } = dockMaterials(),
    pad = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.3, 0.3, 20), panelMat);
  pad.position.copy(position);
  scene.add(pad);

  const modules: THREE.Object3D[] = [];
  const habitat = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.8, 16), panelMat);
  habitat.position.copy(position).add(new THREE.Vector3(-2.2, 1.05, 0));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.1 }));
  dome.position.copy(habitat.position).add(new THREE.Vector3(0, 0.9, 0));
  modules.push(habitat, dome);

  const solarPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8), trimMat);
  solarPost.position.copy(position).add(new THREE.Vector3(2.4, 0.7, -1));
  const solarPanel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.4), new THREE.MeshStandardMaterial({ color: 0x1a2a4a, emissive: 0x0a1530, roughness: 0.3, metalness: 0.6 }));
  solarPanel.position.copy(solarPost.position).add(new THREE.Vector3(0, 0.75, 0));
  solarPanel.rotation.x = -0.3;
  modules.push(solarPost, solarPanel);

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 14), panelMat);
  tank.position.copy(position).add(new THREE.Vector3(1.8, 1.1, 2.2));
  modules.push(tank);

  for (const m of modules) {
    m.visible = false;
    scene.add(m);
  }
  return modules; // [habitat, dome, solarPost, solarPanel, tank] -- grouped by MODULE_TIERS below
}

export type AutopilotPhase = "OFF" | "SEEK_RESOURCE" | "MINE" | "SEEK_BASE" | "DELIVER";

export class MoonBaseState {
  carried = 0;
  delivered = 0;
  aiEngaged = false;
  aiPhase: AutopilotPhase = "OFF";
  private nodes: ResourceNode[];
  private modules: THREE.Object3D[];
  private mineHoldTimer = 0;
  private autopilot = new Autopilot();
  private aiHoldTimer = 0;

  constructor(scene: THREE.Scene, physics: Physics) {
    this.nodes = RESOURCE_POSITIONS.map((p) => buildResourceNode(scene, p));
    this.modules = buildBaseModules(scene, BASE_POS);
    // Base pad collider so it's a real physical surface, not just visual.
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(BASE_POS.x, 0, BASE_POS.z));
    physics.world.createCollider(RAPIER.ColliderDesc.cylinder(0.15, 4), body);
  }

  toggleAI() {
    this.aiEngaged = !this.aiEngaged;
    this.aiPhase = this.aiEngaged ? "SEEK_RESOURCE" : "OFF";
    this.aiHoldTimer = 0;
  }

  get totalResources() {
    return this.nodes.length;
  }

  /** Manual + AI share the same mine/deliver detection -- proximity+hover,
   *  identical to how the repair pad works, regardless of who's flying.
   *  Returns an autopilot command when AI is engaged and racing/flying, or
   *  null (manual control, or nothing to do). */
  update(dt: number, dronePos: THREE.Vector3, droneVel: THREE.Vector3, droneQuat: THREE.Quaternion, drone: Drone, sound: Sound, hoverThrottle: number) {
    const speed = droneVel.length();

    // --- mining: hover near an unmined node ---
    let nearNode: ResourceNode | null = null;
    for (const n of this.nodes) if (!n.mined && dronePos.distanceTo(n.position) < T.resourceMineRadius) nearNode = n;
    if (nearNode && speed < 2 && this.carried < T.resourceCarryCapacity) {
      this.mineHoldTimer += dt;
      nearNode.light.opacity = 0.35 + Math.min(1, this.mineHoldTimer / T.resourceMineHoldTime) * 0.5;
      if (this.mineHoldTimer >= T.resourceMineHoldTime) {
        nearNode.mined = true;
        nearNode.mesh.visible = false;
        this.carried++;
        this.mineHoldTimer = 0;
        sound.repairChime();
      }
    } else this.mineHoldTimer = 0;

    // --- delivery: proximity to the base pad ---
    if (this.carried > 0 && dronePos.distanceTo(BASE_POS) < T.baseDeliverRadius) {
      this.delivered += this.carried;
      this.carried = 0;
      sound.dockChime();
      MODULE_TIERS.forEach((threshold, i) => {
        if (this.delivered >= threshold) {
          if (i === 0) this.modules[0].visible = this.modules[1].visible = true;
          if (i === 1) this.modules[2].visible = this.modules[3].visible = true;
          if (i === 2) this.modules[4].visible = true;
        }
      });
    }

    if (!this.aiEngaged) return null;
    return this.runAutopilot(dt, dronePos, droneVel, droneQuat, hoverThrottle);
  }

  private runAutopilot(dt: number, dronePos: THREE.Vector3, droneVel: THREE.Vector3, droneQuat: THREE.Quaternion, hoverThrottle: number) {
    if (this.aiPhase === "MINE" || this.aiPhase === "DELIVER") {
      this.aiHoldTimer += dt;
      const holdDone = this.aiHoldTimer >= T.autopilotMineHoldTime;
      if (this.aiPhase === "MINE" && (holdDone || this.carried >= T.resourceCarryCapacity)) {
        this.aiPhase = this.carried >= T.resourceCarryCapacity || !this.nextUnminedNode() ? "SEEK_BASE" : "SEEK_RESOURCE";
        this.aiHoldTimer = 0;
      } else if (this.aiPhase === "DELIVER" && holdDone) {
        this.aiPhase = this.nextUnminedNode() ? "SEEK_RESOURCE" : "OFF";
        this.aiHoldTimer = 0;
      }
      // Hold position (hover in place) during MINE/DELIVER -- target IS
      // the current spot, so the PD controller just fights drift.
      return this.autopilot.computeCommand(dronePos, dronePos, droneVel, droneQuat, hoverThrottle);
    }

    const target = this.aiPhase === "SEEK_BASE" ? BASE_POS.clone().add(new THREE.Vector3(0, T.autopilotHoverHeight, 0)) : this.aiTargetNode();
    if (!target) {
      this.aiPhase = "OFF";
      this.aiEngaged = false;
      return null;
    }
    if (this.autopilot.hasArrived(target, dronePos, droneVel)) {
      this.aiPhase = this.aiPhase === "SEEK_BASE" ? "DELIVER" : "MINE";
      this.aiHoldTimer = 0;
    }
    return this.autopilot.computeCommand(target, dronePos, droneVel, droneQuat, hoverThrottle);
  }

  private nextUnminedNode(): ResourceNode | undefined {
    return this.nodes.find((n) => !n.mined);
  }

  private aiTargetNode(): THREE.Vector3 | null {
    const n = this.nextUnminedNode();
    return n ? n.position.clone().add(new THREE.Vector3(0, T.autopilotHoverHeight, 0)) : null;
  }
}
