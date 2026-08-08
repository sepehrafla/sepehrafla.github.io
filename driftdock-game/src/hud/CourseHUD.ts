import type { CourseRunner, Medal } from "../world/Course";
import type { CopilotStatus } from "../copilot/CopilotSession";

const COPILOT_LABEL: Record<CopilotStatus, string> = {
  LOCKED: "",
  AVAILABLE: "COPILOT AVAILABLE -- [C] accept",
  ACCEPTED: "COPILOT ACCEPTED -- [C] decline",
  DECLINED: "COPILOT DECLINED -- [C] accept",
};

/** Course name/gate/timer/best readout, the copilot status line, and the
 *  medal splash on finish (with a Results-PNG download/share button).
 *  Pure DOM updates, same pattern as DockingOverlay.ts. */
export class CourseHUD {
  private nameEl = document.querySelector<HTMLElement>("#course-name")!;
  private gateEl = document.querySelector<HTMLElement>("#course-gate")!;
  private timerEl = document.querySelector<HTMLElement>("#course-timer")!;
  private bestEl = document.querySelector<HTMLElement>("#course-best")!;
  private copilotEl = document.querySelector<HTMLElement>("#course-copilot")!;
  private splash = document.querySelector<HTMLElement>("#medal-splash")!;
  private splashTimer: ReturnType<typeof setTimeout> | null = null;
  /** Set by GhostSession -- called when the results button is clicked. */
  onDownloadResults?: () => void;

  constructor() {
    this.splash.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".medal-download")) this.onDownloadResults?.();
    });
  }

  update(runner: CourseRunner, bestTime: number | undefined, copilotStatus: CopilotStatus) {
    this.nameEl.textContent = runner.isDaily ? runner.course.name : `${runner.courseIndex + 1} · ${runner.course.name}`;
    const gateNum = Math.min(runner.gateIndex + 1, runner.course.gates.length);
    this.gateEl.textContent = runner.state === "FINISHED" ? "FINISHED" : `GATE ${gateNum}/${runner.course.gates.length}`;
    this.timerEl.textContent = formatTime(runner.elapsed);
    this.bestEl.textContent = bestTime !== undefined ? `best: ${formatTime(bestTime)}` : "no best time yet";
    this.copilotEl.textContent = COPILOT_LABEL[copilotStatus];
    this.copilotEl.className = `course-copilot ${copilotStatus.toLowerCase()}`;
  }

  showMedal(medal: Medal, time: number, isNewBest: boolean, copilotStatus: CopilotStatus, syncPercent: number, divergences: number, shareText?: string) {
    const cls = medal.toLowerCase(),
      // Milestone 7: only show sync%/divergences when the copilot was
      // actually accepted this run -- otherwise the numbers are meaningless
      // (0% synced isn't "you failed," it's "you never engaged").
      copilotLine =
        copilotStatus === "ACCEPTED"
          ? `<div class="medal-copilot">sync ${syncPercent.toFixed(0)}% &middot; ${divergences} divergence${divergences === 1 ? "" : "s"}</div>`
          : "",
      shareLine = shareText ? `<div class="medal-share">${shareText}</div>` : "";
    this.splash.innerHTML = `
      <div class="medal ${cls}">${medal}</div>
      <div class="medal-time">${formatTime(time)}</div>
      ${copilotLine}
      ${shareLine}
      <button class="medal-download" type="button">save results image</button>
      <div class="medal-hint">${isNewBest ? "new best -- ghost link copied to the URL" : "press R to retry"}</div>
    `;
    this.splash.classList.remove("hide");
    if (this.splashTimer) clearTimeout(this.splashTimer);
    this.splashTimer = setTimeout(() => this.splash.classList.add("hide"), 8000);
  }
}

function formatTime(s: number) {
  const m = Math.floor(s / 60),
    sec = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${sec}`;
}
