/** Keyboard and mouse state. Gameplay polls it; menu keys are delivered through `onKey`. */
export class Input {
  /** Called for every key press (once, not on auto-repeat). Used for Tab / Esc. */
  onKey: ((code: string) => void) | null = null;
  /** Called when the browser takes pointer lock away (the player pressed Esc). */
  onLockLost: (() => void) | null = null;

  mouseDX = 0;
  mouseDY = 0;
  locked = false;

  private canvas: HTMLCanvasElement;
  private down = new Set<string>();
  private pressed = new Set<string>();
  private expectUnlock = false;
  private disposers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const listen = <K extends keyof DocumentEventMap>(
      target: Document | Window | HTMLElement,
      type: K,
      fn: (e: DocumentEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn as EventListener);
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };

    listen(window, 'keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      this.onKey?.(e.code);
    });
    listen(window, 'keyup', (e) => this.down.delete(e.code));
    listen(canvas, 'mousedown', (e) => {
      const code = `Mouse${e.button}`;
      this.down.add(code);
      this.pressed.add(code);
    });
    listen(window, 'mouseup', (e) => this.down.delete(`Mouse${e.button}`));
    listen(canvas, 'contextmenu', (e) => e.preventDefault());
    listen(document, 'mousemove', (e) => {
      // Without pointer lock (refused or unavailable), dragging with a button held still orbits.
      if (this.locked || this.down.has('Mouse0') || this.down.has('Mouse2')) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    listen(document, 'pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked) {
        this.clear();
        if (!this.expectUnlock) this.onLockLost?.();
      }
      this.expectUnlock = false;
    });
    listen(document, 'pointerlockerror', () => {
      this.locked = false;
    });
    listen(window, 'blur', () => this.clear());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once per key press. */
  consume(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** Forget presses nobody consumed this step. */
  endStep(): void {
    this.pressed.clear();
  }

  takeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  clear(): void {
    this.down.clear();
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }

  /** Pointer lock can be refused (no user gesture, headless browser). That must never throw. */
  requestLock(): void {
    if (this.locked) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => {});
    } catch {
      // Ignored: the game stays playable with drag-to-orbit.
    }
  }

  /** Release the pointer on purpose (opening a menu) without triggering the pause handler. */
  releaseLock(): void {
    if (!this.locked) return;
    this.expectUnlock = true;
    try {
      document.exitPointerLock();
    } catch {
      this.expectUnlock = false;
    }
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
  }
}
