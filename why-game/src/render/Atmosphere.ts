import * as THREE from "three";
import { mulberry32 } from "../core/Seed";

function paperTexture() {
  const size = 256, canvas = document.createElement("canvas"), ctx = canvas.getContext("2d")!;
  canvas.width = canvas.height = size;
  ctx.fillStyle = "#d9d7d0";
  ctx.fillRect(0, 0, size, size);
  const image = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const grain = (Math.random() - 0.5) * 18;
    image.data[i] += grain; image.data[i + 1] += grain; image.data[i + 2] += grain;
  }
  ctx.putImageData(image, 0, 0);
  ctx.globalAlpha = 0.055;
  for (let i = 0; i < 120; i++) {
    ctx.strokeStyle = i % 2 ? "#fff" : "#34363b";
    ctx.beginPath();
    ctx.moveTo(Math.random() * size, Math.random() * size);
    ctx.lineTo(Math.random() * size, Math.random() * size);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Decorative scenery follows cheap mathematical parallax only; none of it
 * enters the physics world. Repeated shapes are packed into InstancedMesh. */
export class Atmosphere {
  root = new THREE.Group();
  paper: THREE.Mesh;
  ridges: THREE.InstancedMesh[] = [];
  clouds: THREE.InstancedMesh;
  private origin = 0;

  constructor(scene: THREE.Scene, seed: number) {
    const paper = paperTexture();
    this.paper = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 72),
      new THREE.MeshBasicMaterial({ map: paper, transparent: true, opacity: 0.2, depthWrite: false }),
    );
    this.paper.position.set(0, 7, -9.7);
    this.root.add(this.paper);
    const random = mulberry32(seed ^ 0x71a9);
    const palettes = [0x70867e, 0x84918b, 0xa3aaa4];
    for (let layer = 0; layer < 3; layer++) {
      const geometry = new THREE.ConeGeometry(6 + layer * 2.5, 11 + layer * 3, 5);
      const material = new THREE.MeshStandardMaterial({
        color: palettes[layer], roughness: 1, metalness: 0, transparent: true,
        opacity: 0.2 - layer * 0.035, flatShading: true, depthWrite: false,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, 18);
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < 18; i++) {
        const scale = 0.65 + random() * 0.8;
        matrix.compose(
          new THREE.Vector3((i - 6) * 15 + random() * 5, -4 + layer * 1.7, -8 + layer),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, (random() - 0.5) * 0.12)),
          new THREE.Vector3(scale, scale, 1),
        );
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.ridges.push(mesh); this.root.add(mesh);
    }
    const cloudGeo = new THREE.CircleGeometry(1, 16);
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, depthWrite: false });
    this.clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 28);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 28; i++) {
      matrix.compose(new THREE.Vector3((i - 8) * 9 + random() * 4, 7 + random() * 8, -7.5), new THREE.Quaternion(), new THREE.Vector3(2 + random() * 3.5, 0.6 + random(), 1));
      this.clouds.setMatrixAt(i, matrix);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
    this.root.add(this.clouds);
    scene.add(this.root);
  }

  update(playerX: number, time: number) {
    this.origin += (playerX - this.origin) * 0.025;
    this.paper.position.x = playerX;
    this.ridges.forEach((mesh, i) => { mesh.position.x = this.origin * (0.84 + i * 0.045); });
    this.clouds.position.x = this.origin * 0.91 + Math.sin(time * 0.025) * 3;
  }
}
