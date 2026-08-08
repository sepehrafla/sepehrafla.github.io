import * as THREE from "three";
import { COURSES, type CourseDef } from "../world/Course";
import { buildCopilotLine, nearestOnLine, previewPoint, type CopilotLine } from "./GhostLine";
import { SaveState } from "../core/SaveState";
import { T } from "../drone/Tuning";
import type { Drone } from "../drone/Drone";
import type { AssistMode } from "../drone/Assists";

export type CopilotStatus = "LOCKED" | "AVAILABLE" | "ACCEPTED" | "DECLINED";

/** Milestone 7: the copilot's proposed line -- renders once unlocked (all
 *  5 courses cleared, per the brief's "after 5 courses cleared"), tap C to
 *  accept/decline. Accepted: pre-arms the suggested assist at each schedule
 *  transition (not every frame -- that would lock the player out of
 *  deviating, which the brief explicitly wants possible: "beating gold
 *  requires rejecting it in at least 2 places"), applies a weak magnetism
 *  toward the line, and tracks sync% + divergence count for the results
 *  screen. */
export class CopilotSession {
  status: CopilotStatus = "LOCKED";
  syncPercent = 0;
  divergenceCount = 0;
  private course: CourseDef | null = null;
  private line: CopilotLine | null = null;
  private lineMesh: THREE.Line | null = null;
  private previewMesh: THREE.Mesh;
  private wasSynced = true;
  private syncedFrames = 0;
  private totalFrames = 0;
  private lastSuggested: AssistMode | null = null;

  constructor(private scene: THREE.Scene) {
    this.previewMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.8 }),
    );
    this.previewMesh.visible = false;
    scene.add(this.previewMesh);
    addEventListener("keydown", (e) => {
      if (e.code !== "KeyC" || this.status === "LOCKED") return;
      this.status = this.status === "ACCEPTED" ? "DECLINED" : "ACCEPTED";
      this.applyLineStyle();
    });
  }

  /** Call whenever the active course changes (course select, including the
   *  initial one on load). Rebuilds the line and resets per-run tracking. */
  setCourse(course: CourseDef) {
    this.course = course;
    if (this.lineMesh) {
      this.scene.remove(this.lineMesh);
      this.lineMesh.geometry.dispose();
    }
    this.line = buildCopilotLine(course);
    const geo = new THREE.BufferGeometry().setFromPoints(this.line.points);
    this.lineMesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.25 }));
    this.scene.add(this.lineMesh);
    if (this.unlocked() && this.status === "LOCKED") this.status = "AVAILABLE";
    else if (!this.unlocked()) this.status = "LOCKED";
    this.resetTracking();
    this.applyLineStyle();
  }

  private resetTracking() {
    this.syncedFrames = 0;
    this.totalFrames = 0;
    this.divergenceCount = 0;
    this.syncPercent = 0;
    this.wasSynced = true;
    this.lastSuggested = null;
  }

  private unlocked() {
    return COURSES.every((c) => SaveState.bestTime(c.id) !== undefined);
  }

  get debugUnlocked() {
    return this.unlocked();
  }

  private applyLineStyle() {
    if (!this.lineMesh) return;
    this.lineMesh.visible = this.status === "AVAILABLE" || this.status === "ACCEPTED";
    (this.lineMesh.material as THREE.LineBasicMaterial).opacity = this.status === "ACCEPTED" ? 0.55 : 0.22;
  }

  /** Call once per frame. Returns a small velocity nudge (magnetism) for
   *  main.ts to apply as an impulse, or null when not accepted/racing. */
  update(dt: number, dronePos: THREE.Vector3, speed: number, drone: Drone, racing: boolean): THREE.Vector3 | null {
    if (!this.line || this.status === "LOCKED") {
      this.previewMesh.visible = false;
      return null;
    }
    const near = nearestOnLine(this.line, dronePos);
    this.previewMesh.visible = this.status !== "DECLINED";
    if (this.previewMesh.visible) this.previewMesh.position.copy(previewPoint(this.line, near.distanceAlong, speed, T.copilotPreviewSeconds));

    if (this.status !== "ACCEPTED" || !racing) return null;

    this.totalFrames++;
    const synced = near.distance < T.copilotSyncTolerance;
    if (synced) this.syncedFrames++;
    // Count each time the player LEAVES the tolerance band, not every frame
    // spent outside it -- this is what "≥2 documented divergences" means:
    // distinct departures from the line, not a raw time-outside metric.
    if (!synced && this.wasSynced) this.divergenceCount++;
    this.wasSynced = synced;
    this.syncPercent = this.totalFrames ? (this.syncedFrames / this.totalFrames) * 100 : 0;

    const suggested = this.line.assistAt(near.distanceAlong);
    if (suggested !== this.lastSuggested) {
      this.lastSuggested = suggested;
      if (!this.course?.lockStabilize) drone.assist = suggested;
    }

    if (near.distance < T.copilotMagnetRadius) {
      const toward = near.point.clone().sub(dronePos),
        strength = (1 - near.distance / T.copilotMagnetRadius) * T.copilotMagnetForce;
      if (toward.lengthSq() > 1e-6) return toward.normalize().multiplyScalar(strength * dt);
    }
    return null;
  }
}
