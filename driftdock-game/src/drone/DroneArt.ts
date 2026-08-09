import * as THREE from "three";
import { T } from "./Tuning";

/** Procedural FPV racing-drone frame: carbon-arm X frame, stacked
 *  flight-controller body, forward camera pod (reads orientation at a
 *  glance -- helps "which way is forward" the same way a real FPV drone's
 *  canopy does), motor bells, spinning props, LED accent strips, plus
 *  (lunar re-theme) four angled landing legs and an underside thruster
 *  glow disc per rotor -- a lander silhouette without changing the actual
 *  racing-drone physics or thrust-point layout at all. No model files,
 *  per the brief -- searched online first (Poly Pizza's CC-BY "Drone
 *  Core"/"Anti-Gravity Drone" were the closest fits) but a mismatched
 *  external rig risks breaking the now-verified thrust-point alignment,
 *  and the low-poly look is exactly what primitives do best. Returns the
 *  visual group plus references needed for per-frame updates (rotor LED
 *  materials, spinning prop meshes). */
export function buildDroneMesh() {
  const g = new THREE.Group(),
    carbon = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.35, metalness: 0.55 }),
    accent = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.3 });

  // Stacked body: bottom plate, FC/ESC stack, top plate.
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.09), carbon);
  bottom.position.y = -0.02;
  add(bottom);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), accent);
  add(stack);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.1), carbon);
  top.position.y = 0.02;
  add(top);

  // Forward camera pod, angled slightly down like a real FPV cam -- the
  // single clearest "which way is the nose" cue in the cockpit view too.
  const pod = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.05, 10),
    new THREE.MeshStandardMaterial({ color: 0xff8a3d, roughness: 0.3, metalness: 0.1 }),
  );
  pod.rotation.x = Math.PI / 2 + 0.25;
  pod.position.set(0, 0.01, -0.08);
  add(pod);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.011, 12), new THREE.MeshBasicMaterial({ color: 0x0a1420 }));
  lens.position.set(0, -0.005, -0.107);
  lens.rotation.x = -0.25;
  add(lens);

  // VTX antenna -- a small procedural flourish, cheap and reads at speed.
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.002, 0.002, 0.06, 6),
    new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.6 }),
  );
  antenna.position.set(-0.03, 0.05, 0.05);
  antenna.rotation.z = 0.3;
  add(antenna);

  // Four carbon arms, X configuration, running to each motor position.
  const armPositions: [number, number][] = [
    [T.armLength, -T.armLength],
    [-T.armLength, -T.armLength],
    [-T.armLength, T.armLength],
    [T.armLength, T.armLength],
  ];
  const rotorGroups: THREE.Group[] = [],
    ledMats: THREE.MeshBasicMaterial[] = [],
    propMeshes: THREE.Mesh[] = [];
  for (const [x, z] of armPositions) {
    const len = Math.hypot(x, z),
      arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.008, 0.016), carbon);
    arm.position.set(x / 2, 0, z / 2);
    // BoxGeometry's long axis is local X; rotate about Y so it points from
    // the body center out to this rotor's (x,z) position.
    arm.rotation.y = -Math.atan2(z, x);
    add(arm);

    const rotor = new THREE.Group();
    rotor.position.set(x, 0.008, z);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.022, 12), accent);
    rotor.add(bell);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x4fd6ff, transparent: true, opacity: 0.3 });
    const led = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0025, 6, 16), ledMat);
    led.position.y = 0.01;
    rotor.add(led);
    // Underside thruster glow -- same material INSTANCE as the LED ring
    // (not a copy), so Drone.ts's existing per-motor opacity update drives
    // both at once with zero changes to the update loop itself.
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.017, 16), ledMat);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -0.006;
    rotor.add(glow);
    ledMats.push(ledMat);

    // Angled landing leg -- strut from near the body out past the rotor,
    // down to a small foot pad. Lander silhouette only; no landing-gear
    // physics or collider, the body's own cuboid collider is unchanged.
    const legMat = new THREE.MeshStandardMaterial({ color: 0xaab0b8, roughness: 0.4, metalness: 0.6 }),
      legFrom = new THREE.Vector3(x * 0.55, -0.015, z * 0.55),
      legTo = new THREE.Vector3(x * 1.05, -0.11, z * 1.05),
      legLen = legFrom.distanceTo(legTo),
      leg = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.0035, legLen, 6), legMat);
    leg.position.copy(legFrom).add(legTo).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), legTo.clone().sub(legFrom).normalize());
    add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 10), legMat);
    foot.position.copy(legTo);
    add(foot);

    // A simple 2-blade prop; spun each frame by the caller based on thrust.
    const prop = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.002, 0.014),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.4, transparent: true, opacity: 0.85 }),
    );
    prop.position.y = 0.016;
    rotor.add(prop);
    propMeshes.push(prop);

    g.add(rotor);
    rotorGroups.push(rotor);
  }

  return { group: g, ledMats, propMeshes };

  function add(o: THREE.Object3D) {
    g.add(o);
  }
}
