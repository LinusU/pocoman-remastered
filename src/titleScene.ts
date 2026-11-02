import { Container, Graphics } from 'pixi.js';
import { DESIGN_NAMES, designContext, OBJECT_BOX } from './objects';

// Behind the menus: PocoMan floating in space while the game's objects drift
// past at different depths.

const INK = 0x23243a;
const LINE = { color: INK, width: 3, alpha: 0.9, join: 'round' as const };

interface Drifter {
  g: Graphics;
  vx: number;
  vy: number;
  spin: number;
  depth: number;
}

/** PocoMan facing the viewer, drawn around his middle; `t` animates the cape. */
export function drawMascot(g: Graphics, t: number, wave = 0): void {
  g.clear();
  const flutter = Math.sin(t * 2.2) * 6;
  // Cape billowing out behind, as if drifting.
  g.moveTo(-26, -10).bezierCurveTo(-70, 20 + flutter, -60, 70, -30 + flutter, 86)
    .lineTo(30 - flutter, 86).bezierCurveTo(60, 70, 70, 20 - flutter, 26, -10).closePath()
    .fill(0xc8372d).stroke(LINE);
  // Legs, body, arms.
  g.roundRect(-20, 40, 16, 40, 6).fill(0x2f4fa8).stroke(LINE);
  g.roundRect(4, 40, 16, 40, 6).fill(0x2f4fa8).stroke(LINE);
  g.roundRect(-14, 76, 14, 10, 4).fill(0x8a5a32).stroke(LINE);
  g.roundRect(2, 76, 14, 10, 4).fill(0x8a5a32).stroke(LINE);
  g.roundRect(-28, -6, 56, 54, 14).fill(0x2f4fa8).stroke(LINE);
  const armUp = Math.sin(wave) * 0.5 + 0.5;
  g.moveTo(-26, 4).quadraticCurveTo(-46, 20, -44 - armUp * 8, 34 - armUp * 50).stroke({ ...LINE, width: 11 });
  g.moveTo(-26, 4).quadraticCurveTo(-46, 20, -44 - armUp * 8, 34 - armUp * 50).stroke({ color: 0x2f4fa8, width: 6, cap: 'round' });
  g.circle(-44 - armUp * 8, 34 - armUp * 50, 7).fill(0xffffff).stroke(LINE);
  g.moveTo(26, 4).quadraticCurveTo(46, 20, 44, 40).stroke({ ...LINE, width: 11 });
  g.moveTo(26, 4).quadraticCurveTo(46, 20, 44, 40).stroke({ color: 0x2f4fa8, width: 6, cap: 'round' });
  g.circle(44, 42, 7).fill(0xffffff).stroke(LINE);
  // Big round head with the classic smile.
  g.circle(0, -46, 44).fill(0xf7c531).stroke(LINE);
  g.circle(-14, -42, 12).fill({ color: 0xffffff, alpha: 0.25 });
  for (const x of [-15, 15]) {
    g.ellipse(x, -54, 9, 13).fill(0xffffff).stroke({ ...LINE, width: 2 });
    g.circle(x + 2, -52, 5).fill(INK);
    g.circle(x + 3.5, -55, 1.6).fill(0xffffff);
  }
  g.moveTo(-18, -26).quadraticCurveTo(0, -12, 18, -26).stroke({ ...LINE, width: 3.5, cap: 'round' });
  g.circle(-26, -32, 5).fill({ color: 0xe0462d, alpha: 0.35 });
  g.circle(26, -32, 5).fill({ color: 0xe0462d, alpha: 0.35 });
}

export class TitleScene extends Container {
  private drifters: Drifter[] = [];
  private mascot = new Graphics();
  private time = 0;
  private w = 1;
  private h = 1;

  constructor() {
    super();
    const names = [...DESIGN_NAMES].sort(() => Math.random() - 0.5).slice(0, 18);
    for (const name of names) {
      const depth = 0.35 + Math.random() * 0.75;
      const g = new Graphics(designContext(name));
      g.pivot.set(0, -OBJECT_BOX / 2);
      g.alpha = 0.35 + depth * 0.55;
      this.addChild(g);
      const a = Math.random() * Math.PI * 2;
      const speed = (6 + Math.random() * 14) * depth;
      this.drifters.push({ g, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, spin: (Math.random() - 0.5) * 0.3, depth });
    }
    // Nearer objects in front.
    this.drifters.sort((a, b) => a.depth - b.depth).forEach((d) => this.addChild(d.g));
    this.addChild(this.mascot);
  }

  resize(width: number, height: number): void {
    this.w = width;
    this.h = height;
    for (const d of this.drifters) {
      d.g.position.set(Math.random() * width, Math.random() * height);
      d.g.scale.set((Math.min(width, height) / 900) * (0.5 + d.depth));
    }
    this.mascot.scale.set(Math.max(0.6, Math.min(1.6, height / 620)));
  }

  update(dt: number): void {
    this.time += dt / 1000;
    const s = dt / 1000;
    const margin = 120;
    for (const d of this.drifters) {
      d.g.x += d.vx * s;
      d.g.y += d.vy * s;
      d.g.rotation += d.spin * s;
      if (d.g.x < -margin) d.g.x = this.w + margin;
      if (d.g.x > this.w + margin) d.g.x = -margin;
      if (d.g.y < -margin) d.g.y = this.h + margin;
      if (d.g.y > this.h + margin) d.g.y = -margin;
    }
    // PocoMan bobs and turns gently, waving now and then.
    const t = this.time;
    const wave = Math.max(0, Math.sin(t * 0.7)) ** 6 * Math.sin(t * 9) * 3;
    drawMascot(this.mascot, t, wave);
    const narrow = this.w < 760;
    this.mascot.position.set(this.w * (narrow ? 0.5 : 0.2), this.h * (narrow ? 0.78 : 0.56) + Math.sin(t * 0.9) * 10);
    this.mascot.rotation = Math.sin(t * 0.5) * 0.08;
    this.mascot.alpha = narrow ? 0.5 : 1;
  }
}
