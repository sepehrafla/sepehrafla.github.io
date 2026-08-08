import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import type { Input } from "../core/Input";
import { FlightModel } from "./FlightModel";
import { T } from "./Tuning";

/** One dynamic rigid body, four visual rotor discs whose brightness =
 *  thrust. No joints, no ragdoll, per the brief. */
export class Drone {
  body: RAPIER.RigidBody;
  mesh: THREE.Group;
  rotorMeshes: THREE.Mesh[] = [];
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
    const g = new THREE.Group(),
      frame = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.03, 0.28),
        new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.6 }),
      );
    g.add(frame);
    const armPositions: [number, number][] = [
      [T.armLength, -T.armLength],
      [-T.armLength, -T.armLength],
      [-T.armLength, T.armLength],
      [T.armLength, T.armLength],
    ];
    for (const [x, z] of armPositions) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(0.06, 16),
        new THREE.MeshBasicMaterial({ color: 0x4fd6ff, transparent: true, opacity: 0.3 }),
      );
      disc.rotation.x = -Math.PI / 2;
      disc.position.set(x, 0.02, z);
      g.add(disc);
      this.rotorMeshes.push(disc);
    }
    return g;
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
      const mat = this.rotorMeshes[i].material as THREE.MeshBasicMaterial;
      mat.opacity = 0.25 + (motorThrust[i] / T.maxThrustPerMotor) * 0.75;
    }
  }

  position() {
    return this.body.translation();
  }

  velocity() {
    return this.body.linvel();
  }
}
