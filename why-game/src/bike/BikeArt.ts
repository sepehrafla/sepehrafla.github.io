import * as THREE from "three";
import { T } from "./Tuning";

/* Side-view vector illustration: flat fills + 1px ink outlines, layered in z.
   Chassis-local space — wheel centres sit at (±1.15, -0.78), ground at y=-1.43. */

const INK = 0x1f2126;
type Pt = [number, number];

function inkPoly(pts: Pt[], color: number, z = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color });
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  fill.position.z = z;
  g.add(fill);
  g.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        pts.map((p) => new THREE.Vector3(p[0], p[1], z + 0.012)),
      ),
      new THREE.LineBasicMaterial({ color: INK }),
    ),
  );
  g.userData.mat = mat;
  return g;
}

/** Straight tube between two points — frame rails, forks, swingarm, exhaust. */
function tube(a: Pt, b: Pt, w: number, color: number, z = 0) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy);
  const g = inkPoly(
    [
      [0, -w],
      [len, -w],
      [len, w],
      [0, w],
    ],
    color,
    z,
  );
  g.position.set(a[0], a[1], 0);
  g.rotation.z = Math.atan2(dy, dx);
  return g;
}

/** Curved band (fender, exhaust sweep) sampled along an arc. */
function arcBand(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  w: number,
  color: number,
  z = 0,
) {
  const outer: Pt[] = [],
    inner: Pt[] = [],
    steps = 14;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    outer.push([cx + Math.cos(a) * (r + w), cy + Math.sin(a) * (r + w)]);
    inner.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return inkPoly([...outer, ...inner.reverse()], color, z);
}

export function buildWheel() {
  const g = new THREE.Group(),
    r = T.wheelRadius;
  const tire = new THREE.Mesh(
    new THREE.TorusGeometry(r - 0.09, 0.115, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0x24262b }),
  );
  g.add(tire);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2,
      knob = new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.08, 0.3),
        new THREE.MeshBasicMaterial({ color: 0x15171a }),
      );
    knob.position.set(Math.cos(a) * (r - 0.03), Math.sin(a) * (r - 0.03), 0);
    knob.rotation.z = a;
    g.add(knob);
  }
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(r * 0.58, 0.045, 6, 28),
    new THREE.MeshBasicMaterial({ color: 0xdad6cb }),
  );
  rim.position.z = 0.02;
  g.add(rim);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(r * 1.16, 0.022, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xb9b5aa }),
    );
    s.rotation.z = (i * Math.PI) / 8;
    s.position.z = 0.01;
    g.add(s);
  }
  const hub = new THREE.Mesh(
    new THREE.CircleGeometry(0.15, 14),
    new THREE.MeshBasicMaterial({ color: 0x8e9299 }),
  );
  hub.position.z = 0.05;
  g.add(hub);
  return g;
}

/** Returns the chassis group; userData.paint holds tier-recolourable materials. */
export function buildChassis() {
  const g = new THREE.Group(),
    paint: THREE.MeshBasicMaterial[] = [],
    add = (o: THREE.Group, paintable = false) => {
      g.add(o);
      if (paintable) paint.push(o.userData.mat);
    };

  // --- behind the frame ---
  add(tube([-0.15, -0.5], [-1.15, -0.78], 0.075, 0x6e7378, -0.06)); // swingarm
  add(tube([-0.18, -0.38], [-0.12, 0.24], 0.055, 0x8b9096, -0.06)); // rear shock
  add(
    arcBand(-0.25, -0.28, 0.72, 0.15, 1.5, 0.055, 0x9aa0a6, -0.05), // exhaust sweep
  );
  add(tube([0.42, -0.26], [-0.02, -0.16], 0.06, 0x9aa0a6, -0.05)); // header pipe

  // --- frame ---
  add(tube([-0.15, -0.5], [0.62, -0.34], 0.055, 0x55595e, -0.03)); // lower rail
  add(tube([-0.15, -0.5], [-0.02, 0.22], 0.05, 0x55595e, -0.03)); // seat post
  add(tube([-0.02, 0.22], [0.78, 0.5], 0.055, 0x55595e, -0.03)); // top rail
  add(tube([0.62, -0.34], [0.78, 0.5], 0.05, 0x55595e, -0.03)); // down tube

  // --- engine ---
  add(
    inkPoly(
      [
        [0.06, -0.62],
        [0.6, -0.58],
        [0.66, -0.16],
        [0.28, -0.06],
        [0.02, -0.24],
      ],
      0x4a4f55,
      -0.02,
    ),
  );
  for (let i = 0; i < 4; i++)
    add(tube([0.14, -0.5 + i * 0.1], [0.58, -0.47 + i * 0.1], 0.014, 0x2c3035, 0));

  // --- bodywork (tier-painted) ---
  add(
    inkPoly(
      [
        [-1.36, 0.32],
        [-0.5, 0.2],
        [-0.48, 0.34],
        [-1.32, 0.48],
      ],
      0xb45b42,
      0.01,
    ),
    true,
  ); // rear fender / tail — overlaps the seat so it reads as one bodywork line
  add(
    inkPoly(
      [
        [-0.96, 0.12],
        [0.16, 0.2],
        [0.2, 0.34],
        [-0.9, 0.3],
      ],
      0x30343a,
      0.02,
    ),
  ); // seat
  add(
    inkPoly(
      [
        [0.16, 0.06],
        [0.74, 0.16],
        [0.82, 0.44],
        [0.3, 0.4],
        [0.12, 0.24],
      ],
      0xb45b42,
      0.02,
    ),
    true,
  ); // tank
  add(
    inkPoly(
      [
        [0.58, -0.2],
        [0.92, -0.06],
        [0.9, 0.36],
        [0.62, 0.28],
      ],
      0xb45b42,
      0.03,
    ),
    true,
  ); // radiator shroud

  // --- front end ---
  add(tube([0.78, 0.52], [1.11, -0.4], 0.062, 0xc6c2b7, 0.03)); // upper fork
  add(tube([1.02, -0.12], [1.15, -0.78], 0.052, 0x7d8288, 0.03)); // lower slider
  add(arcBand(1.15, -0.78, 0.71, 0.32, 1.42, 0.06, 0xb45b42, 0.04), true); // front fender — concentric with the axle
  add(tube([0.72, 0.56], [0.96, 0.74], 0.04, 0x3a3f45, 0.06)); // handlebar riser
  add(tube([0.82, 0.78], [1.16, 0.72], 0.032, 0x3a3f45, 0.06)); // bar

  g.userData.paint = paint;
  return g;
}

/** Motocross attack stance: knees bent over the pegs, torso forward to the bar. */
export function buildRider() {
  const g = new THREE.Group(),
    SUIT = 0x39414d,
    SKIN = 0xd89b72;
  const add = (o: THREE.Group) => g.add(o);

  add(tube([0.04, -0.5], [0.12, 0.06], 0.1, SUIT, 0.05)); // shin
  add(tube([0.12, 0.06], [-0.22, 0.44], 0.115, SUIT, 0.05)); // thigh
  add(
    inkPoly(
      [
        [-0.3, 0.36],
        [0.12, 0.42],
        [0.32, 1.08],
        [-0.02, 1.14],
      ],
      SUIT,
      0.06,
    ),
  ); // torso
  add(tube([0.24, 1.02], [0.92, 0.78], 0.07, SUIT, 0.07)); // arm
  add(tube([0.86, 0.78], [1.0, 0.76], 0.055, SKIN, 0.07)); // glove

  const helmet = inkPoly(
    [
      [0.14, 1.1],
      [0.42, 1.14],
      [0.54, 1.31],
      [0.44, 1.48],
      [0.18, 1.44],
      [0.07, 1.27],
    ],
    0x2a8d92,
    0.08,
  );
  add(helmet);
  add(
    inkPoly(
      [
        [0.38, 1.21],
        [0.55, 1.26],
        [0.52, 1.38],
        [0.36, 1.34],
      ],
      0x1b1d21,
      0.09,
    ),
  ); // visor
  add(
    inkPoly(
      [
        [0.5, 1.36],
        [0.69, 1.44],
        [0.63, 1.52],
        [0.43, 1.47],
      ],
      0x2a8d92,
      0.09,
    ),
  ); // peak
  g.userData.helmet = helmet.userData.mat;
  return g;
}
