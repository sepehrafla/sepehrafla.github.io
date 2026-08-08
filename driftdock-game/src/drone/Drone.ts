import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import type { Input } from "../core/Input";
import { FlightModel } from "./FlightModel";
import { buildDroneMesh } from "./DroneArt";
import { T } from "./Tuning";
import { nextAssist, type AssistMode } from "./Assists";
import { Damage } from "./Damage";

/** One dynamic rigid body, a procedural quadcopter frame whose LED rings =
 *  per-motor thrust and whose props actually spin. No joints, no ragdoll,
 *  per the brief. */
export class Drone {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Group;
  private ledMats: THREE.MeshBasicMaterial[] = [];
  private propMeshes: THREE.Mesh[] = [];
  private propSpin = [0, 0, 0, 0];
  flight = new FlightModel();
  motorThrust = [0, 0, 0, 0];
  assist: AssistMode = "OFF"; // milestone 3 -- cycled externally via input.consumeCycleAssist()
  damage = new Damage(); // milestone 5

  constructor(public scene: THREE.Scene, public physics: Physics, public input: Input, spawn = new THREE.Vector3(0, 2, 0)) {
    this.body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setLinearDamping(T.linearDamping)
        .setAngularDamping(T.angularDamping)
        .setCcdEnabled(true),
    );
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.12, 0.05, 0.12)
        .setDensity(T.mass / (0.24 * 0.1 * 0.24))
        .setFriction(0.6)
        .setRestitution(0.05)
        // Milestone 5 damage needs real per-contact force numbers -- Rapier
        // only generates these for colliders that opt in, and only above
        // the threshold set here (matches T.damageForceThreshold exactly,
        // so main.ts's contact handler never has to re-filter).
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(T.damageForceThreshold),
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
    if (this.input.consumeCycleAssist()) this.assist = nextAssist(this.assist);
    this.damage.tick(dt);
    const quat = new THREE.Quaternion(this.body.rotation().x, this.body.rotation().y, this.body.rotation().z, this.body.rotation().w),
      av = this.body.angvel(),
      angvel = new THREE.Vector3(av.x, av.y, av.z),
      lv = this.body.linvel(),
      linvel = new THREE.Vector3(lv.x, lv.y, lv.z),
      agl = this.body.translation().y, // ground is flat at y=0 in this arena
      { force, torque, motorThrust } = this.flight.step(
        quat,
        angvel,
        linvel,
        this.input.pitch,
        this.input.roll,
        this.input.yaw,
        this.input.throttle,
        dt,
        this.assist,
        this.input.gamepadConnected,
        agl,
        this.damage.alive,
      );
    this.motorThrust = motorThrust;
    // Constant yaw-drift bias per lost rotor, in world space -- our
    // FlightModel is an abstracted attitude PD, not a true per-motor X-
    // config mixer, so a missing rotor's real asymmetric-thrust yaw drift
    // is approximated as a fixed torque the pilot must trim against with
    // yaw input, rather than derived from motor geometry. Direction is the
    // index of the FIRST lost rotor (stable per crash, not flickering
    // between rotors each frame) so the drift is learnable, not random.
    const lostIdx = this.damage.alive.indexOf(false);
    if (lostIdx !== -1) {
      const driftSign = lostIdx % 2 === 0 ? 1 : -1,
        driftTorque = new THREE.Vector3(0, driftSign * T.rotorLossYawDrift, 0).applyQuaternion(quat);
      torque.add(driftTorque);
    }
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
