import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import { T } from "../drone/Tuning";
import { dockMaterials } from "./Environment";

const DOCK_CLEARANCE = 0.45; // m above the pad's physical top surface (0.15 half-height) -- see the ring-position comment below

/** "Charging pad on a patrolling platform" per the brief -- a kinematic
 *  Rapier body so the drone can physically rest on it, sine-patrolling
 *  along one horizontal axis. Kinematic bodies don't report a meaningful
 *  linvel() from setNextKinematicTranslation, so velocity is derived here
 *  from the position delta each physics step -- Gates.ts's closure-rate
 *  math needs the pad's real velocity, not zero, or docking mid-patrol
 *  would always read as a fast, illegal closure. */
export class MovingDock {
  body: RAPIER.RigidBody;
  mesh: THREE.Group;
  velocity = new THREE.Vector3();
  private center: THREE.Vector3;
  private prevPos: THREE.Vector3;
  private t = 0;

  constructor(physics: Physics, scene: THREE.Scene, center: THREE.Vector3) {
    this.center = center.clone();
    this.prevPos = center.clone();
    this.body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(center.x, center.y, center.z));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.15, 1), this.body);

    const { panelMat, trimMat } = dockMaterials();
    this.mesh = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 2), panelMat);
    this.mesh.add(pad);
    // Docking-point marker -- a glowing ring the pilot aligns the crosshair
    // over, hovering well clear of the pad's physical collider (0.15 half-
    // height). Verified live: putting this at 0.2 (barely clearing the
    // deck) let a drone snapped to the exact dock point interpenetrate the
    // platform collider and blow up to NaN on the very next physics step --
    // real docking approaches would hit the same margin eventually, so the
    // dock POINT needs real clearance above the physical surface, not just
    // a hair's breadth.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 10, 28), new THREE.MeshStandardMaterial({ color: 0x4fd6ff, emissive: 0x2fa8d8, emissiveIntensity: 1.4, roughness: 0.4 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = DOCK_CLEARANCE;
    this.mesh.add(ring);
    for (const x of [-0.9, 0.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), trimMat);
      post.position.set(x, 0.45, 0.9);
      this.mesh.add(post);
    }
    scene.add(this.mesh);
    this.mesh.position.copy(center);
  }

  /** The point the drone should actually align to -- the ring, not the pad
   *  center, and slightly above the deck so "docked" means hovering at the
   *  marker, not buried in the platform. */
  dockPoint() {
    return this.mesh.position.clone().add(new THREE.Vector3(0, DOCK_CLEARANCE, 0));
  }

  /** Call once per fixed physics step. */
  fixed(dt: number) {
    this.t += dt;
    const x = this.center.x + Math.sin((this.t / T.dockPatrolPeriod) * Math.PI * 2) * T.dockPatrolRadius,
      pos = new THREE.Vector3(x, this.center.y, this.center.z);
    this.body.setNextKinematicTranslation(pos);
    this.velocity.subVectors(pos, this.prevPos).divideScalar(dt);
    this.prevPos.copy(pos);
    this.mesh.position.copy(pos);
  }
}
