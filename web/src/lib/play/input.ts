/**
 * Reads the keyboard and any connected game controller (standard mapping: Xbox, PlayStation and
 * most USB/Bluetooth pads) and turns them into one PlayInput per simulation tick.
 * Browser-only.
 *
 *            Controller            Keyboard
 *  Move      Left stick / D-pad    WASD or arrow keys
 *  Pass      A / Cross             J or Space
 *  Shoot     B / Circle (hold)     K (hold)   — without the ball: tackle
 *  Through   X / Square            L
 *  Switch    Y / Triangle, LB      I or Q
 *  Sprint    RT / R2, RB           Shift
 *  Pause     Start / Options       Esc or P
 */
import { NO_INPUT, type PlayInput } from "./types";

const DEADZONE = 0.22;
const KEYS = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  pass: ["KeyJ", "Space"],
  shoot: ["KeyK"],
  through: ["KeyL"],
  switch: ["KeyI", "KeyQ"],
  sprint: ["ShiftLeft", "ShiftRight"],
  pause: ["Escape", "KeyP"],
} as const;
const GAME_KEYS = new Set<string>(Object.values(KEYS).flat());

type Buttons = { pass: boolean; shoot: boolean; through: boolean; switch: boolean; sprint: boolean; pause: boolean };

export type InputSource = "keyboard" | "controller";

export class PlayControls {
  private keys = new Set<string>();
  private prev: Buttons = { pass: false, shoot: false, through: false, switch: false, sprint: false, pause: false };
  // Presses are latched the moment they happen, so even a tap shorter than a frame counts.
  private latched = { pass: false, through: false, switch: false, pause: false, shoot: false };
  lastSource: InputSource = "keyboard";
  controllerName: string | null = null;

  private onDown = (e: KeyboardEvent) => {
    if (!GAME_KEYS.has(e.code)) return;
    e.preventDefault(); // no page scrolling with Space / arrows
    this.keys.add(e.code);
    this.lastSource = "keyboard";
    if (e.repeat) return;
    const is = (list: readonly string[]) => list.includes(e.code);
    if (is(KEYS.pass)) this.latched.pass = true;
    if (is(KEYS.through)) this.latched.through = true;
    if (is(KEYS.switch)) this.latched.switch = true;
    if (is(KEYS.pause)) this.latched.pause = true;
    if (is(KEYS.shoot)) this.latched.shoot = true;
  };
  private onUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();

  attach() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
  }

  private key(list: readonly string[]) {
    return list.some((k) => this.keys.has(k));
  }

  private pad(): Gamepad | null {
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /**
   * Call once per animation frame. Button presses are latched until `take()` hands them to
   * the next simulation tick, so a quick tap is never lost between frames.
   */
  poll(): { pausePressed: boolean } {
    const pad = this.pad();
    this.controllerName = pad ? pad.id : null;
    const b = (i: number, threshold = 0.5) => Boolean(pad && pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > threshold));
    const now: Buttons = {
      pass: this.key(KEYS.pass) || b(0),
      shoot: this.key(KEYS.shoot) || b(1),
      through: this.key(KEYS.through) || b(2),
      switch: this.key(KEYS.switch) || b(3) || b(4),
      sprint: this.key(KEYS.sprint) || b(7, 0.3) || b(5),
      pause: this.key(KEYS.pause) || b(9),
    };
    if (pad && (pad.buttons.some((x) => x.pressed) || Math.abs(pad.axes[0] ?? 0) > DEADZONE || Math.abs(pad.axes[1] ?? 0) > DEADZONE)) {
      this.lastSource = "controller";
    }
    if (now.pass && !this.prev.pass) this.latched.pass = true;
    if (now.through && !this.prev.through) this.latched.through = true;
    if (now.switch && !this.prev.switch) this.latched.switch = true;
    if (now.shoot && !this.prev.shoot) this.latched.shoot = true;
    const pausePressed = this.latched.pause || (now.pause && !this.prev.pause);
    this.latched.pause = false;
    this.prev = now;
    return { pausePressed };
  }

  /** The input for the next simulation tick (consumes latched presses). */
  take(): PlayInput {
    const pad = this.pad();
    let mx = 0, my = 0;
    if (this.key(KEYS.left)) mx -= 1;
    if (this.key(KEYS.right)) mx += 1;
    if (this.key(KEYS.up)) my -= 1;
    if (this.key(KEYS.down)) my += 1;
    if (pad) {
      const ax = pad.axes[0] ?? 0, ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > DEADZONE || Math.abs(ay) > DEADZONE) { mx = ax; my = ay; }
      if (pad.buttons[14]?.pressed) mx = -1;
      if (pad.buttons[15]?.pressed) mx = 1;
      if (pad.buttons[12]?.pressed) my = -1;
      if (pad.buttons[13]?.pressed) my = 1;
    }
    const input: PlayInput = {
      ...NO_INPUT,
      moveX: mx,
      moveY: my,
      sprint: this.prev.sprint,
      shootHeld: this.prev.shoot || this.latched.shoot, // a quick tap still registers for one tick
      pass: this.latched.pass,
      through: this.latched.through,
      switchPlayer: this.latched.switch,
    };
    this.latched.pass = this.latched.through = this.latched.switch = this.latched.shoot = false;
    return input;
  }

  /** True while any game button is held (used to dismiss overlays). */
  anyAction(): boolean {
    return this.prev.pass || this.prev.shoot || this.prev.through;
  }
}
