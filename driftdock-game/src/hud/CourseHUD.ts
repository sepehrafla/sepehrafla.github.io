import type { CourseRunner, Medal } from "../world/Course";

/** Course name/gate/timer/best readout + the medal splash on finish.
 *  Pure DOM updates, same pattern as DockingOverlay.ts. */
export class CourseHUD {
  private nameEl = document.querySelector<HTMLElement>("#course-name")!;
  private gateEl = document.querySelector<HTMLElement>("#course-gate")!;
  private timerEl = document.querySelector<HTMLElement>("#course-timer")!;
  private bestEl = document.querySelector<HTMLElement>("#course-best")!;
  private splash = document.querySelector<HTMLElement>("#medal-splash")!;
  private splashTimer: ReturnType<typeof setTimeout> | null = null;

  update(runner: CourseRunner, bestTime: number | undefined) {
    this.nameEl.textContent = `${runner.courseIndex + 1} · ${runner.course.name}`;
    const gateNum = Math.min(runner.gateIndex + 1, runner.course.gates.length);
    this.gateEl.textContent = runner.state === "FINISHED" ? "FINISHED" : `GATE ${gateNum}/${runner.course.gates.length}`;
    this.timerEl.textContent = formatTime(runner.elapsed);
    this.bestEl.textContent = bestTime !== undefined ? `best: ${formatTime(bestTime)}` : "no best time yet";
  }

  showMedal(medal: Medal, time: number, isNewBest: boolean) {
    const cls = medal.toLowerCase();
    this.splash.innerHTML = `
      <div class="medal ${cls}">${medal}</div>
      <div class="medal-time">${formatTime(time)}</div>
      <div class="medal-hint">${isNewBest ? "new best -- ghost link copied to the URL" : "press R to retry"}</div>
    `;
    this.splash.classList.remove("hide");
    if (this.splashTimer) clearTimeout(this.splashTimer);
    this.splashTimer = setTimeout(() => this.splash.classList.add("hide"), 4000);
  }
}

function formatTime(s: number) {
  const m = Math.floor(s / 60),
    sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}
