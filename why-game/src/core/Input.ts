export class Input {
  keys = new Set<string>();
  gas = false;
  brake = false;
  left = false;
  right = false;
  release?: number;
  constructor(canvas: HTMLCanvasElement) {
    addEventListener("keydown", (event) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyZ", "KeyX"].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      this.read();
    }, { passive: false });
    addEventListener("keyup", (event) => { this.keys.delete(event.code); this.read(); });
    canvas.addEventListener("pointerdown", (event) => { clearTimeout(this.release); canvas.setPointerCapture(event.pointerId); this.touch(event, canvas); });
    canvas.addEventListener("pointermove", (event) => { if (event.buttons) this.touch(event, canvas); });
    canvas.addEventListener("pointerup", (event) => {
      canvas.releasePointerCapture(event.pointerId);
      this.release = window.setTimeout(() => { this.gas = this.brake = this.left = this.right = false; }, 260);
    });
    addEventListener("blur", () => { this.keys.clear(); this.read(); });
  }
  read() {
    this.gas = this.keys.has("ArrowUp") || this.keys.has("KeyX");
    this.brake = this.keys.has("ArrowDown");
    this.left = this.keys.has("ArrowLeft") || this.keys.has("KeyZ");
    this.right = this.keys.has("ArrowRight");
  }
  touch(event: PointerEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    this.left = x < .5 && y > .5;
    this.right = x < .5 && y <= .5;
    this.gas = x >= .5 && y > .5;
    this.brake = x >= .5 && y <= .5;
  }
}
