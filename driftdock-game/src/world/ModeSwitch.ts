import type { MoonBaseState } from "./MoonBase";
import type { MoonBaseHUD } from "../hud/MoonBaseHUD";

export type Mode = "race" | "moonbase";

/** Race <-> Moon Base mode toggle (M), AI autopilot toggle (V, Moon Base
 *  only), and dropping back to race mode on any course/daily key --
 *  extracted out of main.ts purely to keep it under the brief's 300-line
 *  rule; this is UI-routing, not game logic, so it's a thin, honest split. */
export class ModeSwitch {
  mode: Mode = "race";

  constructor(private moonBase: MoonBaseState, private moonBaseHUD: MoonBaseHUD, private courseHudEl: HTMLElement) {
    addEventListener("keydown", (e) => {
      if (e.code === "KeyM") this.set(this.mode === "race" ? "moonbase" : "race");
      else if (e.code === "KeyV" && this.mode === "moonbase") this.moonBase.toggleAI();
      else if (/^Digit[0-5]$/.test(e.code)) this.set("race");
    });
  }

  private set(next: Mode) {
    this.mode = next;
    this.moonBaseHUD[this.mode === "moonbase" ? "show" : "hide"]();
    this.courseHudEl.classList.toggle("hide", this.mode === "moonbase");
  }
}
