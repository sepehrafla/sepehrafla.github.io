import type { MoonBaseState } from "../world/MoonBase";

const PHASE_LABEL: Record<string, string> = {
  OFF: "MANUAL",
  SCAN: "AI: scanning...",
  SEEK_RESOURCE: "AI: en route to node",
  MINE: "AI: mining",
  SEEK_BASE: "AI: returning to base",
  DELIVER: "AI: delivering cargo",
};

/** Resource count / base progress / AI status + a rolling narration log of
 *  what the AI just decided -- "show how AI is helping" means the player
 *  needs to be able to read its decisions, not just see it move. Pure DOM
 *  updates, same pattern as the rest of this project's HUD modules. */
export class MoonBaseHUD {
  private carriedEl = document.querySelector<HTMLElement>("#mb-carried")!;
  private deliveredEl = document.querySelector<HTMLElement>("#mb-delivered")!;
  private barEl = document.querySelector<HTMLElement>("#mb-bar-fill")!;
  private aiEl = document.querySelector<HTMLElement>("#mb-ai")!;
  private logEl = document.querySelector<HTMLElement>("#mb-log")!;
  private lastLogTime = -1;

  update(state: MoonBaseState) {
    this.carriedEl.textContent = `${state.carried}/${3}`;
    this.deliveredEl.textContent = `${state.delivered}/${state.finalTarget}`;
    this.barEl.style.width = `${Math.min(100, (state.delivered / state.finalTarget) * 100)}%`;
    this.aiEl.textContent = PHASE_LABEL[state.aiPhase] ?? "";
    this.aiEl.className = state.aiEngaged ? "mb-ai active" : "mb-ai";

    // Only touch the DOM list when the log actually changed -- narration
    // entries are pushed on state transitions, not every frame. Keyed on
    // the newest entry's timestamp, not the array length: length alone
    // would stop detecting changes forever once the log fills to its
    // 5-entry cap and every push is matched by a pop.
    const newestTime = state.narration[0]?.t ?? -1;
    if (newestTime === this.lastLogTime) return;
    this.lastLogTime = newestTime;
    this.logEl.innerHTML = state.narration.map((n, i) => `<div class="mb-log-line" style="opacity:${1 - i * 0.18}">${n.text}</div>`).join("");
  }
}
