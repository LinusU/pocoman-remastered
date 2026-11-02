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
