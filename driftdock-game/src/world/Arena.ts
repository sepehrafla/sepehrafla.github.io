import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import { buildFlowCanyon, buildFogZone, buildDuctReverse, buildRepairPad, buildCheckpoint } from "./Sections";

/** All the test-arena's static content in one place -- ground collider,
 *  pylons, SlotThread, boost ring, and the milestone-5 sections. Course.ts
 *  (milestone 6) replaces this with a real spline loader; until then, this
 *  IS the course, same single-arena approach milestones 1-4 already used.
 *  Positions are chosen to avoid overlap: pylons/boost/slot sit within
 *  roughly x in [-15,10], z in [-20,25]; FlowCanyon continues further down
 *  -Z (apex range z -40..-68), FogZone further still (z -82..-118),
 *  DuctReverse off to the side on +X where nothing else is placed. */
export function buildArena(scene: THREE.Scene, physics: Physics) {
  const groundBody = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(RAPIER.ColliderDesc.cuboid(400, 0.1, 400).setTranslation(0, -0.1, 0), groundBody);

  const pylonMat = new THREE.MeshStandardMaterial({ color: 0xff8a3d, emissive: 0x552200, roughness: 0.5 }),
    pylonPositions: [number, number][] = [
      [10, 0],
      [10, -8],
      [-6, 12],
      [0, 25],
      [-15, 5],
    ];
  for (const [x, z] of pylonPositions) {
    const h = 4,
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 12), pylonMat);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, h / 2, z));
    physics.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.3), body);
  }

  // SlotThread: two wall segments barely wider than the drone -- the
  // collider IS the challenge, pose-gate scoring is a later milestone.
  const slotCenter = new THREE.Vector3(-8, 2, -20),
    slotGap = 0.9, // drone frame is ~0.3m across the diagonal; this is tight but flyable
    wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3040, emissive: 0x0d1622, roughness: 0.7 });
  for (const side of [-1, 1]) {
    const w = 3,
      mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 4, 0.4), wallMat);
    mesh.position.set(slotCenter.x + side * (slotGap / 2 + w / 2), slotCenter.y, slotCenter.z);
    scene.add(mesh);
    const body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(mesh.position.x, mesh.position.y, mesh.position.z),
    );
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, 2, 0.2), body);
  }

  // Boost ring: flying through gives a forward velocity surge.
  const boostCenter = new THREE.Vector3(10, 3, -8),
    boostRadius = 1.6,
    boostRingMat = new THREE.MeshStandardMaterial({
      color: 0xffd24a,
      emissive: 0xffb020,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.4,
    }),
    boostRing = new THREE.Mesh(new THREE.TorusGeometry(boostRadius, 0.09, 12, 32), boostRingMat);
  boostRing.position.copy(boostCenter);
  scene.add(boostRing);

  buildFlowCanyon(scene, physics, new THREE.Vector3(0, 0, -40), 3, 14);
  const fogZone = buildFogZone(scene, physics, new THREE.Vector3(0, 0, -100)),
    duct = buildDuctReverse(scene, physics, new THREE.Vector3(22, 0, 0)),
    repairPad = buildRepairPad(scene, new THREE.Vector3(6, 0.03, 20)),
    checkpoint = buildCheckpoint(scene, new THREE.Vector3(0, 2, 6)); // waypoint between spawn and the MovingDock

  return { pylonPositions, boostCenter, boostRadius, boostRing, boostRingMat, fogZone, duct, repairPad, checkpoint };
}

export type Arena = ReturnType<typeof buildArena>;
