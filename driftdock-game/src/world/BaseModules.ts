import * as THREE from "three";
import { dockMaterials } from "./Environment";

/** The moon base structure: a landing pad plus five progressively-unlocked
 *  tiers (habitat, solar+comms, storage, perimeter lighting, vehicle bay).
 *  Each tier's modules stay hidden until enough resources are delivered;
 *  the NEXT locked tier shows as a translucent wireframe "blueprint" that
 *  fills in solid once unlocked -- makes visible progress toward the goal,
 *  not just a HUD number. */
export const MODULE_TIERS = [2, 4, 6, 8, 10]; // delivered-count thresholds

export type BaseModules = {
  tiers: THREE.Object3D[][]; // tiers[i] = the real (solid) meshes for tier i
  blueprints: THREE.Object3D[]; // blueprints[i] = the wireframe preview for tier i, shown while locked
};

export function buildBaseModules(scene: THREE.Scene, position: THREE.Vector3): BaseModules {
  const { panelMat, trimMat } = dockMaterials(),
    blueprintMat = new THREE.MeshBasicMaterial({ color: 0x6fe8d8, wireframe: true, transparent: true, opacity: 0.35 });

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.3, 24), panelMat);
  pad.position.copy(position);
  scene.add(pad);
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
  beacon.position.copy(position).add(new THREE.Vector3(0, 1.5, 0));
  scene.add(beacon);

  const tierGeo = [
    // Tier 0: habitat dome
    () => {
      const habitat = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.8, 16), panelMat);
      habitat.position.copy(position).add(new THREE.Vector3(-2.6, 1.05, 0));
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.55, roughness: 0.15, metalness: 0.1 }),
      );
      dome.position.copy(habitat.position).add(new THREE.Vector3(0, 0.9, 0));
      return [habitat, dome];
    },
    // Tier 1: solar array + comms antenna
    () => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8), trimMat);
      post.position.copy(position).add(new THREE.Vector3(2.8, 0.7, -1.4));
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.06, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x1a2a4a, emissive: 0x0a1530, roughness: 0.3, metalness: 0.6 }),
      );
      panel.position.copy(post.position).add(new THREE.Vector3(0, 0.75, 0));
      panel.rotation.x = -0.3;
      const antennaPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6), trimMat);
      antennaPost.position.copy(position).add(new THREE.Vector3(2.2, 1.1, 1.6));
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(0.35, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.4, metalness: 0.5, side: THREE.DoubleSide }),
      );
      dish.rotation.x = Math.PI * 0.7;
      dish.position.copy(antennaPost.position).add(new THREE.Vector3(0, 1.1, 0));
      return [post, panel, antennaPost, dish];
    },
    // Tier 2: storage tank
    () => {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 2.2, 14), panelMat);
      tank.position.copy(position).add(new THREE.Vector3(2.2, 1.1, 2.6));
      return [tank];
    },
    // Tier 3: perimeter lighting
    () => {
      const lamps: THREE.Object3D[] = [];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2,
          post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6), trimMat),
          bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
        post.position.copy(position).add(new THREE.Vector3(Math.cos(a) * 6.5, 0.8, Math.sin(a) * 6.5));
        bulb.position.copy(post.position).add(new THREE.Vector3(0, 0.85, 0));
        lamps.push(post, bulb);
      }
      return lamps;
    },
    // Tier 4: vehicle bay -- the same real weathered-metal hangar silhouette
    // used earlier in this project, repurposed here as the base's garage.
    () => {
      const group = new THREE.Group();
      const wallGeo = new THREE.BoxGeometry(0.4, 3, 4);
      for (const side of [-1, 1]) {
        const wall = new THREE.Mesh(wallGeo, panelMat);
        wall.position.set(side * 2.2, 1.5, 0);
        group.add(wall);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 4), panelMat);
      roof.position.set(0, 3, 0);
      group.add(roof);
      group.position.copy(position).add(new THREE.Vector3(-2.6, 0, -5.5));
      return [group];
    },
  ];

  const tiers: THREE.Object3D[][] = [],
    blueprints: THREE.Object3D[] = [];
  for (const build of tierGeo) {
    const solids = build();
    solids.forEach((m) => (m.visible = false));
    solids.forEach((m) => scene.add(m));
    tiers.push(solids);

    // A wireframe ghost of the same shapes, cheap re-use via cloned
    // geometry with the blueprint material instead of a second art pass.
    const bp = new THREE.Group();
    solids.forEach((m) => {
      m.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const ghost = new THREE.Mesh(o.geometry, blueprintMat);
          ghost.position.copy(o.getWorldPosition(new THREE.Vector3()));
          ghost.quaternion.copy(o.getWorldQuaternion(new THREE.Quaternion()));
          bp.add(ghost);
        }
      });
    });
    bp.visible = false;
    scene.add(bp);
    blueprints.push(bp);
  }

  return { tiers, blueprints };
}
