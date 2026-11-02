import { Container, Graphics, GraphicsContext } from 'pixi.js';

// Particle effects in the board's crisp style: four-pointed sparkles and
// little diamonds that drift outward and fade, with no gravity (this is space).

const STAR = new GraphicsContext()
  .poly([0, -10, 2.5, -2.5, 10, 0, 2.5, 2.5, 0, 10, -2.5, 2.5, -10, 0, -2.5, -2.5])
  .fill(0xffffff);
const DIAMOND = new GraphicsContext().poly([0, -6, 4, 0, 0, 6, -4, 0]).fill(0xffffff);
const DOT = new GraphicsContext().circle(0, 0, 3).fill(0xffffff);
const RING = new GraphicsContext().circle(0, 0, 20).stroke({ color: 0xffffff, width: 3 });

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  spin: number;
  life: number;
  age: number;
  size: number;
  grow?: boolean;
}

export const SPARKLE_COLORS = [0xfff4c0, 0xffe27a, 0xffffff, 0xa9cdf5];
export const CONFETTI_COLORS = [0xf7d23a, 0xe0462d, 0x3fbf5a, 0x3f7fe0, 0xb07de0, 0xffffff, 0xf0902a];

export class Fx extends Container {
  private particles: Particle[] = [];

  private spawn(ctx: GraphicsContext, x: number, y: number, color: number, p: Omit<Particle, 'g' | 'age'>) {
    const g = new Graphics(ctx);
    g.tint = color;
    g.position.set(x, y);
    g.scale.set(p.size);
    g.rotation = Math.random() * Math.PI;
    this.addChild(g);
    this.particles.push({ ...p, g, age: 0 });
  }

  /** A soft starburst, e.g. when an object lands on a goal. */
  sparkle(x: number, y: number, scale = 1): void {
    this.spawn(RING, x, y, 0xfff4c0, { vx: 0, vy: 0, spin: 0, life: 520, size: 0.3 * scale, grow: true });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (40 + Math.random() * 70) * scale;
      const color = SPARKLE_COLORS[i % SPARKLE_COLORS.length];
      const ctx = i % 3 === 0 ? STAR : DOT;
      this.spawn(ctx, x, y, color, {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        spin: (Math.random() - 0.5) * 4,
        life: 500 + Math.random() * 400,
        size: (ctx === STAR ? 0.7 : 0.8) * scale * (0.6 + Math.random() * 0.6),
      });
    }
  }

  /** Confetti bursting out from several points across an area. */
  confetti(left: number, top: number, width: number, height: number, amount = 90): void {
    for (let i = 0; i < amount; i++) {
      const x = left + Math.random() * width;
      const y = top + Math.random() * height;
      const a = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 120;
      const ctx = [STAR, DIAMOND, DIAMOND, DOT][i % 4];
      this.spawn(ctx, x, y, CONFETTI_COLORS[i % CONFETTI_COLORS.length], {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        spin: (Math.random() - 0.5) * 6,
        life: 1400 + Math.random() * 1400,
        size: 0.6 + Math.random() * 0.9,
      });
    }
  }

  update(dt: number): void {
    const s = dt / 1000;
    this.particles = this.particles.filter((p) => {
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) {
        p.g.destroy();
        return false;
      }
      // Gentle drag so bursts slow down and hang in the air.
      const drag = Math.exp(-s * 1.6);
      p.vx *= drag;
      p.vy *= drag;
      p.g.x += p.vx * s;
      p.g.y += p.vy * s;
      p.g.rotation += p.spin * s;
      p.g.alpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      if (p.grow) p.g.scale.set(p.size * (1 + k * 3));
      return true;
    });
  }

  clear(): void {
    for (const p of this.particles) p.g.destroy();
    this.particles = [];
  }
}
