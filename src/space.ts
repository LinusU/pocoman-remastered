import { Container, FillGradient, Graphics, Rectangle, TilingSprite, type Renderer } from 'pixi.js';

// Procedural deep-space backdrop: a dark gradient, faint nebula glows, three
// layers of stars drifting very slowly, a few twinkling sparkles and a far
// away spiral galaxy.

const STAR_TILE = 1024;
const STAR_LAYERS = [
  { count: 520, size: [0.4, 0.9], alpha: [0.25, 0.6], drift: 1.5 },
  { count: 160, size: [0.7, 1.3], alpha: [0.45, 0.85], drift: 3 },
  { count: 45, size: [1.1, 1.8], alpha: [0.7, 1], drift: 5 },
];
// Slow diagonal drift, in pixels per second for a layer with drift 1.
const DRIFT_DIR = { x: -0.9, y: -0.35 };
const SPARKLES = 18;
const STAR_TINTS = [0xffffff, 0xffffff, 0xffffff, 0xcfe0ff, 0xfff1d6];

/** Small seeded PRNG so the sky looks the same on every load. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}
const between = (r: () => number, [a, b]: number[]) => a + (b - a) * r();

function glow(color: string, radius: number, strength: number): Graphics {
  const g = new FillGradient({
    type: 'radial',
    center: { x: 0.5, y: 0.5 },
    innerRadius: 0,
    outerCenter: { x: 0.5, y: 0.5 },
    outerRadius: 0.5,
    colorStops: [
      { offset: 0, color: `rgba(${color}, ${strength})` },
      { offset: 0.45, color: `rgba(${color}, ${strength * 0.35})` },
      { offset: 1, color: `rgba(${color}, 0)` },
    ],
  });
  return new Graphics().circle(0, 0, radius).fill(g);
}

function makeGalaxy(): Container {
  const galaxy = new Container();
  const r = rng(7);
  galaxy.addChild(glow('150, 140, 255', 150, 0.22));

  // Two logarithmic spiral arms of dust and stars, drawn face-on and then
  // squashed and turned so the disc looks tilted.
  const disc = new Graphics();
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 420; i++) {
      const t = r() ** 0.8;
      const angle = arm * Math.PI + t * Math.PI * 3.2;
      const dist = 8 + t * 120;
      const spread = 4 + t * 18;
      const x = Math.cos(angle) * dist + (r() - 0.5) * spread;
      const y = Math.sin(angle) * dist + (r() - 0.5) * spread;
      const bright = 1 - t * 0.7;
      disc.circle(x, y, 0.5 + r() * 1.1).fill({ color: r() < 0.3 ? 0xd6ccff : 0xffffff, alpha: 0.25 + bright * 0.55 * r() });
    }
  }
  disc.scale.y = 0.42;
  galaxy.addChild(disc);
  galaxy.addChild(glow('255, 240, 210', 34, 0.9));
  galaxy.rotation = -0.45;
  return galaxy;
}

export class SpaceBackdrop extends Container {
  private bg = new Graphics();
  private nebulae = new Container();
  private layers: { sprite: TilingSprite; drift: number }[] = [];
  private sparkles: { g: Graphics; phase: number; speed: number }[] = [];
  private galaxy = makeGalaxy();
  private time = 0;

  constructor(renderer: Renderer) {
    super();
    this.addChild(this.bg, this.nebulae, this.galaxy);

    const r = rng(42);
    for (const layer of STAR_LAYERS) {
      const g = new Graphics();
      for (let i = 0; i < layer.count; i++) {
        g.circle(r() * STAR_TILE, r() * STAR_TILE, between(r, layer.size))
          .fill({ color: STAR_TINTS[Math.floor(r() * STAR_TINTS.length)], alpha: between(r, layer.alpha) });
      }
      const texture = renderer.generateTexture({
        target: g,
        frame: new Rectangle(0, 0, STAR_TILE, STAR_TILE),
        resolution: renderer.resolution,
      });
      g.destroy();
      const sprite = new TilingSprite({ texture, width: 1, height: 1 });
      sprite.tilePosition.set(r() * STAR_TILE, r() * STAR_TILE);
      this.addChild(sprite);
      this.layers.push({ sprite, drift: layer.drift });
    }

    // Four-pointed sparkles, in the same crisp style as the board.
    for (let i = 0; i < SPARKLES; i++) {
      const size = 3 + r() * 5;
      const g = new Graphics()
        .moveTo(-size, 0).lineTo(size, 0)
        .moveTo(0, -size).lineTo(0, size)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.9 })
        .circle(0, 0, 1.3).fill(0xffffff);
      this.addChild(g);
      this.sparkles.push({ g, phase: r() * Math.PI * 2, speed: 0.4 + r() * 1.2 });
    }
  }

  resize(width: number, height: number): void {
    this.bg.clear().rect(0, 0, width, height).fill(
      new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0.3, y: 1 },
        colorStops: [
          { offset: 0, color: 0x05060f },
          { offset: 0.55, color: 0x0a0d24 },
          { offset: 1, color: 0x130f2c },
        ],
      }),
    );

    const s = Math.max(width, height);
    this.nebulae.removeChildren().forEach((c) => c.destroy());
    const nebula = (color: string, x: number, y: number, radius: number, strength: number) => {
      const g = glow(color, radius * s, strength);
      g.position.set(x * width, y * height);
      g.scale.y = 0.6;
      this.nebulae.addChild(g);
    };
    nebula('90, 60, 170', 0.15, 0.8, 0.45, 0.18);
    nebula('30, 110, 150', 0.9, 0.95, 0.35, 0.12);
    nebula('140, 70, 160', 0.75, 0.2, 0.3, 0.1);

    this.galaxy.position.set(width * 0.86, height * 0.8);
    this.galaxy.scale.set(Math.max(0.5, Math.min(1.1, s / 1600)));

    for (const { sprite } of this.layers) {
      sprite.width = width;
      sprite.height = height;
    }
    const r = rng(99);
    for (const sp of this.sparkles) sp.g.position.set(r() * width, r() * height);
  }

  update(dtMs: number): void {
    this.time += dtMs / 1000;
    const dt = dtMs / 1000;
    for (const { sprite, drift } of this.layers) {
      sprite.tilePosition.x += DRIFT_DIR.x * drift * dt;
      sprite.tilePosition.y += DRIFT_DIR.y * drift * dt;
    }
    for (const sp of this.sparkles) {
      const k = 0.5 + 0.5 * Math.sin(this.time * sp.speed + sp.phase);
      sp.g.alpha = 0.15 + k * 0.85;
      sp.g.scale.set(0.6 + k * 0.4);
    }
  }
}
