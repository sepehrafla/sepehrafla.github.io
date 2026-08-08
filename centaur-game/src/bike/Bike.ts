import * as THREE from "three";
import { Physics, RAPIER } from "../core/Physics";
import type { Input } from "../core/Input";
import type { Particles } from "../feel/Particles";
import type { Sound } from "../feel/Sound";
import { T } from "./Tuning";
import { buildWheel, buildChassis, buildRider } from "./BikeArt";
import { MergeVisual } from "./MergeVisual";
import type { Copilot } from "../copilot/Copilot";
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
  merge!: MergeVisual;
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
  squash = 0;
  streakTick = 0;
  throttle = 0;
  stuckTime = 0;
  /** Set from main.ts once the Copilot exists. When throttle is pinned, its
   *  PID output replaces this.input.gas as the propulsion signal -- see
   *  CENTAUR_DESIGN.md §3. Braking and lean stay manual-only in this slice. */
  copilot: Copilot | null = null;
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
            .setLinearDamping(0.2)
            .setAngularDamping(0.2)
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
        .setLinearDamping(0.08)
        .setAngularDamping(1.65)
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
    this.merge = new MergeVisual(this.chassisMesh);
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
    (globalThis as typeof globalThis & { __centaurBike?: Bike }).__centaurBike = this;
    this.tier = tier;
    const colors = [0xa746ff, 0xff4f9a, 0x28d7e8, 0xffa33a, 0xf9ef72];
    for (const m of this.chassisMesh.userData.paint as THREE.MeshStandardMaterial[])
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
    const nowX = this.chassis.translation().x,
      speedNow = Math.abs(this.chassis.linvel().x),
      maxSpeedMs = T.maxWheelSpeed * T.wheelRadius,
      copilotGas = this.copilot?.throttleOutput(speedNow, maxSpeedMs, dt) ?? null,
      copilotBrake = this.copilot?.brakeOutput(speedNow, nowX, this.ground) ?? null,
      // Delegated subsystems replace their manual signal entirely -- see
      // CENTAUR_DESIGN.md §3. Lean/air-attitude handled further down.
      gas = copilotGas ?? (this.input.gas ? 1 : 0),
      brake = copilotBrake !== null ? (copilotBrake > 0.02 ? 1 : 0) : this.input.brake ? 1 : 0;
    // Propulsion is the rear wheel motor (gasTorque/maxWheelSpeed) so it rolls
    // WITH ground friction instead of fighting it -- a bare chassis impulse here
    // gets almost entirely absorbed by the high grip tuned for climbing, so the
    // bike barely creeps forward even with gas held.
    // Negative target: positive angular velocity (CCW) rolls the chassis in -x here,
    // verified empirically -- +27 drove the bike backward.
    // Ease the throttle in quickly and release it softly. Full motor torque on
    // the first pressed frame made the rear tire snap, chatter and pitch the bike.
    const throttleRate = gas > 0.01 ? 4.8 : 7;
    this.throttle += (gas - this.throttle) * Math.min(1, throttleRate * dt);
    if (brake) this.rearJoint.configureMotorVelocity(0, T.brakeTorque);
    else if (this.throttle > 0.01)
      this.rearJoint.configureMotorVelocity(
        -T.maxWheelSpeed * this.throttle,
        T.gasTorque * (0.45 + this.throttle * 0.55),
      );
    else this.rearJoint.configureMotorVelocity(0, 0);
    // A small speed-error assist bridges steep seams without overriding Rapier.
    // It fades out at cruising speed, so jumps and coasting remain physical.
    const vx = this.chassis.linvel().x,
      targetVx = T.maxWheelSpeed * T.wheelRadius * this.throttle,
      assist = Math.max(0, Math.min(3.2, targetVx - vx));
    if (this.throttle > 0.01)
      this.chassis.applyImpulse({ x: assist * 0.42 * dt, y: 0 }, true);
    if (brake) this.front.setAngvel(this.front.angvel() * 0.84, true);
    const x = this.chassis.translation().x,
      y = this.chassis.translation().y,
      grounded =
        Math.min(
          this.rear.translation().y - this.ground(this.rear.translation().x),
          this.front.translation().y - this.ground(this.front.translation().x),
        ) < 0.82;
    // Stop gravity from turning a short throttle release into a surprising
    // backwards roll on a hill; braking still allows intentional reverse motion.
    if (grounded && !brake && vx < 0)
      this.chassis.applyImpulse({ x: Math.min(0.09, -vx * 0.075), y: 0 }, true);
    this.air = grounded ? 0 : this.air + dt;
    // Air attitude is a delegable subsystem: pinned, the copilot's own
    // torque impulse replaces manual lean while airborne (same as throttle
    // ignoring manual gas once pinned) -- see CENTAUR_DESIGN.md §3/§7.
    const airPinned = !!this.copilot?.isPinned("airAttitude"),
      lean = airPinned ? 0 : (this.input.left ? 1 : 0) - (this.input.right ? 1 : 0),
      signed = Math.atan2(Math.sin(this.chassis.rotation()), Math.cos(this.chassis.rotation()));
    this.chassis.applyTorqueImpulse(lean * (grounded ? T.leanTorque : T.airLean) * (1 + this.tier * 0.1) * dt, true);
    const settling = y - this.ground(x) < 3 && Math.abs(this.chassis.linvel().x) < 1.5;
    if ((grounded || settling) && !lean)
      this.chassis.applyTorqueImpulse(-signed * (settling ? 24 : 11) * dt, true);
    if (!grounded && airPinned) {
      const out = this.copilot!.airAttitudeOutput(signed, this.chassis.angvel(), dt);
      if (out !== null) this.chassis.applyTorqueImpulse(out * dt, true);
    }
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
      this.squash = Math.min(1, 0.4 + this.air * 0.3);
      this.onLand?.(flip);
    }
    this.wasAir = !grounded;
    // Squash-and-stretch on landing, speed streaks at high velocity -- pure juice,
    // no gameplay effect.
    this.squash *= Math.exp(-dt * 13);
    this.chassisMesh.scale.set(1 + this.squash * 0.16, 1 - this.squash * 0.22, 1);
    const trust = this.copilot ? Object.keys(this.copilot.pins).length / this.copilot.bandwidth : 0;
    this.merge.update(trust, dt);
    const speed = Math.abs(this.chassis.linvel().x);
    this.streakTick += dt;
    if (grounded && speed > 13 && this.streakTick > 0.05) {
      this.streakTick = 0;
      this.particles.emit(x - Math.sign(this.chassis.linvel().x) * 0.9, y + 0.3, 0xf4f1e8, 1, 0.4);
    }
    if (x > this.nextCheckpoint) {
      this.checkpoint = { x, y: Math.max(y, this.ground(x) + 3) };
      this.nextCheckpoint += T.checkpoint;
    }
    const angle = Math.abs(signed),
      chassisLow = y - this.ground(x) < 1.25;
    if ((grounded || chassisLow) && angle > 1.55) this.wipe();
    // A tipped-over bike can settle in a pose where neither `grounded` nor
    // `chassisLow` reads true (e.g. resting on the raised part of a ramp) and
    // wipe() never fires, leaving it stuck forever with gas held and going
    // nowhere. If it's barely moving and badly tipped for half a second,
    // force the recovery regardless of the ground-contact specifics.
    const settled = Math.abs(this.chassis.linvel().x) < 0.25 && Math.abs(this.chassis.linvel().y) < 0.25;
    this.stuckTime = settled && angle > 1.3 ? this.stuckTime + dt : 0;
    if (this.stuckTime > 0.5) this.wipe(true);
    this.sound.rpm(this.rear.angvel());
    this.onTrace?.(x, y, Math.abs(this.chassis.linvel().x));
    if (gas && grounded)
      this.particles.emit(this.rear.translation().x, this.rear.translation().y - 0.5, 0x9b9b9b, 1, 1.4);
  }
  wipe(force = false) {
    if (this.wiped || (!force && performance.now() - this.born < 1800)) return;
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
    this.throttle = 0;
    this.stuckTime = 0;
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
