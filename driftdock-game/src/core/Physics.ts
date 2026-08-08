import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { T } from "../drone/Tuning";

type Sync = {
  body: RAPIER.RigidBody;
  mesh: THREE.Object3D;
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currRot: THREE.Quaternion;
};

/** 120Hz fixed-step accumulator, exactly the same shape as the 2D project's
 *  Physics.ts (why-game/CENTAUR) but syncing a full quaternion instead of a
 *  single rotation.z. */
export class Physics {
  world: RAPIER.World;
  events: RAPIER.EventQueue;
  acc = 0;
  syncs: Sync[] = [];
  contact?: (force: number, a: RAPIER.Collider, b: RAPIER.Collider) => void;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = T.step;
    this.events = new RAPIER.EventQueue(true);
  }

  static async create() {
    await RAPIER.init();
    return new Physics();
  }

  add(body: RAPIER.RigidBody, mesh: THREE.Object3D) {
    const p = body.translation(),
      r = body.rotation(),
      s: Sync = {
        body,
        mesh,
        prevPos: new THREE.Vector3(p.x, p.y, p.z),
        currPos: new THREE.Vector3(p.x, p.y, p.z),
        prevRot: new THREE.Quaternion(r.x, r.y, r.z, r.w),
        currRot: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      };
    this.syncs.push(s);
    this.interpolate(s, 1);
  }

  remove(body: RAPIER.RigidBody) {
    this.syncs = this.syncs.filter((s) => s.body !== body);
    this.world.removeRigidBody(body);
  }

  step(dt: number, before: (step: number) => void, after: (step: number) => void) {
    this.acc = Math.min(0.2, this.acc + dt);
    while (this.acc >= T.step) {
      before(T.step);
      for (const s of this.syncs) {
        s.prevPos.copy(s.currPos);
        s.prevRot.copy(s.currRot);
      }
      this.world.step(this.events);
      this.events.drainContactForceEvents((e) => {
        const a = this.world.getCollider(e.collider1()),
          b = this.world.getCollider(e.collider2());
        if (a && b) this.contact?.(e.totalForceMagnitude(), a, b);
      });
      for (const s of this.syncs) {
        const p = s.body.translation(),
          r = s.body.rotation();
        s.currPos.set(p.x, p.y, p.z);
        s.currRot.set(r.x, r.y, r.z, r.w);
      }
      after(T.step);
      this.acc -= T.step;
    }
    const alpha = this.acc / T.step;
    for (const s of this.syncs) this.interpolate(s, alpha);
  }

  interpolate(s: Sync, a: number) {
    s.mesh.position.lerpVectors(s.prevPos, s.currPos, a);
    s.mesh.quaternion.slerpQuaternions(s.prevRot, s.currRot, a);
  }
}
export { RAPIER };
