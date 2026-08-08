import * as THREE from "three";
import type { Drone } from "../drone/Drone";

/** Hard-mounted to the body -- tilt-coupled by construction: whatever the
 *  airframe does, the horizon does. No smoothing, no lag. Per the brief:
 *  "Do not soften this on any tier." */
export class FPVCamera {
  camera: THREE.PerspectiveCamera;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(100, aspect, 0.05, 500);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(drone: Drone) {
    const p = drone.mesh.position,
      q = drone.mesh.quaternion,
      mountOffset = new THREE.Vector3(0, 0.03, -0.02).applyQuaternion(q);
    this.camera.position.copy(p).add(mountOffset);
    this.camera.quaternion.copy(q);
  }
}
