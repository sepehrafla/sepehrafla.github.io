import type { PoseError } from "../world/Gates";

/** ISS-style alignment readout, per the brief: "lateral error crosshair,
 *  closure rate number (green <0.4, amber <1.0, red above), attitude error
 *  degrees, distance." Fades in near a dock, stays out of the way in flow
 *  sections otherwise. Pure DOM updates -- no THREE/Rapier here. */
export class DockingOverlay {
  private root: HTMLElement;
  private crosshair: HTMLElement;
  private closure: HTMLElement;
  private attitude: HTMLElement;
  private distance: HTMLElement;
  private status: HTMLElement;

  constructor() {
    this.root = document.querySelector<HTMLElement>("#dock-overlay")!;
    this.crosshair = document.querySelector<HTMLElement>("#dock-crosshair")!;
    this.closure = document.querySelector<HTMLElement>("#dock-closure")!;
    this.attitude = document.querySelector<HTMLElement>("#dock-attitude")!;
    this.distance = document.querySelector<HTMLElement>("#dock-distance")!;
    this.status = document.querySelector<HTMLElement>("#dock-status")!;
  }

  hide() {
    this.root.classList.add("hide");
  }

  /** holdProgress: 0..1, how far through the continuous-tolerance hold
   *  window (see Tuning.dockHoldTime) the pilot currently is. docked: true
   *  once the hold has actually completed. */
  update(e: PoseError, holdProgress: number, docked: boolean) {
    this.root.classList.remove("hide");
    // Crosshair offset: clamp to the overlay's visible radius so a wildly
    // off-axis approach still shows "which way to correct" instead of
    // flying off past the edge of the readout.
    const px = clamp(e.lateralError.x * 40, -70, 70),
      py = clamp(-e.lateralError.y * 40, -70, 70);
    this.crosshair.style.transform = `translate(${px}px, ${py}px)`;

    const closureAbs = Math.abs(e.closureRate);
    this.closure.textContent = e.closureRate.toFixed(2);
    this.closure.className = closureAbs < 0.4 ? "good" : closureAbs < 1.0 ? "warn" : "bad";
    this.attitude.textContent = e.attitudeErrorDeg.toFixed(0);
    this.attitude.className = e.attitudeErrorDeg < 10 ? "good" : e.attitudeErrorDeg < 25 ? "warn" : "bad";
    this.distance.textContent = e.positionError.toFixed(1);

    if (docked) {
      this.status.textContent = "DOCKED";
      this.status.className = "docked";
    } else if (holdProgress > 0) {
      this.status.textContent = `HOLDING ${Math.round(holdProgress * 100)}%`;
      this.status.className = "holding";
    } else {
      this.status.textContent = "";
      this.status.className = "";
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
