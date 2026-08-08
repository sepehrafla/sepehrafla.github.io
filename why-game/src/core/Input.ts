export class Input {
  keys = new Set<string>();
  gas = false;
  brake = false;
  left = false;
  right = false;
  release?: number;
  /** Edge-triggered: true for one read after the pin-toggle key/button fires.
   *  Consume with consumeToggle() so a held key doesn't retrigger every frame. */
  togglePin = false;
  constructor(canvas: HTMLCanvasElement) {
    addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyZ", "KeyX"].includes(event.code)) event.preventDefault();
      if (event.code === "KeyC" && !this.keys.has("KeyC")) this.togglePin = true;
      this.keys.add(event.code);
      this.read();
    }, { passive: false });
    addEventListener("keyup", (event) => { this.keys.delete(event.code); this.read(); });
    canvas.addEventListener("pointerdown", (event) => {
      clearTimeout(this.release);
      try { canvas.setPointerCapture(event.pointerId); } catch { /* some mobile browsers reject capture on rapid re-taps */ }
      this.touch(event, canvas);
    });
    canvas.addEventListener("pointermove", (event) => { if (event.buttons) this.touch(event, canvas); });
    const clearTouch = (event: PointerEvent) => {
      try { canvas.releasePointerCapture(event.pointerId); } catch { /* capture may already be gone, e.g. after pointercancel */ }
      this.release = window.setTimeout(() => { this.gas = this.brake = this.left = this.right = false; }, 260);
    };
    canvas.addEventListener("pointerup", clearTouch);
    // iOS Safari fires pointercancel instead of pointerup when a system gesture or
    // focus change interrupts the touch -- without this, inputs could stick on.
    canvas.addEventListener("pointercancel", clearTouch);
    addEventListener("blur", () => { this.keys.clear(); this.read(); });
  }
  read() {
    this.gas = this.keys.has("ArrowUp") || this.keys.has("KeyX");
    this.brake = this.keys.has("ArrowDown");
    this.left = this.keys.has("ArrowLeft") || this.keys.has("KeyZ");
    this.right = this.keys.has("ArrowRight");
  }
  consumeToggle() {
    const v = this.togglePin;
    this.togglePin = false;
    return v;
  }
  touch(event: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    this.left = x < .5 && y > .5;
    this.right = x < .5 && y <= .5;
    this.gas = x >= .5 && y > .5;
    this.brake = x >= .5 && y <= .5;
  }
}
