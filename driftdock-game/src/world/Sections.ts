import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";

/** The remaining milestone-5 section types, as standalone geometry in the
 *  test arena -- Course.ts's spline/loader system is milestone 6's job, so
 *  these are placed directly, same pattern as milestone 2's boost ring and
 *  milestone 4's dock: the collider/trigger IS the content, main.ts owns
 *  the per-frame trigger logic (kept there so all proximity/trigger checks
 *  live in one place rather than scattered per-section callback wiring). */

/** FlowCanyon -- banked walls forming a wide corridor with a rhythm of
 *  apexes, "teaches the racing line." Alternating tilted wall pairs, real
 *  metal-adjacent color (kept cheap/emissive rather than another PBR
 *  texture set -- this is bulk geometry, not a landmark). */
export function buildFlowCanyon(scene: THREE.Scene, physics: Physics, start: THREE.Vector3, apexes = 4, spacing = 14) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1c2433, emissive: 0x0a1220, roughness: 0.6, metalness: 0.3 }),
    wallGeo = new THREE.BoxGeometry(0.5, 8, 10);
  for (let i = 0; i < apexes; i++) {
    const z = start.z - i * spacing,
      side = i % 2 === 0 ? 1 : -1, // alternating apex side, the "rhythm"
      bank = 0.35 * side; // radians, banked lean toward the apex
    for (const wallSide of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeo, mat),
        x = start.x + wallSide * (7 + (wallSide === side ? -2 : 0)); // pinches the inside of the apex
      wall.position.set(x, 4, z);
      wall.rotation.z = bank * wallSide;
      scene.add(wall);
      const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, 4, z));
      const rot = new THREE.Quaternion().setFromEuler(wall.rotation);
      body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true);
      physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 4, 5), body);
    }
  }
}

/** FogIFR -- returns the zone descriptor; main.ts shrinks scene.fog's
 *  near/far while the drone is inside `radius` of `center` ("visibility
 *  ~5m, instrument flying between pylons"), and this also places a ring of
 *  pylons to fly between plus a gold-lit exit gate. */
export function buildFogZone(scene: THREE.Scene, physics: Physics, center: THREE.Vector3, radius = 18) {
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, emissive: 0x223344, roughness: 0.7 }),
    positions: [number, number][] = [
      [4, -6],
      [-5, -3],
      [3, 4],
      [-3, 9],
      [5, 14],
    ];
  for (const [dx, dz] of positions) {
    const x = center.x + dx,
      z = center.z + dz,
      h = 5,
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, h, 10), pylonMat);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, h / 2, z));
    physics.world.createCollider(RAPIER.ColliderDesc.cylinder(h / 2, 0.3), body);
  }
  const exitPos = new THREE.Vector3(center.x, 2.5, center.z + 20),
    gateMat = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffb020, emissiveIntensity: 2, roughness: 0.3 }),
    gate = new THREE.Mesh(new THREE.TorusGeometry(2, 0.12, 12, 32), gateMat);
  gate.position.copy(exitPos);
  scene.add(gate);
  return { center: center.clone(), radius, exitPos, gate };
}

/** DuctReverse -- a dead-end tunnel with a beacon at the far wall. Narrow
 *  enough that turning around inside it isn't realistic -- "no room to
 *  turn" is enforced by the geometry itself, not a rule main.ts checks.
 *  Returns the beacon position for main.ts's tag-on-approach trigger. */
export function buildDuctReverse(scene: THREE.Scene, physics: Physics, mouth: THREE.Vector3, depth = 12, width = 1.4) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x232a38, emissive: 0x0d1420, roughness: 0.75 }),
    height = 1.8;
  // Four walls (two sides, floor, ceiling) plus a back cap -- a real duct,
  // not just a corridor, so there's no way around narrow width.
  const pieces: [THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(width / 2 + 0.15, height / 2, -depth / 2), new THREE.Vector3(0.3, height, depth)], // right wall
    [new THREE.Vector3(-width / 2 - 0.15, height / 2, -depth / 2), new THREE.Vector3(0.3, height, depth)], // left wall
    [new THREE.Vector3(0, height + 0.15, -depth / 2), new THREE.Vector3(width + 0.3, 0.3, depth)], // ceiling
    [new THREE.Vector3(0, height / 2, -depth - 0.15), new THREE.Vector3(width + 0.3, height, 0.3)], // back cap
  ];
  for (const [offset, size] of pieces) {
    const pos = mouth.clone().add(offset),
      mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z));
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2), body);
  }
  const beaconPos = mouth.clone().add(new THREE.Vector3(0, height / 2, -depth + 0.4)),
    beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff5a5a, emissive: 0xff2020, emissiveIntensity: 2.5 }));
  beacon.position.copy(beaconPos);
  scene.add(beacon);
  return { beaconPos, beacon, mouth: mouth.clone() };
}

/** Repair pad -- "brief hover to fix" one lost rotor. Visual-only (no
 *  physical collider; it's a hover zone, not a landing surface, so the
 *  drone doesn't need to physically rest on anything). */
export function buildRepairPad(scene: THREE.Scene, position: THREE.Vector3, radius = 1.5) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3dd68c, emissive: 0x1f8f5a, emissiveIntensity: 1.3, transparent: true, opacity: 0.55 }),
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 24), mat);
  mesh.position.copy(position);
  scene.add(mesh);
  return { position: position.clone(), radius, mesh, mat };
}

/** Checkpoint -- a passthrough ring; crossing it updates the crash-respawn
 *  point. Visual-only, same reasoning as boost ring: distance/plane-cross
 *  check in main.ts rather than a Rapier sensor event. */
export function buildCheckpoint(scene: THREE.Scene, position: THREE.Vector3, radius = 2.2) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x4fd6ff, emissive: 0x2a8fb0, emissiveIntensity: 1.2, roughness: 0.4 }),
    mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.08, 12, 32), mat);
  mesh.position.copy(position);
  scene.add(mesh);
  return { position: position.clone(), radius, mesh };
}
