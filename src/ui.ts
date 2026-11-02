import type { SoundBank } from './audio';
import type { Dir } from './game';
import type { Input } from './input';
import './ui.css';

// HTML menus over the canvas. A View is one screen of focusable items;
// arrow keys, stick and d-pad move focus to the nearest item in that
// direction, so lists, grids and mixed layouts all navigate the same way.

const SFX = {
  move: ['assets/sfx/ui-move.mp3'],
  confirm: ['assets/sfx/ui-confirm.mp3'],
  back: ['assets/sfx/ui-back.mp3'],
};
export const UI_SOUNDS = Object.values(SFX).flat();

export interface Item {
  el: HTMLElement;
  select?: () => void;
  /** Left/right on this item adjust it (sliders, toggles) instead of moving focus. */
  adjust?: (step: -1 | 1) => void;
  disabled?: boolean;
}

export class View {
  readonly root: HTMLElement;
  items: Item[] = [];
  index = 0;
  onBack?: () => void;
  /** Called whenever focus moves, e.g. to update a details panel. */
  onFocus?: (item: Item) => void;

  constructor(className: string) {
    this.root = document.createElement('div');
    this.root.className = `view ${className}`;
  }

  /** Makes an element focusable and returns it. */
  add<T extends HTMLElement>(el: T, opts: Omit<Item, 'el'> = {}): T {
    const item: Item = { el, ...opts };
    this.items.push(item);
    el.classList.add('item');
    if (opts.disabled) el.classList.add('disabled');
    el.addEventListener('pointerenter', () => this.focus(this.items.indexOf(item)));
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.focus(this.items.indexOf(item), false);
      this.ui?.select();
    });
    return el;
  }

  ui?: Ui;

  focus(i: number, sound = true): void {
    if (i < 0 || i >= this.items.length) return;
    if (i !== this.index && sound) this.ui?.sound('move');
    this.items[this.index]?.el.classList.remove('focused');
    this.index = i;
    const el = this.items[i].el;
    el.classList.add('focused');
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.onFocus?.(this.items[i]);
  }

  /** Moves focus to the nearest item in a direction. */
  nav(dir: Dir): void {
    const current = this.items[this.index];
    if (!current) return;
    if ((dir === 'left' || dir === 'right') && current.adjust) {
      current.adjust(dir === 'left' ? -1 : 1);
      this.ui?.sound('move');
      return;
    }
    const from = current.el.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    let best = -1;
    let bestScore = Infinity;
    this.items.forEach((item, i) => {
      if (i === this.index) return;
      const r = item.el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - fx;
      const dy = r.top + r.height / 2 - fy;
      const along = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (along <= 2) return;
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) this.focus(best);
  }
}

/** Shows one View at a time and feeds it input. */
export class Ui {
  readonly layer: HTMLElement;
  current: View | null = null;

  constructor(private input: Input, private sounds: SoundBank) {
    this.layer = document.createElement('div');
    this.layer.className = 'ui-layer';
    document.body.appendChild(this.layer);
    sounds.preload(UI_SOUNDS);
  }

  sound(kind: keyof typeof SFX): void {
    this.sounds.playVariant(SFX[kind], kind === 'move' ? 0.35 : 0.55, 0.02);
  }

  show(view: View, focus = 0): void {
    const old = this.current;
    if (old) {
      old.root.classList.add('leaving');
      window.setTimeout(() => old.root.remove(), 220);
    }
    view.ui = this;
    this.current = view;
    this.layer.appendChild(view.root);
    this.input.setMode('menu');
    this.input.flush();
    // Focus once laid out, so scrolling and spatial navigation have positions.
    requestAnimationFrame(() => {
      if (this.current !== view) return;
      const first = view.items.findIndex((it, i) => i >= focus && !it.disabled);
      // The pointer may have focused something already; start from a clean slate.
      for (const it of view.items) it.el.classList.remove('focused');
      view.index = -1;
      view.focus(first >= 0 ? first : 0, false);
    });
  }

  hide(): void {
    const old = this.current;
    if (!old) return;
    old.root.classList.add('leaving');
    window.setTimeout(() => old.root.remove(), 220);
    this.current = null;
  }

  select(): void {
    const item = this.current?.items[this.current.index];
    if (!item || item.disabled || !item.select) return;
    this.sound('confirm');
    item.select();
  }

  back(): void {
    if (!this.current?.onBack) return;
    this.sound('back');
    this.current.onBack();
  }

  /** Routes menu input to the current view; call every frame while menus are up. */
  update(): void {
    const view = this.current;
    if (!view) return;
    for (let d = this.input.takeNav(); d; d = this.input.takeNav()) view.nav(d);
    for (let a = this.input.takeAction(); a; a = this.input.takeAction()) {
      if (a === 'confirm') this.select();
      if (a === 'back') this.back();
    }
  }
}

// --- Small builders ---------------------------------------------------------

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (html) e.innerHTML = html;
  return e;
}

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A menu button with an optional second line. */
export function button(view: View, label: string, select: () => void, sub = '', disabled = false): HTMLButtonElement {
  const b = el('button', 'btn', `<span class="label">${label}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`);
  return view.add(b, { select, disabled });
}

/** A volume slider adjusted with left/right (or by clicking along it). */
export function slider(view: View, label: string, get: () => number, set: (v: number) => void): HTMLElement {
  const row = el('div', 'btn slider', `<span class="label">${label}</span><span class="bar"><span class="fill"></span></span><span class="value"></span>`);
  const fill = row.querySelector<HTMLElement>('.fill')!;
  const value = row.querySelector<HTMLElement>('.value')!;
  const render = () => {
    fill.style.width = `${Math.round(get() * 100)}%`;
    value.textContent = `${Math.round(get() * 100)}%`;
  };
  const change = (v: number) => {
    set(Math.round(Math.min(1, Math.max(0, v)) * 10) / 10);
    render();
  };
  row.querySelector('.bar')!.addEventListener('click', (e) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    change(((e as MouseEvent).clientX - r.left) / r.width);
  });
  render();
  return view.add(row, { adjust: (s) => change(get() + s * 0.1), select: () => change(get() >= 1 ? 0 : get() + 0.1) });
}

/** An on/off switch; select or left/right flips it. */
export function toggle(view: View, label: string, get: () => boolean, set: (v: boolean) => void): HTMLElement {
  const row = el('div', 'btn toggle', `<span class="label">${label}</span><span class="switch"><span class="knob"></span></span>`);
  const render = () => row.classList.toggle('on', get());
  const flip = () => {
    set(!get());
    render();
  };
  render();
  return view.add(row, { select: flip, adjust: flip });
}

// --- Files -------------------------------------------------------------------

/**
 * Hands a text file to the player. Phones get the share sheet (Save to
 * Files, AirDrop and so on), since a download in a Home Screen app on an
 * iPhone opens a viewer with no way back; elsewhere it downloads.
 */
export async function saveTextFile(name: string, text: string, type = 'application/json'): Promise<void> {
  const file = new File([text], name, { type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      // Closing the share sheet is a choice, not a reason to download instead.
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Asks for a file and resolves with its text, or null if none was chosen. */
export function pickTextFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      resolve(file ? file.text() : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
