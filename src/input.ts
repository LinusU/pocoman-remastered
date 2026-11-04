import type { Dir } from './game';

export type InputSource = 'keyboard' | 'gamepad' | 'touch';
/** `game` drives PocoMan; `menu` drives menus (navigation, confirm, back). */
export type InputMode = 'game' | 'menu';
export type Action =
  | 'undo' | 'restart' | 'confirm' | 'back' | 'pause'
  | 'nextLevel' | 'prevLevel' | 'toggleMusic';

export interface Intent {
  /** Direction currently held, if any. */
  dir: Dir | null;
  source: InputSource;
  /** 0..1, how far the stick is pushed past the dead zone (1 for keys and d-pad). */
  strength: number;
}

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

// Standard gamepad mapping (Xbox layout).
const BUTTON = { a: 0, b: 1, y: 3, lb: 4, rb: 5, view: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };

// The stick must pass STICK_ENGAGE to start moving but only fall below
// STICK_RELEASE to stop, so resting near the edge doesn't flicker.
const STICK_ENGAGE = 0.5;
const STICK_RELEASE = 0.3;
// The other axis must beat the current one by this factor before the
// direction switches, so diagonals don't jitter between two directions.
const AXIS_SWITCH_BIAS = 1.35;
const UNDO_REPEAT_DELAY_MS = 400;
const UNDO_REPEAT_MS = 150;
// Holding a direction in a menu repeats after a pause.
const NAV_REPEAT_DELAY_MS = 380;
const NAV_REPEAT_MS = 110;
// Restarting or switching level throws away progress, so those need a
// deliberate hold.
const HOLD_ACTIONS: { button: number; action: Action; ms: number }[] = [
  { button: BUTTON.view, action: 'restart', ms: 700 },
  { button: BUTTON.lb, action: 'prevLevel', ms: 500 },
  { button: BUTTON.rb, action: 'nextLevel', ms: 500 },
];

const isTyping = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement && el.type === 'text';
};

/** Merges keyboard and gamepad into directional intent, menu navigation and actions. */
export class Input {
  mode: InputMode = 'menu';
  gamepadConnected = false;
  /** Set on any key, touch or button, so hints can follow the device in use.
   *  A mouse click counts as keyboard: the two go together. */
  lastSource: InputSource = 'keyboard';

  private held: Dir[] = [];
  private taps: Dir[] = [];
  private navs: Dir[] = [];
  private actions: Action[] = [];
  private padDir: Dir | null = null;
  private padStrength = 0;
  private prevButtons: boolean[] = [];
  private padIndex = -1;
  private padSeen = new Map<number, { buttons: boolean[]; pushed: boolean[] }>();
  private undoHeldMs = 0;
  private undoRepeatMs = 0;
  private navHeldMs = 0;
  private holdMs = new Map<number, number>();

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (isTyping()) return;
      this.lastSource = 'keyboard';
      const dir = KEY_DIRS[e.code];
      if (dir) {
        e.preventDefault();
        if (this.mode === 'menu') {
          this.navs.push(dir);
        } else if (!e.repeat) {
          // Taps made mid-step are buffered so quick presses aren't lost.
          if (this.taps.length < 3) this.taps.push(dir);
          if (!this.held.includes(dir)) this.held.push(dir);
        }
        return;
      }
      if (e.repeat && e.code !== 'KeyZ') return;
      const action = this.keyAction(e.code);
      if (action) {
        e.preventDefault();
        this.actions.push(action);
      }
    });
    window.addEventListener('keyup', (e) => {
      const dir = KEY_DIRS[e.code];
      if (dir && this.held.includes(dir)) this.held.splice(this.held.indexOf(dir), 1);
    });
    window.addEventListener('pointerdown', (e) => (this.lastSource = e.pointerType === 'touch' ? 'touch' : 'keyboard'));
    window.addEventListener('blur', () => (this.held.length = 0));
  }

  private keyAction(code: string): Action | null {
    if (code === 'Enter' || code === 'Space') return 'confirm';
    if (this.mode === 'menu') return code === 'Escape' || code === 'Backspace' ? 'back' : null;
    switch (code) {
      case 'Escape': return 'pause';
      case 'KeyZ': case 'Backspace': return 'undo';
      case 'KeyR': return 'restart';
      case 'KeyN': case 'PageDown': return 'nextLevel';
      case 'KeyP': case 'PageUp': return 'prevLevel';
      case 'KeyM': return 'toggleMusic';
      default: return null;
    }
  }

  setMode(mode: InputMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.flush();
    this.held.length = 0;
  }

  /** Drops queued presses, so one meant for the last screen can't act on the next. */
  flush(): void {
    this.taps.length = 0;
    this.navs.length = 0;
    this.actions.length = 0;
  }

  /** Polls the gamepad; call once per frame. */
  update(dtMs: number): void {
    const pad = this.activePad();
    this.gamepadConnected = !!pad;
    if (!pad) {
      this.padDir = null;
      return;
    }
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const justPressed = (i: number) => pressed(i) && !this.prevButtons[i];
    if (pad.buttons.some((b, i) => b.pressed && !this.prevButtons[i])) this.lastSource = 'gamepad';

    const before = this.padDir;
    this.readDirection(pad, pressed);
    if (this.padDir && this.padDir !== before) this.lastSource = 'gamepad';

    if (this.mode === 'menu') {
      this.updateMenuPad(dtMs, before, justPressed);
    } else {
      this.updateGamePad(dtMs, pressed, justPressed);
    }
    this.prevButtons = pad.buttons.map((b) => b.pressed);
  }

  /**
   * The pad that was used last. Browsers also list other devices as
   * gamepads (receivers, virtual pads), sometimes ahead of the real one, so
   * the first in the list isn't necessarily the one in your hands. A device
   * that sits with a stick or button stuck on never counts as being used:
   * only a button going down or a stick being pushed out does. Until some
   * pad is used, none is followed.
   */
  private activePad(): Gamepad | null {
    const pads = [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => !!p?.connected);
    for (const pad of pads) {
      const seen = this.padSeen.get(pad.index);
      const pushed = pad.axes.slice(0, 2).map((a) => Math.abs(a) > STICK_ENGAGE);
      // A pad first shows up when one of its buttons is pressed, so that
      // press counts; a stick that's already pushed out doesn't.
      const used = pad.buttons.some((b, i) => b.pressed && !seen?.buttons[i])
        || (!!seen && pushed.some((p, i) => p && !seen.pushed[i]));
      this.padSeen.set(pad.index, { buttons: pad.buttons.map((b) => b.pressed), pushed });
      if (used && pad.index !== this.padIndex) {
        this.padIndex = pad.index;
        // Its buttons were up on the pad being followed until now.
        this.prevButtons = [];
      }
    }
    return pads.find((p) => p.index === this.padIndex) ?? null;
  }

  private updateMenuPad(dtMs: number, before: Dir | null, justPressed: (i: number) => boolean): void {
    if (this.padDir && this.padDir !== before) {
      this.navs.push(this.padDir);
      this.navHeldMs = 0;
    } else if (this.padDir) {
      const prev = this.navHeldMs;
      this.navHeldMs += dtMs;
      if (this.navHeldMs > NAV_REPEAT_DELAY_MS) {
        const ticks = Math.floor((this.navHeldMs - NAV_REPEAT_DELAY_MS) / NAV_REPEAT_MS);
        const prevTicks = prev > NAV_REPEAT_DELAY_MS ? Math.floor((prev - NAV_REPEAT_DELAY_MS) / NAV_REPEAT_MS) : -1;
        if (ticks > prevTicks) this.navs.push(this.padDir);
      }
    }
    if (justPressed(BUTTON.a)) this.actions.push('confirm');
    if (justPressed(BUTTON.b) || justPressed(BUTTON.start)) this.actions.push('back');
  }

  private updateGamePad(dtMs: number, pressed: (i: number) => boolean, justPressed: (i: number) => boolean): void {
    if (justPressed(BUTTON.a)) this.actions.push('confirm');
    if (justPressed(BUTTON.y)) this.actions.push('toggleMusic');
    if (justPressed(BUTTON.start)) this.actions.push('pause');

    if (justPressed(BUTTON.b)) {
      this.actions.push('undo');
      this.undoHeldMs = 0;
      this.undoRepeatMs = 0;
    } else if (pressed(BUTTON.b)) {
      this.undoHeldMs += dtMs;
      if (this.undoHeldMs > UNDO_REPEAT_DELAY_MS) {
        this.undoRepeatMs += dtMs;
        if (this.undoRepeatMs >= UNDO_REPEAT_MS) {
          this.undoRepeatMs -= UNDO_REPEAT_MS;
          this.actions.push('undo');
        }
      }
    }

    for (const { button, action, ms } of HOLD_ACTIONS) {
      const prev = this.holdMs.get(button) ?? 0;
      const next = pressed(button) ? prev + dtMs : 0;
      if (prev < ms && next >= ms) this.actions.push(action);
      this.holdMs.set(button, next);
    }
  }

  private readDirection(pad: Gamepad, pressed: (i: number) => boolean): void {
    // The d-pad wins over the stick and always counts as full strength.
    const dpad: Dir | null = pressed(BUTTON.up) ? 'up' : pressed(BUTTON.down) ? 'down'
      : pressed(BUTTON.left) ? 'left' : pressed(BUTTON.right) ? 'right' : null;
    if (dpad) {
      this.padDir = dpad;
      this.padStrength = 1;
      return;
    }

    const x = pad.axes[0] ?? 0;
    const y = pad.axes[1] ?? 0;
    const mag = Math.min(1, Math.hypot(x, y));
    if (mag < (this.padDir ? STICK_RELEASE : STICK_ENGAGE)) {
      this.padDir = null;
      this.padStrength = 0;
      return;
    }
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const wasHorizontal = this.padDir === 'left' || this.padDir === 'right';
    const wasVertical = this.padDir === 'up' || this.padDir === 'down';
    let horizontal = ax >= ay;
    if (wasHorizontal) horizontal = !(ay > ax * AXIS_SWITCH_BIAS);
    if (wasVertical) horizontal = ax > ay * AXIS_SWITCH_BIAS;
    this.padDir = horizontal ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down';
    this.padStrength = Math.min(1, (mag - STICK_RELEASE) / (0.95 - STICK_RELEASE));
  }

  current(): Intent {
    if (this.mode !== 'game') return { dir: null, source: 'keyboard', strength: 0 };
    if (this.padDir) return { dir: this.padDir, source: 'gamepad', strength: this.padStrength };
    return { dir: this.held[this.held.length - 1] ?? null, source: 'keyboard', strength: 1 };
  }

  takeTap(): Dir | undefined {
    return this.taps.shift();
  }

  takeNav(): Dir | undefined {
    return this.navs.shift();
  }

  takeAction(): Action | undefined {
    return this.actions.shift();
  }

  /** A swipe on the board: one step, buffered like a tapped key. */
  swipe(dir: Dir): void {
    if (this.mode === 'game' && this.taps.length < 3) this.taps.push(dir);
  }

  clearTaps(): void {
    this.taps.length = 0;
  }
}
