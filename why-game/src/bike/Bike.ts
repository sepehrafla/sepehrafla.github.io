import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import type { Input } from "../core/Input";
import type { Particles } from "../feel/Particles";
import type { Sound } from "../feel/Sound";
import { T } from "./Tuning";
import { buildWheel, buildChassis, buildRider } from "./BikeArt";
export class Bike {
  chassis: RAPIER.RigidBody;
  rear: RAPIER.RigidBody;
  front: RAPIER.RigidBody;
  rearJoint: RAPIER.RevoluteImpulseJoint;
  frontJoint: RAPIER.RevoluteImpulseJoint;
  chassisMesh: THREE.Group;
  rearMesh: THREE.Group;
  frontMesh: THREE.Group;
  rider: THREE.Group;
  air = 0;
  wasAir = false;
  wiped = false;
  respawnIn = 0;
  born = performance.now();
  checkpoint = { x: 0, y: 3 };
  nextCheckpoint = T.checkpoint;
  boost = 0;
  tier = 0;
  onWipe?: () => void;
  onLand?: (flip: boolean) => void;
  onTrace?: (x: number, y: number, speed: number) => void;
  lastAngle = 0;
  spin = 0;
  constructor(
    public scene: THREE.Scene,
    public physics: Physics,
    public input: Input,
    public particles: Particles,
    public sound: Sound,
    public ground: (x: number) => number,
  ) {
    const rearY = ground(-1.15) + T.wheelRadius + 0.08,
      frontY = ground(1.15) + T.wheelRadius + 0.08,
      startAngle = Math.atan2(frontY - rearY, 2.3),
      chassisY = (rearY + frontY) * 0.5 + 0.78;
    const makeBody = (x: number, y: number, mass: number, r = 0.55) => {
      const b = physics.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y)
            .setLinearDamping(0.12)
            .setAngularDamping(0.12)
            .setCcdEnabled(true),
        ),
        c = physics.world.createCollider(
          RAPIER.ColliderDesc.ball(r)
            .setMass(mass)
            .setFriction(T.friction)
            .setRestitution(0.04)
            .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
          b,
        );
      (c as RAPIER.Collider & { tag?: string }).tag = "bike";
      return b;
    };
    this.chassis = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, chassisY)
        .setRotation(startAngle)
        .setAngularDamping(1.2)
        .setCcdEnabled(true),
    );
    const cc = physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(1, 0.26)
        .setMass(T.chassisMass)
        .setFriction(0.75)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),
      this.chassis,
    );
    (cc as RAPIER.Collider & { tag?: string }).tag = "chassis";
    this.rear = makeBody(-1.15, rearY, T.wheelMass);
    this.front = makeBody(1.15, frontY, T.wheelMass);
    this.rearJoint = physics.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: -1.15, y: -0.78 }, { x: 0, y: 0 }),
      this.chassis,
      this.rear,
      true,
    ) as RAPIER.RevoluteImpulseJoint;
    this.frontJoint = physics.world.createImpulseJoint(
      RAPIER.JointData.revolute({ x: 1.15, y: -0.78 }, { x: 0, y: 0 }),
      this.chassis,
      this.front,
      true,
    ) as RAPIER.RevoluteImpulseJoint;
    this.chassisMesh = this.makeChassis();
    this.rearMesh = this.makeWheel();
    this.frontMesh = this.makeWheel();
    this.rider = this.makeRider();
    this.chassisMesh.add(this.rider);
    scene.add(this.chassisMesh, this.rearMesh, this.frontMesh);
    physics.add(this.chassis, this.chassisMesh);
    physics.add(this.rear, this.rearMesh);
    physics.add(this.front, this.frontMesh);
  }
  makeWheel() {
    return buildWheel();
  }
  makeChassis() {
    return buildChassis();
  }
  makeRider() {
    return buildRider();
  }
  setTier(tier: number) {
    (globalThis as typeof globalThis & { __whyBike?: Bike }).__whyBike = this;
    this.tier = tier;
    const colors = [0x8d6e58, 0x4ba978, 0x2bbfc1, 0xe2a73b, 0xea6b88];
    for (const m of this.chassisMesh.userData.paint as THREE.MeshBasicMaterial[])
      m.color.setHex(colors[tier]);
    if (tier >= 4 && !this.chassisMesh.userData.glider) {
      const sail = new THREE.Mesh(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-1, 1.7, 0),
          new THREE.Vector3(1.5, 1.15, 0),
          new THREE.Vector3(-0.4, 2.5, 0),
        ]),
        new THREE.MeshBasicMaterial({
          color: 0xf0b7ca,
          side: THREE.DoubleSide,
        }),
      );
      this.chassisMesh.add(sail);
      this.chassisMesh.userData.glider = true;
    }
  }
  fixed(dt: number) {
    if (this.wiped) {
      this.respawnIn -= dt;
      if (this.respawnIn <= 0) this.respawn();
      return;
    }
    const gas = this.input.gas ? 1 : 0,
      brake = this.input.brake ? 1 : 0,
      target = 0;
    this.rearJoint.configureMotorVelocity(brake ? 0 : target, brake ? T.brakeTorque : 0);
    if (gas) {
      this.chassis.applyImpulse({ x: 110 * dt, y: 0 }, true);
    }
    if (brake) this.front.setAngvel(this.front.angvel() * 0.84, true);
    const x = this.chassis.translation().x,
      y = this.chassis.translation().y,
      grounded =
        Math.min(
          this.rear.translation().y - this.ground(this.rear.translation().x),
          this.front.translation().y - this.ground(this.front.translation().x),
        ) < 0.82;
    this.air = grounded ? 0 : this.air + dt;
    const lean = (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0),
      signed = Math.atan2(Math.sin(this.chassis.rotation()), Math.cos(this.chassis.rotation()));
    this.chassis.applyTorqueImpulse(lean * (grounded ? T.leanTorque : T.airLean) * (1 + this.tier * 0.1) * dt, true);
    const settling = y - this.ground(x) < 3 && Math.abs(this.chassis.linvel().x) < 1.5;
    if ((grounded || settling) && !lean) this.chassis.applyTorqueImpulse(-signed * (settling ? 34 : 8) * dt, true);
    if (this.tier >= 4 && this.input.left && this.input.right && !grounded)
      this.chassis.addForce({ x: 0, y: 60 }, true);
    if (this.boost > 0) {
      this.boost -= dt;
      this.chassis.applyImpulse({ x: 2.4 * dt, y: 0 }, true);
    }
    if (!grounded) {
      if (!this.wasAir) {
        this.spin = 0;
        this.lastAngle = this.chassis.rotation();
      }
      const a = this.chassis.rotation(),
        d = Math.atan2(Math.sin(a - this.lastAngle), Math.cos(a - this.lastAngle));
      this.spin += d;
      this.lastAngle = a;
    } else if (this.wasAir) {
      const flip = Math.abs(this.spin) > Math.PI * 1.65 && Math.abs(Math.sin(this.chassis.rotation())) < 0.45;
      if (flip) {
        this.boost = 0.8;
        this.particles.emit(x, y, 0xe9b949, 35, 5);
      }
      this.onLand?.(flip);
    }
    this.wasAir = !grounded;
    if (x > this.nextCheckpoint) {
      this.checkpoint = { x, y: Math.max(y, this.ground(x) + 3) };
      this.nextCheckpoint += T.checkpoint;
    }
    const angle = Math.abs(signed),
      chassisLow = y - this.ground(x) < 1.25;
    if ((grounded || chassisLow) && angle > 1.55) this.wipe();
    this.sound.rpm(this.rear.angvel());
    this.onTrace?.(x, y, Math.abs(this.chassis.linvel().x));
    if (gas && grounded)
      this.particles.emit(this.rear.translation().x, this.rear.translation().y - 0.5, 0x9b9b9b, 1, 1.4);
  }
  wipe() {
    if (this.wiped || performance.now() - this.born < 1800) return;
    this.wiped = true;
    this.respawnIn = T.respawn;
    this.rider.visible = false;
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
          new THREE.BoxGeometry(0.25 + i * 0.03, 0.7, 0.2),
          new THREE.MeshBasicMaterial({ color: i ? 0x424950 : 0xd89b72 }),
        ),
        b = this.physics.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(
              this.chassis.translation().x + (i - 0.5) * 0.12,
              this.chassis.translation().y + 1 + i * 0.16,
            )
            .setLinvel(2 + i, 3 + i),
        );
      this.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.14, 0.34).setMass(0.3), b);
      this.scene.add(m);
      this.physics.add(b, m);
      setTimeout(() => {
        this.scene.remove(m);
        this.physics.remove(b);
      }, 1200);
    }
    this.sound.wipe();
    this.onWipe?.();
  }
  respawn() {
    this.wiped = false;
    this.born = performance.now() - 1200;
    this.rider.visible = true;
    const { x, y } = this.checkpoint;
    for (const [body, dx, dy] of [
      [this.chassis, 0, 0],
      [this.rear, -1.15, -0.78],
      [this.front, 1.15, -0.78],
    ] as const) {
      body.setTranslation({ x: x + dx, y: y + dy }, true);
      body.setRotation(0, true);
      body.setLinvel({ x: 0, y: 0 }, true);
      body.setAngvel(0, true);
    }
  }
  position() {
    return this.chassis.translation();
  }
  velocity() {
    return this.chassis.linvel();
  }
}
