import * as THREE from "three";

/** Resource nodes scattered around the base in a wide ring (real gathering
 *  distances, not everything clustered at your feet), plus non-mineable
 *  boulder decoration for surface detail -- "a lot more detail" without
 *  needing real terrain relief (the ground stays a flat collider; boulders
 *  are visual-only, cheap). Two crystal colors purely for visual variety
 *  and a small value difference, not a new mechanic to learn. */
export type ResourceNode = {
  position: THREE.Vector3;
  mined: boolean;
  rare: boolean;
  mesh: THREE.Group;
  glowMat: THREE.MeshBasicMaterial;
  beaconMat: THREE.MeshBasicMaterial;
};

const NODE_COUNT = 10;
const FIELD_RADIUS_MIN = 14;
const FIELD_RADIUS_MAX = 42;

/** Deterministic scatter (not random per load) -- a fixed golden-angle
 *  spiral gives an even, natural-looking spread without needing a seeded
 *  RNG dependency for what's now a single fixed field, not a daily one. */
function scatterPositions(count: number): THREE.Vector3[] {
  const golden = Math.PI * (3 - Math.sqrt(5)),
    positions: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1),
      r = FIELD_RADIUS_MIN + t * (FIELD_RADIUS_MAX - FIELD_RADIUS_MIN),
      a = i * golden;
    positions.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  return positions;
}

function buildNode(scene: THREE.Scene, position: THREE.Vector3, rare: boolean): ResourceNode {
  const color = rare ? 0xd9a6ff : 0x6fe8d8,
    emissive = rare ? 0x6a2f9f : 0x1f8f80,
    group = new THREE.Group(),
    crystalMat = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 1.6, roughness: 0.25, metalness: 0.2 });
  for (let i = 0; i < 5; i++) {
    const h = 0.4 + Math.random() * 0.6,
      shard = new THREE.Mesh(new THREE.ConeGeometry(0.13 + Math.random() * 0.09, h, 6), crystalMat);
    shard.position.set((Math.random() - 0.5) * 0.45, h / 2, (Math.random() - 0.5) * 0.45);
    shard.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
    group.add(shard);
  }
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }),
    glow = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  group.add(glow);

  // A vertical beacon column, dim by default, brightened by MoonBase.ts
  // when the AI locks onto this node -- visible from across the field, so
  // "which node is the AI going for" reads at a glance, not just up close.
  const beaconMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12 }),
    beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 8, 6, 1, true), beaconMat);
  beacon.position.y = 4;
  group.add(beacon);

  group.position.copy(position);
  scene.add(group);
  return { position: position.clone(), mined: false, rare, mesh: group, glowMat, beaconMat };
}

export function buildResourceField(scene: THREE.Scene): ResourceNode[] {
  return scatterPositions(NODE_COUNT).map((p, i) => buildNode(scene, p, i % 3 === 0));
}

/** Purely decorative boulders -- no collider, no interaction. Scattered on
 *  a different golden-angle offset so they don't line up with the nodes. */
export function buildBoulders(scene: THREE.Scene, count = 40) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a746a, roughness: 0.95, metalness: 0.05 }),
    golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const t = i / count,
      r = 8 + t * 70,
      a = i * golden + 1.3,
      size = 0.2 + Math.random() * 0.7,
      rock = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), mat);
    rock.position.set(Math.cos(a) * r, size * 0.35, Math.sin(a) * r);
    rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    rock.scale.y *= 0.6 + Math.random() * 0.3;
    scene.add(rock);
  }
}
