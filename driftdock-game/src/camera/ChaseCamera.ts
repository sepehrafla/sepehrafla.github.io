import * as THREE from "three";
import type { Drone } from "../drone/Drone";

/** Third-person chase camera -- trails behind and above the drone, always
 *  looking at it. Added because FPV-only left players with no way to judge
 *  altitude/distance to the pad or a resource node from outside the
 *  cockpit (reported directly: "is different camera angle available?").
 *  Smoothed (unlike FPVCamera's hard mount, which is deliberately
 *  un-smoothed per the brief's "do not soften this on any tier") since a
 *  chase view's whole job is comfortable spatial judgment, the opposite
 *  goal from FPV's "feel every twitch." Frame-rate-independent
 *  exponential smoothing (`1 - k^dt`, not a flat lerp factor) so the feel
 *  doesn't change with framerate. */
export class ChaseCamera {
  camera: THREE.PerspectiveCamera;
  private smoothedPos = new THREE.Vector3();
  private smoothedTarget = new THREE.Vector3();
  private initialized = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.05, 500);
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(drone: Drone, dt: number) {
    const p = drone.mesh.position,
      q = drone.mesh.quaternion,
      // Local +Z is "behind" the drone (FlightModel's forward is -Z), so
      // this trails the tail regardless of heading.
      back = new THREE.Vector3(0, 0, 1).applyQuaternion(q),
      desired = p.clone().add(back.multiplyScalar(2.4)).add(new THREE.Vector3(0, 1.0, 0));
    if (!this.initialized) {
      this.smoothedPos.copy(desired);
      this.smoothedTarget.copy(p);
      this.initialized = true;
    }
    const posLerp = 1 - Math.pow(0.001, dt),
      targetLerp = 1 - Math.pow(0.0005, dt);
    this.smoothedPos.lerp(desired, posLerp);
    this.smoothedTarget.lerp(p, targetLerp);
    this.camera.position.copy(this.smoothedPos);
    this.camera.lookAt(this.smoothedTarget);
  }
}
