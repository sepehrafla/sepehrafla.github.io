import * as THREE from "three";

/** Ink-strand visual arc of the merge (CENTAUR_DESIGN.md §2): as more
 *  subsystems get pinned, thin glowing strands connect rider to frame --
 *  literal "two silhouettes becoming one" per the brief. trust = pins/
 *  bandwidth, 0..1. Purely cosmetic, no gameplay effect. */
export class MergeVisual {
  group: THREE.Group;
  private strands: THREE.Line[];
  private mats: THREE.LineBasicMaterial[];
  private t = 0;

  constructor(parent: THREE.Group) {
    this.group = new THREE.Group();
    // Rider-leg/torso points -> chassis-frame points, in the chassis's own
    // local space (rider is already a child of chassisMesh, so both sides
    // share this frame with no extra transform bookkeeping).
    const pairs: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(0.04, -0.46, 0.09), new THREE.Vector3(0.3, -0.18, 0.03)],
      [new THREE.Vector3(-0.18, 0.4, 0.09), new THREE.Vector3(0.62, 0.12, 0.05)],
      [new THREE.Vector3(0.28, 1.05, 0.1), new THREE.Vector3(0.78, 0.5, 0.06)],
    ];
    this.mats = [];
    this.strands = pairs.map(([a, b]) => {
      const mat = new THREE.LineBasicMaterial({ color: 0xff4fb4, transparent: true, opacity: 0 });
      this.mats.push(mat);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat);
      this.group.add(line);
      return line;
    });
    parent.add(this.group);
  }

  update(trust: number, dt: number) {
    this.t += dt;
    const active = Math.round(trust * this.strands.length);
    for (let i = 0; i < this.strands.length; i++) {
      const on = i < active,
        pulse = on ? 0.55 + Math.sin(this.t * 3 + i) * 0.25 : 0;
      this.mats[i].opacity += (pulse - this.mats[i].opacity) * Math.min(1, dt * 6);
    }
  }
}
