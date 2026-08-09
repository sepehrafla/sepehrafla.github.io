import type { MoonBaseState } from "../world/MoonBase";

const PHASE_LABEL: Record<string, string> = {
  OFF: "",
  SEEK_RESOURCE: "AI: seeking resource",
  MINE: "AI: mining",
  SEEK_BASE: "AI: returning to base",
  DELIVER: "AI: delivering",
};

/** Resource count / base progress / AI status. Pure DOM updates, same
 *  pattern as CourseHUD/DockingOverlay. Only shown while Moon Base mode
 *  is active (main.ts toggles the .hide class). */
export class MoonBaseHUD {
  private root = document.querySelector<HTMLElement>("#moonbase-hud")!;
  private carriedEl = document.querySelector<HTMLElement>("#mb-carried")!;
  private deliveredEl = document.querySelector<HTMLElement>("#mb-delivered")!;
  private aiEl = document.querySelector<HTMLElement>("#mb-ai")!;

  show() {
    this.root.classList.remove("hide");
  }

  hide() {
    this.root.classList.add("hide");
  }

  update(state: MoonBaseState) {
    this.carriedEl.textContent = `${state.carried}/3`;
    this.deliveredEl.textContent = `${state.delivered}/${state.totalResources}`;
    this.aiEl.textContent = PHASE_LABEL[state.aiPhase] ?? "";
    this.aiEl.className = state.aiEngaged ? "mb-ai active" : "mb-ai";
  }
}
