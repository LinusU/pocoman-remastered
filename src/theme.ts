import { Graphics } from 'pixi.js';

// Shared look for the canvas HUD; ui.css mirrors it for the HTML menus.
export const UI_FONT = 'Fredoka, Nunito, system-ui, sans-serif';

/** A dark glass panel with a thin, cool outline. */
export function panel(w: number, h: number): Graphics {
  return new Graphics()
    .roundRect(0, 0, w, h, 12)
    .fill({ color: 0x0b1030, alpha: 0.72 })
    .stroke({ color: 0x9fb0e8, width: 1.5, alpha: 0.35 });
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLElement | null = null;

/** Space taken by the notch, rounded corners and home bar on phones, in CSS
 *  pixels; zero elsewhere. Only CSS can read these, so a hidden element
 *  carries them as padding. */
export function safeArea(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:'
      + 'env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
}
