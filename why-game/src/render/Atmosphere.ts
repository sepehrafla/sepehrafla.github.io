import * as THREE from "three";
import { mulberry32 } from "../core/Seed";

type ParallaxLayer = { object: THREE.Object3D; factor: number };

/** Neon, low-poly scenery built from instanced primitives. Everything follows
 * mathematical parallax; only the bike and terrain enter Rapier. */
export class Atmosphere {
  root = new THREE.Group();
  layers: ParallaxLayer[] = [];
  sun = new THREE.Group();
  private origin = 0;

  constructor(scene: THREE.Scene, seed: number) {
    const random = mulberry32(seed ^ 0x71a9);

    const sunCore = new THREE.Mesh(
      new THREE.CircleGeometry(6.4, 48),
      new THREE.MeshBasicMaterial({ color: 0xff715f, toneMapped: false }),
    );
    const sunHalo = new THREE.Mesh(
      new THREE.RingGeometry(6.5, 8.4, 48),
      new THREE.MeshBasicMaterial({ color: 0xff4fa3, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.sun.add(sunHalo, sunCore);
    this.sun.position.set(10, 9, -9.35);
    this.root.add(this.sun);

    const ridgeColors = [0x28104b, 0x35105d, 0x47146d];
    for (let layer = 0; layer < 3; layer++) {
      const geometry = new THREE.ConeGeometry(6 + layer * 2.7, 12 + layer * 3, 5);
      const material = new THREE.MeshStandardMaterial({
        color: ridgeColors[layer], roughness: 0.96, metalness: 0.02,
        flatShading: true, depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, 20);
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < 20; i++) {
        const scale = 0.65 + random() * 0.85;
        matrix.compose(
          new THREE.Vector3((i - 7) * 14 + random() * 5, -3 + layer * 1.6, -8.8 + layer * 0.45),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (random() - 0.5) * 0.12)),
          new THREE.Vector3(scale, scale, 1),
        );
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.layers.push({ object: mesh, factor: 0.78 + layer * 0.055 });
      this.root.add(mesh);
    }

    const buildings = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x170b31, roughness: 0.8, flatShading: true }),
      42,
    );
    const buildingMatrix = new THREE.Matrix4();
    for (let i = 0; i < 42; i++) {
      const height = 1.6 + random() * 4.8;
      buildingMatrix.compose(
        new THREE.Vector3((i - 10) * 4.4 + random() * 1.5, -1.7 + height * 0.5, -5.7),
        new THREE.Quaternion(),
        new THREE.Vector3(1.4 + random() * 1.5, height, 1),
      );
      buildings.setMatrixAt(i, buildingMatrix);
    }
    buildings.instanceMatrix.needsUpdate = true;
    this.layers.push({ object: buildings, factor: 0.9 });
    this.root.add(buildings);

    const palms = new THREE.Group();
    const trunks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.28, 3.6, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x110824, roughness: 1 }),
      18,
    );
    const crowns = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1.35, 0),
      new THREE.MeshStandardMaterial({ color: 0x1d0a38, roughness: 0.9, flatShading: true }),
      18,
    );
    const trunkMatrix = new THREE.Matrix4(), crownMatrix = new THREE.Matrix4();
    for (let i = 0; i < 18; i++) {
      const x = (i - 5) * 12 + 6 + random() * 3, height = 0.75 + random() * 0.4;
      trunkMatrix.compose(new THREE.Vector3(x, 0.4, -3.8), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (random() - 0.5) * 0.15)), new THREE.Vector3(1, height, 1));
      crownMatrix.compose(new THREE.Vector3(x, 2.9 * height, -3.75), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (random() - 0.5) * 0.45)), new THREE.Vector3(1.08, 0.46, 1));
      trunks.setMatrixAt(i, trunkMatrix); crowns.setMatrixAt(i, crownMatrix);
    }
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
    palms.add(trunks, crowns);
    this.layers.push({ object: palms, factor: 0.95 });
    this.root.add(palms);
    scene.add(this.root);
  }

  update(playerX: number, time: number) {
    this.origin += (playerX - this.origin) * 0.025;
    this.sun.position.x = playerX + 10 + Math.sin(time * 0.08) * 0.4;
    this.layers.forEach(({ object, factor }) => { object.position.x = this.origin * factor; });
  }
}
