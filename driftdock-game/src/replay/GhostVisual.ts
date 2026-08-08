import * as THREE from "three";
import { buildDroneMesh } from "../drone/DroneArt";
import type { GhostPlayer } from "./Ghost";

/** A translucent cyan copy of the drone mesh, driven by GhostPlayer
 *  playback -- reuses buildDroneMesh() wholesale (same rig, just
 *  recolored) rather than a second art asset. */
export class GhostVisual {
  private group: THREE.Group;

  constructor(scene: THREE.Scene) {
    const { group } = buildDroneMesh();
    group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const src = o.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
        m = src.clone();
      m.transparent = true;
      m.opacity = 0.32;
      if ("color" in m) m.color.set(0x4fd6ff);
      if ("emissive" in m) (m as THREE.MeshStandardMaterial).emissive.set(0x1a4a66);
      o.material = m;
    });
    group.visible = false;
    scene.add(group);
    this.group = group;
  }

  update(player: GhostPlayer | null, elapsed: number, racing: boolean) {
    const pose = player && racing ? player.poseAt(elapsed) : null;
    this.group.visible = !!pose;
    if (pose) {
      this.group.position.copy(pose.pos);
      this.group.quaternion.copy(pose.quat);
    }
  }
}
