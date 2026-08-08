import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import type { Input } from "../core/Input";
import { FlightModel } from "./FlightModel";
import { buildDroneMesh } from "./DroneArt";
import { T } from "./Tuning";

/** One dynamic rigid body, a procedural quadcopter frame whose LED rings =
 *  per-motor thrust and whose props actually spin. No joints, no ragdoll,
 *  per the brief. */
export class Drone {
  body: RAPIER.RigidBody;
  mesh: THREE.Group;
  private ledMats: THREE.MeshBasicMaterial[] = [];
  private propMeshes: THREE.Mesh[] = [];
  private propSpin = [0, 0, 0, 0];
  flight = new FlightModel();
  motorThrust = [0, 0, 0, 0];

  constructor(public scene: THREE.Scene, public physics: Physics, public input: Input, spawn = new THREE.Vector3(0, 2, 0)) {
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setLinearDamping(T.linearDamping)
        .setAngularDamping(T.angularDamping)
        .setCcdEnabled(true),
    );
    physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.12, 0.05, 0.12).setDensity(T.mass / (0.24 * 0.1 * 0.24)).setFriction(0.6).setRestitution(0.05),
      this.body,
    );
    this.mesh = this.buildMesh();
    scene.add(this.mesh);
    physics.add(this.body, this.mesh);
  }

  private buildMesh() {
    const { group, ledMats, propMeshes } = buildDroneMesh();
    this.ledMats = ledMats;
    this.propMeshes = propMeshes;
    return group;
  }

  /** Fixed-step update, 120Hz. */
  fixed(dt: number) {
    const quat = new THREE.Quaternion(this.body.rotation().x, this.body.rotation().y, this.body.rotation().z, this.body.rotation().w),
      av = this.body.angvel(),
      angvel = new THREE.Vector3(av.x, av.y, av.z),
      { force, torque, motorThrust } = this.flight.step(
        quat,
        angvel,
        this.input.pitch,
        this.input.roll,
        this.input.yaw,
        this.input.throttle,
        dt,
      );
    this.motorThrust = motorThrust;
    // body.addForce()/addTorque() (the continuous-force APIs) proved to
    // apply roughly 100-600x too much velocity change per step in this
    // Rapier build -- verified in isolation with gravity zeroed: a raw
    // addForce({y:9.81}) on a mass=1 body for one 1/120s step (expected
    // Δv~0.0817) instead gave Δv~98.7, while body.applyImpulse() on the
    // same body gave the textbook-exact Δv=impulse/mass. Rather than
    // depend on a continuous-force API that's demonstrably wrong here,
    // convert to the impulse for this step myself (impulse = force*dt,
    // exactly equivalent for a fixed timestep) and apply that instead.
    this.body.applyImpulse({ x: force.x * dt, y: force.y * dt, z: force.z * dt }, true);
    this.body.applyTorqueImpulse({ x: torque.x * dt, y: torque.y * dt, z: torque.z * dt }, true);
    for (let i = 0; i < 4; i++) {
      const level = motorThrust[i] / T.maxThrustPerMotor;
      this.ledMats[i].opacity = 0.25 + level * 0.75;
      // Visual-only prop spin, purely cosmetic -- ambient information about
      // the player's own thrust state, per the brief's art direction.
      this.propSpin[i] += (8 + level * 70) * dt;
      this.propMeshes[i].rotation.y = this.propSpin[i];
    }
  }

  position() {
    return this.body.translation();
  }

  velocity() {
    return this.body.linvel();
  }
}
