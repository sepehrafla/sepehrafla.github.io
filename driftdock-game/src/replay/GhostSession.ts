import * as THREE from "three";
import { CourseRunner, parseSharedGhost, shareGhostLink } from "../world/Course";
import { CourseHUD } from "../hud/CourseHUD";
import { SaveState } from "../core/SaveState";
import { GhostRecorder, GhostPlayer, type GhostSample } from "./Ghost";
import { GhostVisual } from "./GhostVisual";
import { CopilotSession } from "../copilot/CopilotSession";
import { buildDailyCourse } from "../modes/Daily";
import { dailyNumber } from "../core/Seed";
import { shareOrDownloadResults, type ResultsData } from "../ui/Results";
import type { Drone } from "../drone/Drone";

/** Bundles the course/medal/ghost/daily/results pieces (CourseRunner,
 *  GhostRecorder/Player/Visual, CourseHUD, SaveState, CopilotSession) into
 *  one thing main.ts drives with a single call per frame -- same reasoning
 *  as WorldTriggers in milestone 5: not a new abstraction layer, just
 *  moving an already-self-contained cluster of state out of the
 *  orchestrator. */
export class GhostSession {
  runner = new CourseRunner();
  copilot: CopilotSession;
  private recorder = new GhostRecorder();
  private player: GhostPlayer | null = null;
  private visual: GhostVisual;
  private hud = new CourseHUD();
  private lastResults: ResultsData | null = null;

  constructor(scene: THREE.Scene) {
    this.visual = new GhostVisual(scene);
    this.copilot = new CopilotSession(scene);
    this.hud.onDownloadResults = () => {
      if (this.lastResults) shareOrDownloadResults(this.lastResults, `driftdock-${this.lastResults.course.id}-results.png`);
    };
    // A shared #ghost=<id>:<data> link auto-selects that course and loads
    // the embedded ghost even if it isn't the local player's own best;
    // otherwise course 1 + this browser's own best ghost for it (if any).
    const shared = parseSharedGhost();
    if (shared) {
      this.runner.select(shared.courseIndex);
      this.player = GhostPlayer.fromEncoded(shared.encoded);
    } else {
      this.runner.select(0);
      this.loadOwnGhost();
    }
    this.copilot.setCourse(this.runner.course);
    addEventListener("keydown", (e) => {
      if (e.code === "Digit0") {
        this.runner.selectDaily(buildDailyCourse());
        this.recorder.reset();
        this.loadOwnGhost();
        this.copilot.setCourse(this.runner.course);
        return;
      }
      const m = e.code.match(/^Digit([1-5])$/);
      if (!m) return;
      this.runner.select(+m[1] - 1);
      this.recorder.reset();
      this.loadOwnGhost();
      this.copilot.setCourse(this.runner.course);
    });
  }

  get lockStabilize() {
    return !!this.runner.course.lockStabilize;
  }

  private loadOwnGhost() {
    const encoded = SaveState.bestGhost(this.runner.course.id);
    this.player = encoded ? GhostPlayer.fromEncoded(encoded) : null;
  }

  /** Returns a magnetism impulse (see CopilotSession) for main.ts to apply
   *  to the drone body, or null. */
  update(dt: number, dronePos: THREE.Vector3, drone: Drone, speed: number): THREE.Vector3 | null {
    const justFinished = this.runner.update(dt, dronePos);
    const racing = this.runner.state === "RACING";
    if (racing) this.recorder.tick(dt, dronePos, drone.mesh.quaternion);
    if (justFinished) this.onFinish(drone);
    this.hud.update(this.runner, SaveState.bestTime(this.runner.course.id), this.copilot.status);
    this.visual.update(this.player, this.runner.elapsed, racing);
    return this.copilot.update(dt, dronePos, speed, drone, racing);
  }

  private onFinish(drone: Drone) {
    const samples: GhostSample[] = this.recorder.samplesSnapshot(),
      encoded = this.recorder.encode(),
      isBest = SaveState.recordIfBest(this.runner.course.id, this.runner.lastTime, encoded);
    if (isBest) {
      shareGhostLink(this.runner.course.id, encoded);
      this.loadOwnGhost();
    }

    let shareText: string | undefined;
    if (this.runner.isDaily) {
      SaveState.recordDailyPlayed();
      const streak = SaveState.dailyStreak();
      shareText = `DRIFT/DOCK #${dailyNumber()} — ${formatTime(this.runner.lastTime)} · sync ${this.copilot.status === "ACCEPTED" ? this.copilot.syncPercent.toFixed(0) : "--"}% · rotors ${drone.damage.aliveCount()}/4 · streak ${streak}`;
    }

    this.lastResults = {
      course: this.runner.course,
      medal: this.runner.lastMedal!,
      time: this.runner.lastTime,
      syncPercent: this.copilot.syncPercent,
      divergences: this.copilot.divergenceCount,
      playerSamples: samples,
      copilotLine: this.copilot.status === "ACCEPTED" ? this.copilot.linePoints : null,
      divergencePoints: this.copilot.divergencePoints.slice(),
    };

    this.hud.showMedal(this.runner.lastMedal!, this.runner.lastTime, isBest, this.copilot.status, this.copilot.syncPercent, this.copilot.divergenceCount, shareText);
    this.recorder.reset();
    this.copilot.setCourse(this.runner.course); // fresh line + reset sync tracking for the next attempt
  }
}

function formatTime(s: number) {
  const m = Math.floor(s / 60),
    sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}
