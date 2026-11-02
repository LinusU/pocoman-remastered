import { GraphicsContext, type StrokeStyle } from 'pixi.js';

// Pushable objects, one per original PocoMan tile, redrawn as flat shapes
// with dark outlines to match the board.
//
// Each design is drawn in its own 100-unit box: x from -50 to 50, y from
// -100 (top) to 0 (where it rests on the floor). The game scales the box to
// about three quarters of a cell.

export const OBJECT_BOX = 100;
/** Outline width in design units; about 1.5px once scaled onto the board. */
const LINE = 3.2;
const INK = 0x23243a;
const S: StrokeStyle = { color: INK, width: LINE, join: 'round', cap: 'round', alpha: 0.9 };

type G = GraphicsContext;
type Design = (g: G) => void;

/** A coloured line with a dark outline, for stems, handles and the like. */
function inked(g: G, path: (g: G) => void, color: number, width: number) {
  path(g);
  g.stroke({ color: INK, width: width + LINE * 2, cap: 'round', join: 'round', alpha: 0.9 });
  path(g);
  g.stroke({ color, width, cap: 'round', join: 'round' });
}

function shine(g: G, x: number, y: number, r: number, alpha = 0.7) {
  g.ellipse(x, y, r, r * 0.7).fill({ color: 0xffffff, alpha });
}

function sphere(g: G, color: number, light: number) {
  g.circle(0, -38, 34).fill(color).stroke(S);
  g.circle(-10, -48, 13).fill({ color: light, alpha: 0.7 });
  shine(g, -14, -54, 5, 0.9);
}

function potion(g: G, liquid: number, light: number) {
  g.circle(0, -32, 30).fill(liquid);
  g.moveTo(-30, -30).arc(0, -32, 30, Math.PI, 0).closePath().fill(0xdcecf4);
  g.moveTo(-29, -32).lineTo(29, -32).stroke({ color: light, width: 3 });
  g.circle(0, -32, 30).stroke(S);
  g.rect(-8, -76, 16, 16).fill(0xdcecf4).stroke(S);
  g.roundRect(-10, -88, 20, 12, 3).fill(0x9a6532).stroke(S);
  g.circle(-8, -20, 4).fill({ color: light, alpha: 0.8 });
  g.circle(6, -14, 3).fill({ color: light, alpha: 0.8 });
  shine(g, -14, -44, 5);
}

function tree(g: G, leaves: number, dark: number) {
  g.poly([-8, -4, 8, -4, 6, -40, -6, -40]).fill(0x8a5a32).stroke(S);
  g.circle(-20, -52, 20).fill(leaves).stroke(S);
  g.circle(20, -52, 20).fill(leaves).stroke(S);
  g.circle(0, -70, 24).fill(leaves).stroke(S);
  g.circle(-6, -74, 7).fill({ color: 0xffffff, alpha: 0.25 });
  g.circle(14, -48, 6).fill({ color: dark, alpha: 0.6 });
  g.circle(-18, -46, 5).fill({ color: dark, alpha: 0.6 });
}

function flowerPot(g: G, petal: number, centre: number) {
  inked(g, (g) => g.moveTo(0, -30).lineTo(0, -58), 0x3c9b3c, 4);
  inked(g, (g) => g.moveTo(0, -40).quadraticCurveTo(14, -44, 18, -54), 0x3c9b3c, 3);
  g.ellipse(20, -55, 7, 4).fill(0x3c9b3c).stroke(S);
  g.poly([-22, -32, 22, -32, 16, -4, -16, -4]).fill(0xc8643a).stroke(S);
  g.rect(-24, -36, 48, 7).fill(0xd97a4c).stroke(S);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.ellipse(Math.cos(a) * 14, -70 + Math.sin(a) * 14, 9, 9).fill(petal).stroke(S);
  }
  g.circle(0, -70, 9).fill(centre).stroke(S);
}

/** A carved stone plaque; `carve` draws the engraving. */
function plaque(g: G, carve: (g: G) => void) {
  g.roundRect(-40, -76, 80, 72, 4).fill(0xd8c3a5).stroke(S);
  g.moveTo(-35, -9).lineTo(-35, -71).lineTo(35, -71).stroke({ color: 0xf4e8d2, width: 3 });
  g.moveTo(35, -71).lineTo(35, -9).lineTo(-35, -9).stroke({ color: 0x9c8366, width: 3 });
  carve(g);
  g.stroke({ color: 0x86705a, width: 4, cap: 'round', join: 'round' });
}

function stud(g: G, light: number, mid: number, dark: number, darkest: number) {
  g.rect(-40, -76, 80, 72).fill(0xc9ced9).stroke(S);
  const tl = [-30, -66], tr = [30, -66], br = [30, -14], bl = [-30, -14], apex = [0, -40];
  const tri = (a: number[], b: number[], color: number) =>
    g.poly([...a, ...b, ...apex]).fill(color).stroke({ ...S, width: 2 });
  tri(tl, tr, light);
  tri(tl, bl, mid);
  tri(tr, br, dark);
  tri(bl, br, darkest);
}

function boy(g: G, awake: boolean) {
  g.rect(-14, -26, 12, 22).fill(0x2f4fa8).stroke(S);
  g.rect(2, -26, 12, 22).fill(0x2f4fa8).stroke(S);
  g.roundRect(-20, -50, 40, 28, 6).fill(0xc8372d).stroke(S);
  g.circle(-24, -36, 6).fill(0xffffff).stroke(S);
  g.circle(24, -36, 6).fill(0xffffff).stroke(S);
  g.circle(0, -70, 22).fill(0xd08a3c).stroke(S);
  if (awake) {
    for (const x of [-9, 9]) {
      g.ellipse(x, -73, 6, 7).fill(0xffffff).stroke({ ...S, width: 2 });
      g.circle(x + 1, -72, 3).fill(INK);
    }
    g.moveTo(-7, -60).quadraticCurveTo(0, -55, 7, -60).stroke({ ...S, width: 2.5 });
  } else {
    g.moveTo(-14, -72).lineTo(-4, -72).moveTo(4, -72).lineTo(14, -72).stroke({ ...S, width: 3 });
    g.moveTo(-5, -61).lineTo(5, -61).stroke({ ...S, width: 2.5 });
  }
}

function bow(g: G) {
  g.poly([0, -40, -40, -66, -36, -14]).fill(0x3fbf5a).stroke(S);
  g.poly([0, -40, 40, -66, 36, -14]).fill(0x3fbf5a).stroke(S);
  g.poly([-6, -40, -36, -60, -32, -22]).fill(0x2a8f40);
  g.poly([6, -40, 36, -60, 32, -22]).fill(0x2a8f40);
  g.roundRect(-10, -52, 20, 24, 5).fill(0x7fe08e).stroke(S);
}

function heartPath(g: G, cx: number, cy: number, w: number) {
  g.moveTo(cx, cy + w * 0.9)
    .bezierCurveTo(cx - w * 1.6, cy - w * 0.1, cx - w * 0.8, cy - w * 1.3, cx, cy - w * 0.45)
    .bezierCurveTo(cx + w * 0.8, cy - w * 1.3, cx + w * 1.6, cy - w * 0.1, cx, cy + w * 0.9)
    .closePath();
}

const DESIGNS: Record<string, Design> = {
  diamond(g) {
    g.poly([-22, -74, 22, -74, 40, -56, -40, -56]).fill(0xeef9ff).stroke(S);
    g.poly([-40, -56, 40, -56, 0, -6]).fill(0xa9d8f5).stroke(S);
    g.moveTo(-22, -74).lineTo(-10, -56).lineTo(0, -74).lineTo(10, -56).lineTo(22, -74)
      .moveTo(-10, -56).lineTo(0, -6).lineTo(10, -56)
      .stroke({ color: 0x6fa8d0, width: 2 });
    shine(g, -18, -64, 5);
  },
  emerald(g) {
    const oct = (r: number) =>
      Array.from({ length: 8 }, (_, i) => {
        const a = ((i + 0.5) / 8) * Math.PI * 2;
        return [Math.cos(a) * r, -40 + Math.sin(a) * r * 0.95];
      });
    const outer = oct(38), inner = oct(22);
    g.poly(outer.flat()).fill(0x3fbf5a).stroke(S);
    g.poly(inner.flat()).fill(0x7fe08e).stroke({ color: 0x2a8f40, width: 2 });
    outer.forEach((p, i) => g.moveTo(p[0], p[1]).lineTo(inner[i][0], inner[i][1]));
    g.stroke({ color: 0x2a8f40, width: 2 });
    shine(g, -10, -52, 6);
  },
  swan(g) {
    g.ellipse(6, -24, 36, 18).fill(0xffffff).stroke(S);
    g.moveTo(-6, -30).quadraticCurveTo(16, -48, 36, -34).stroke({ color: 0xc9d3e0, width: 3 });
    inked(g, (g) => g.moveTo(-20, -30).bezierCurveTo(-40, -50, -10, -70, -20, -80), 0xffffff, 9);
    g.circle(-18, -80, 8).fill(0xffffff).stroke(S);
    g.poly([-26, -82, -40, -78, -26, -76]).fill(0xf0902a).stroke({ ...S, width: 2 });
    g.circle(-17, -82, 2).fill(INK);
  },
  clover(g) {
    inked(g, (g) => g.moveTo(0, -50).quadraticCurveTo(6, -24, 14, -6), 0x2f8a3a, 5);
    for (const [x, y] of [[-15, -64], [15, -64], [-15, -36], [15, -36]]) {
      g.circle(x, y, 15).fill(0x3c9b3c).stroke(S);
    }
    g.moveTo(-26, -75).lineTo(26, -25).moveTo(26, -75).lineTo(-26, -25).stroke({ color: 0x7fd07f, width: 2.5 });
  },
  blackOrb: (g) => sphere(g, 0x1d1f2b, 0x5a6080),
  blueOrb: (g) => sphere(g, 0x1f3fa8, 0x7aa0ff),
  amphora(g) {
    inked(g, (g) => g.moveTo(-12, -70).quadraticCurveTo(-34, -70, -26, -46), 0xb8682a, 4);
    inked(g, (g) => g.moveTo(12, -70).quadraticCurveTo(34, -70, 26, -46), 0xb8682a, 4);
    g.poly([-14, -8, 14, -8, 18, -2, -18, -2]).fill(0x9a5522).stroke(S);
    g.ellipse(0, -38, 28, 30).fill(0xc8743a).stroke(S);
    g.rect(-27, -44, 54, 8).fill(0x8a4a1e);
    g.rect(-10, -80, 20, 14).fill(0xc8743a).stroke(S);
    g.roundRect(-16, -86, 32, 8, 3).fill(0xb8682a).stroke(S);
    shine(g, -14, -50, 5, 0.5);
  },
  skull(g) {
    g.roundRect(-20, -38, 40, 32, 8).fill(0xf2efe6).stroke(S);
    g.circle(0, -56, 32).fill(0xf2efe6).stroke(S);
    g.ellipse(-12, -54, 9, 10).fill(INK);
    g.ellipse(12, -54, 9, 10).fill(INK);
    g.poly([0, -44, -5, -36, 5, -36]).fill(INK);
    g.moveTo(-10, -20).lineTo(-10, -10).moveTo(0, -20).lineTo(0, -10).moveTo(10, -20).lineTo(10, -10).stroke({ ...S, width: 2.5 });
  },
  greenPotion: (g) => potion(g, 0x3fbf5a, 0x9df0a8),
  redPotion: (g) => potion(g, 0xd83a3a, 0xff9a8a),
  egg(g) {
    g.ellipse(0, -40, 27, 36).fill(0xe8f4ff).stroke(S);
    for (const [x, y] of [[8, -30], [-10, -22], [12, -52], [-4, -46]]) g.circle(x, y, 3).fill(0xa9cbe8);
    shine(g, -10, -56, 6);
  },
  tree: (g) => tree(g, 0x3c9b3c, 0x26702a),
  goldenTree: (g) => tree(g, 0xe8b830, 0xb07d18),
  yellowFlower: (g) => flowerPot(g, 0xf7d23a, 0xc8372d),
  whiteFlower: (g) => flowerPot(g, 0xffffff, 0xf7c531),
  beetleTile: (g) => plaque(g, (g) => {
    g.ellipse(0, -40, 12, 16);
    g.moveTo(0, -56).lineTo(0, -24);
    for (const y of [-50, -40, -30]) g.moveTo(-12, y).lineTo(-24, y - 6).moveTo(12, y).lineTo(24, y - 6);
  }),
  starWindow(g) {
    g.rect(-40, -76, 80, 72).fill(0xe8b830).stroke(S);
    g.rect(-30, -66, 60, 52).fill(0x0a0d24).stroke({ ...S, width: 2 });
    for (const [x, y, r] of [[-16, -54, 2], [12, -36, 2.5], [-6, -26, 1.5], [18, -58, 1.5]]) g.circle(x, y, r).fill(0xffffff);
    g.moveTo(4, -56).lineTo(4, -46).moveTo(-1, -51).lineTo(9, -51).stroke({ color: 0xffffff, width: 1.5 });
  },
  blueStud: (g) => stud(g, 0xa9cdf5, 0x5b8de0, 0x2a55b0, 0x163a80),
  goldStud: (g) => stud(g, 0xffe98a, 0xf2c531, 0xc8941a, 0x96680e),
  apple(g) {
    inked(g, (g) => g.moveTo(0, -60).quadraticCurveTo(2, -72, 8, -78), 0x7a4a22, 3);
    g.ellipse(14, -72, 11, 6).fill(0x3c9b3c).stroke(S);
    g.circle(-12, -36, 25).fill(0xd8322d).stroke(S);
    g.circle(12, -36, 25).fill(0xd8322d).stroke(S);
    g.ellipse(0, -36, 20, 24).fill(0xd8322d);
    shine(g, -16, -46, 6);
  },
  boySleepy: (g) => boy(g, false),
  boyAwake: (g) => boy(g, true),
  frog(g) {
    g.ellipse(-26, -10, 14, 7).fill(0x3c9b3c).stroke(S);
    g.ellipse(26, -10, 14, 7).fill(0x3c9b3c).stroke(S);
    g.ellipse(0, -30, 36, 24).fill(0x4cbf4c).stroke(S);
    g.ellipse(0, -24, 22, 12).fill(0xbfe8a0);
    for (const x of [-16, 16]) {
      g.circle(x, -54, 11).fill(0x4cbf4c).stroke(S);
      g.circle(x, -55, 6).fill(0xffffff);
      g.circle(x, -55, 3).fill(INK);
    }
    g.moveTo(-14, -38).quadraticCurveTo(0, -30, 14, -38).stroke({ ...S, width: 2.5 });
  },
  butterfly(g) {
    for (const s of [-1, 1]) {
      g.ellipse(s * 22, -60, 22, 20).fill(0xf7c531).stroke(S);
      g.ellipse(s * 18, -28, 16, 16).fill(0xe0462d).stroke(S);
      g.circle(s * 24, -62, 7).fill(0xe0462d);
    }
    g.roundRect(-4, -78, 8, 66, 4).fill(INK);
    inked(g, (g) => g.moveTo(-2, -76).lineTo(-10, -90).moveTo(2, -76).lineTo(10, -90), INK, 1);
  },
  crab(g) {
    for (const s of [-1, 1]) {
      for (const y of [-14, -22]) g.moveTo(s * 20, y - 8).lineTo(s * 40, y);
      g.stroke({ color: 0xc8372d, width: 4, cap: 'round' });
      inked(g, (g) => g.moveTo(s * 24, -40).lineTo(s * 32, -54), 0xc8372d, 4);
      g.circle(s * 34, -60, 10).fill(0xd8463a).stroke(S);
      g.poly([s * 34, -60, s * 46, -70, s * 42, -56]).fill(0x23243a);
    }
    g.ellipse(0, -32, 30, 18).fill(0xd8463a).stroke(S);
    for (const x of [-8, 8]) {
      g.moveTo(x, -48).lineTo(x, -56).stroke(S);
      g.circle(x, -58, 4).fill(INK);
    }
  },
  mushroom(g) {
    g.roundRect(-12, -46, 24, 42, 8).fill(0xf2e8d0).stroke(S);
    g.moveTo(-42, -44).bezierCurveTo(-42, -96, 42, -96, 42, -44).closePath().fill(0xffffff).stroke(S);
    for (const [x, y, r] of [[-18, -62, 6], [10, -72, 7], [22, -54, 5]]) g.circle(x, y, r).fill(0xe0e4ec);
  },
  birdTile: (g) => plaque(g, (g) => {
    g.moveTo(-22, -34).quadraticCurveTo(-6, -24, 14, -32).lineTo(26, -50);
    g.moveTo(-22, -34).lineTo(-10, -52).lineTo(8, -44);
    g.circle(-18, -54, 5);
    g.moveTo(-4, -28).lineTo(-6, -16).moveTo(6, -28).lineTo(6, -16);
  }),
  phoneBox(g) {
    g.rect(-24, -90, 48, 86).fill(0x1f3f9e).stroke(S);
    g.rect(-28, -96, 56, 8).fill(0x16307a).stroke(S);
    g.rect(-4, -102, 8, 6).fill(0xdcecf4).stroke({ ...S, width: 2 });
    g.rect(-18, -84, 36, 6).fill(0x0a0d24);
    for (const y of [-72, -60]) for (const x of [-16, 2]) g.rect(x, y, 14, 10).fill(0xdcecf4).stroke({ ...S, width: 1.5 });
    g.moveTo(0, -48).lineTo(0, -8).stroke({ color: 0x16307a, width: 2 });
  },
  stoneSlab(g) {
    g.rect(-40, -70, 80, 66).fill(0x8a8f9e).stroke(S);
    g.poly([-40, -70, 40, -70, 30, -60, -30, -60]).fill(0xc2c7d4);
    g.poly([-40, -70, -30, -60, -30, -14, -40, -4]).fill(0xa8adbb);
    g.poly([40, -70, 40, -4, 30, -14, 30, -60]).fill(0x5d6274);
    g.poly([-40, -4, 40, -4, 30, -14, -30, -14]).fill(0x4f5466);
    g.rect(-40, -70, 80, 66).stroke(S);
  },
  sword(g) {
    g.poly([-6, -60, 6, -60, 6, -16, 0, -4, -6, -16]).fill(0xe6ecf4).stroke(S);
    g.moveTo(0, -58).lineTo(0, -12).stroke({ color: 0xa9b4c8, width: 2 });
    g.roundRect(-22, -66, 44, 8, 3).fill(0xe8b830).stroke(S);
    g.rect(-4, -84, 8, 18).fill(0x8a5a32).stroke(S);
    g.circle(0, -88, 6).fill(0xe8b830).stroke(S);
  },
  shield(g) {
    const outline = (g: G) =>
      g.moveTo(-34, -84).lineTo(34, -84).lineTo(34, -48).quadraticCurveTo(32, -16, 0, -4)
        .quadraticCurveTo(-32, -16, -34, -48).closePath();
    outline(g);
    g.fill(0xd8322d);
    g.poly([-34, -84, 0, -84, 0, -4, -20, -12, -34, -48]).fill(0x2f4fa8);
    inked(g, (g) => g.moveTo(-28, -78).lineTo(24, -20), 0xf7c531, 6);
    outline(g);
    g.stroke({ color: 0xc9ced9, width: 6 });
    outline(g);
    g.stroke(S);
  },
  chalice(g) {
    g.ellipse(0, -8, 22, 6).fill(0xc8941a).stroke(S);
    g.rect(-5, -40, 10, 30).fill(0xe8b830).stroke(S);
    g.moveTo(-32, -82).lineTo(32, -82).quadraticCurveTo(30, -40, 0, -38).quadraticCurveTo(-30, -40, -32, -82)
      .closePath().fill(0xf2c531).stroke(S);
    for (let x = -24; x <= 24; x += 12) g.circle(x, -74, 3).fill(0xfff4c0);
    shine(g, -14, -60, 5, 0.5);
  },
  tools(g) {
    inked(g, (g) => g.moveTo(-28, -12).lineTo(24, -76), 0xc9ced9, 7);
    g.circle(26, -78, 10).fill(0xc9ced9).stroke(S);
    g.circle(30, -84, 5).fill(0xd8c3a5);
    inked(g, (g) => g.moveTo(28, -12).lineTo(-6, -50), 0xe0462d, 9);
    inked(g, (g) => g.moveTo(-6, -50).lineTo(-26, -76), 0xc9ced9, 4);
  },
  cobra(g) {
    g.ellipse(0, -14, 36, 10).fill(0x1d1f2b).stroke(S);
    g.ellipse(0, -24, 26, 8).fill(0x2a2d3c).stroke(S);
    inked(g, (g) => g.moveTo(10, -26).quadraticCurveTo(-14, -44, 2, -62), 0x1d1f2b, 10);
    g.ellipse(2, -70, 14, 16).fill(0x1d1f2b).stroke(S);
    g.ellipse(2, -66, 6, 8).fill(0x5a6080);
    g.circle(-3, -76, 2.5).fill(0x4cdf6a);
    g.circle(7, -76, 2.5).fill(0x4cdf6a);
  },
  snail(g) {
    g.moveTo(-40, -6).lineTo(30, -6).quadraticCurveTo(40, -6, 40, -16).lineTo(34, -26).lineTo(-36, -20)
      .closePath().fill(0x9ad36a).stroke(S);
    inked(g, (g) => g.moveTo(32, -24).lineTo(36, -42).moveTo(36, -24).lineTo(44, -38), 0x9ad36a, 2);
    g.circle(-4, -42, 30).fill(0x3f7fe0).stroke(S);
    g.moveTo(-4, -42).arc(-4, -42, 8, 0, Math.PI * 1.5).arc(-4, -42, 16, Math.PI * 1.5, Math.PI * 3)
      .arc(-4, -42, 24, Math.PI, Math.PI * 2.2)
      .stroke({ color: 0xa9cdf5, width: 3, cap: 'round' });
  },
  rock(g) {
    g.poly([-40, -4, -36, -30, -18, -52, 6, -58, 26, -46, 40, -24, 40, -4]).fill(0x9a9fae).stroke(S);
    g.poly([-18, -52, 6, -58, 26, -46, 4, -40, -14, -42]).fill(0xc2c7d4);
    g.moveTo(-14, -42).lineTo(-6, -20).moveTo(4, -40).lineTo(18, -18).stroke({ color: 0x6e7384, width: 2.5 });
  },
  trident(g) {
    inked(g, (g) => g.moveTo(0, -4).lineTo(0, -66), 0xd8322d, 5);
    inked(g, (g) => g.moveTo(-22, -88).lineTo(-22, -64).quadraticCurveTo(-22, -56, 0, -56)
      .quadraticCurveTo(22, -56, 22, -64).lineTo(22, -88), 0xd8322d, 5);
    inked(g, (g) => g.moveTo(0, -66).lineTo(0, -94), 0xd8322d, 5);
    for (const x of [-22, 0, 22]) g.poly([x - 6, -84, x, -96, x + 6, -84]).fill(0xd8322d).stroke({ ...S, width: 2 });
  },
  lightning(g) {
    const bolt = (dx: number, dy: number, k: number) =>
      g.poly([4, -96, -18, -56, -2, -56, -16, -16, 22, -64, 4, -64, 18, -96].map((v, i) => (i % 2 ? v * k + dy : v * k + dx)))
        .fill(0xf7d23a).stroke(S);
    bolt(-12, 0, 0.8);
    bolt(14, 4, 0.95);
  },
  potOfGold(g) {
    for (const [x, y] of [[-14, -54], [0, -58], [14, -54], [-6, -62], [8, -64]]) g.circle(x, y, 9).fill(0xf2c531).stroke({ ...S, width: 2 });
    g.moveTo(-36, -50).lineTo(36, -50).quadraticCurveTo(36, -8, 0, -8).quadraticCurveTo(-36, -8, -36, -50)
      .closePath().fill(0x1d1f2b).stroke(S);
    g.roundRect(-40, -54, 80, 8, 4).fill(0x2a2d3c).stroke(S);
    inked(g, (g) => g.moveTo(-20, -12).lineTo(-26, -2).moveTo(20, -12).lineTo(26, -2), 0x1d1f2b, 4);
  },
  tripod(g) {
    inked(g, (g) => g.moveTo(0, -70).lineTo(-30, -4).moveTo(0, -70).lineTo(30, -4).moveTo(0, -70).lineTo(4, -6), 0x2a2d3c, 4);
    inked(g, (g) => g.moveTo(-16, -38).lineTo(18, -38), 0x2a2d3c, 3);
    g.roundRect(-8, -80, 16, 12, 3).fill(0x2a2d3c).stroke(S);
    g.moveTo(0, -98).quadraticCurveTo(10, -88, 0, -80).quadraticCurveTo(-10, -88, 0, -98).fill(0xf7c531).stroke({ ...S, width: 2 });
  },
  bow,
  acorn(g) {
    g.ellipse(0, -30, 22, 26).fill(0xc8843a).stroke(S);
    shine(g, -8, -26, 5, 0.4);
    g.moveTo(-28, -50).bezierCurveTo(-28, -80, 28, -80, 28, -50).closePath().fill(0x8a5a32).stroke(S);
    for (let x = -18; x <= 18; x += 9) g.moveTo(x, -52).lineTo(x + 4, -66);
    g.stroke({ color: 0x6a4224, width: 2 });
    inked(g, (g) => g.moveTo(0, -72).lineTo(4, -84), 0x6a4224, 4);
  },
  lamp(g) {
    inked(g, (g) => g.moveTo(26, -34).quadraticCurveTo(46, -38, 34, -54), 0x1d1f2b, 4);
    g.moveTo(-26, -34).lineTo(-46, -50).lineTo(-40, -30).closePath().fill(0x1d1f2b).stroke(S);
    g.ellipse(0, -30, 30, 14).fill(0x2a2d3c).stroke(S);
    g.ellipse(0, -8, 14, 5).fill(0x1d1f2b).stroke(S);
    g.rect(-4, -18, 8, 8).fill(0x1d1f2b);
    g.moveTo(-14, -42).bezierCurveTo(-14, -62, 14, -62, 14, -42).closePath().fill(0x2a2d3c).stroke(S);
    g.circle(0, -58, 4).fill(0x5a6080).stroke({ ...S, width: 2 });
  },
  candle(g) {
    inked(g, (g) => g.moveTo(28, -12).quadraticCurveTo(44, -16, 36, -26), 0xe8b830, 3);
    g.ellipse(0, -10, 32, 8).fill(0xe8b830).stroke(S);
    g.rect(-9, -64, 18, 52).fill(0xfaf6ea).stroke(S);
    g.moveTo(0, -64).lineTo(0, -70).stroke({ ...S, width: 2 });
    g.moveTo(0, -90).quadraticCurveTo(10, -78, 0, -70).quadraticCurveTo(-10, -78, 0, -90).fill(0xf7c531).stroke({ ...S, width: 2 });
    g.moveTo(0, -84).quadraticCurveTo(4, -78, 0, -73).quadraticCurveTo(-4, -78, 0, -84).fill(0xffffff);
  },
  ring(g) {
    g.ellipse(0, -30, 28, 24).stroke({ color: INK, width: 13, alpha: 0.9 });
    g.ellipse(0, -30, 28, 24).stroke({ color: 0xf2c531, width: 7 });
    g.poly([-12, -62, 12, -62, 8, -52, -8, -52]).fill(0xe8b830).stroke(S);
    g.poly([-10, -62, 0, -76, 10, -62]).fill(0x1d1f2b).stroke(S);
    shine(g, -3, -66, 2, 0.8);
  },
  pouch(g) {
    g.moveTo(-14, -60).quadraticCurveTo(-42, -40, -34, -14).quadraticCurveTo(-30, -4, 0, -4)
      .quadraticCurveTo(30, -4, 34, -14).quadraticCurveTo(42, -40, 14, -60).closePath().fill(0x3fbf5a).stroke(S);
    g.poly([-14, -60, -20, -76, 0, -68, 20, -76, 14, -60]).fill(0x3fbf5a).stroke(S);
    inked(g, (g) => g.moveTo(-16, -60).lineTo(16, -60), 0xc8843a, 3);
    shine(g, -16, -34, 6, 0.4);
  },
  eagleTile: (g) => plaque(g, (g) => {
    g.moveTo(-30, -56).lineTo(-8, -46).lineTo(0, -56).lineTo(8, -46).lineTo(30, -56);
    for (const x of [-26, -18, 18, 26]) g.moveTo(x, -52).lineTo(x, -34);
    g.moveTo(0, -56).lineTo(0, -24).moveTo(-6, -18).lineTo(0, -24).lineTo(6, -18);
    g.circle(0, -62, 4);
  }),
  spider(g) {
    for (const s of [-1, 1]) {
      for (const [y, dy] of [[-40, -16], [-34, -6], [-28, 6], [-24, 16]]) {
        g.moveTo(s * 10, y).lineTo(s * 28, y + dy).lineTo(s * 40, y + dy + 14);
      }
    }
    g.stroke({ color: 0x1d1f2b, width: 3, join: 'round' });
    g.ellipse(0, -28, 18, 20).fill(0x1d1f2b).stroke(S);
    g.circle(0, -52, 10).fill(0x1d1f2b).stroke(S);
    g.poly([0, -36, -6, -28, 0, -20, 6, -28]).fill(0xd8322d);
    g.circle(-4, -54, 2).fill(0xd8322d);
    g.circle(4, -54, 2).fill(0xd8322d);
  },
  dagger(g) {
    g.poly([-10, -26, 30, -86, 36, -80, -4, -20]).fill(0xe6ecf4).stroke(S);
    g.moveTo(-7, -23).lineTo(33, -83).stroke({ color: 0xa9b4c8, width: 1.5 });
    g.poly([-20, -32, 4, -14, 0, -10, -24, -28]).fill(0x5a6080).stroke(S);
    inked(g, (g) => g.moveTo(-12, -20).lineTo(-26, -6), 0x1d1f2b, 6);
  },
  heart(g) {
    heartPath(g, 0, -34, 30);
    g.fill(0xd8322d).stroke(S);
    shine(g, -18, -54, 6, 0.6);
  },
  rose(g) {
    inked(g, (g) => g.moveTo(0, -44).quadraticCurveTo(-4, -24, 2, -4), 0x2f8a3a, 4);
    g.ellipse(-14, -26, 10, 5).fill(0x3c9b3c).stroke(S);
    g.ellipse(14, -18, 10, 5).fill(0x3c9b3c).stroke(S);
    g.circle(0, -62, 22).fill(0xc8202a).stroke(S);
    g.moveTo(0, -62).arc(0, -62, 6, 0, Math.PI * 1.6).arc(0, -62, 12, Math.PI * 1.6, Math.PI * 3.2)
      .arc(0, -62, 18, Math.PI * 1.2, Math.PI * 2.6)
      .stroke({ color: 0x8a1018, width: 2.5, cap: 'round' });
  },
  topHat(g) {
    g.ellipse(0, -14, 40, 10).fill(0x1d1f2b).stroke(S);
    g.poly([-24, -16, -26, -82, 26, -82, 24, -16]).fill(0x2a2d3c).stroke(S);
    g.ellipse(0, -82, 26, 6).fill(0x3a3e52).stroke(S);
    g.rect(-25, -34, 50, 9).fill(0x8a1018);
  },
  globe(g) {
    g.circle(0, -40, 36).fill(0x2f6fd0).stroke(S);
    g.poly([-26, -58, -8, -66, 0, -54, -12, -40, -24, -44]).fill(0x4cbf4c);
    g.poly([6, -36, 24, -44, 30, -28, 14, -16, 4, -24]).fill(0x4cbf4c);
    g.poly([-20, -24, -10, -18, -16, -10]).fill(0x4cbf4c);
    g.circle(0, -40, 36).stroke(S);
    shine(g, -16, -58, 6, 0.6);
  },
  heartArrow(g) {
    inked(g, (g) => g.moveTo(-40, -14).lineTo(40, -70), 0x8a5a32, 3);
    heartPath(g, 0, -36, 26);
    g.fill(0xd8322d).stroke(S);
    inked(g, (g) => g.moveTo(8, -48).lineTo(40, -70), 0x8a5a32, 3);
    g.poly([40, -70, 30, -72, 36, -62]).fill(0xc9ced9).stroke({ ...S, width: 2 });
    g.poly([-40, -14, -44, -24, -34, -18]).fill(0xffffff).stroke({ ...S, width: 2 });
  },
  puzzleCube(g) {
    const T = [0, -94], R = [40, -74], C = [0, -54], L = [-40, -74], Rb = [40, -26], Cb = [0, -6], Lb = [-40, -26];
    const lerp = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    // Corners in order: origin, along u, opposite, along v.
    const face = (o: number[], u: number[], uv: number[], v: number[], colors: number[]) => {
      const at = (s: number, t: number) => lerp(lerp(o, u, s), lerp(v, uv, s), t);
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const q = [at(i / 3, j / 3), at((i + 1) / 3, j / 3), at((i + 1) / 3, (j + 1) / 3), at(i / 3, (j + 1) / 3)];
          g.poly(q.flat()).fill(colors[(i * 3 + j) % colors.length]).stroke({ color: INK, width: 2.2, join: 'round' });
        }
      }
    };
    face(L, T, R, C, [0xf7d23a, 0xffffff, 0xf7d23a, 0x3fbf5a, 0xf7d23a, 0xffffff, 0xf0902a, 0xf7d23a, 0xffffff]);
    face(L, C, Cb, Lb, [0xd8322d, 0xd8322d, 0x2f4fa8, 0xd8322d, 0xf7d23a, 0xd8322d, 0x2f4fa8, 0xd8322d, 0xd8322d]);
    face(C, R, Rb, Cb, [0x2f4fa8, 0x3fbf5a, 0x2f4fa8, 0x2f4fa8, 0x2f4fa8, 0xf0902a, 0x3fbf5a, 0x2f4fa8, 0x2f4fa8]);
    g.poly([...T, ...R, ...Rb, ...Cb, ...Lb, ...L]).stroke(S);
  },
  nugget(g) {
    g.poly([-36, -10, -38, -30, -24, -50, 2, -56, 26, -48, 38, -28, 32, -8]).fill(0xe8b830).stroke(S);
    g.poly([-24, -50, 2, -56, 26, -48, 8, -40, -14, -42]).fill(0xffe98a);
    g.poly([32, -8, 38, -28, 20, -22, 12, -8]).fill(0xb07d18);
    shine(g, -10, -46, 5, 0.8);
  },
};

// Original tile ids (from the level headers) for each design.
const TILES: Record<string, number[]> = {
  diamond: [3], emerald: [11, 15], swan: [16, 47], clover: [48, 49], blackOrb: [50, 51], blueOrb: [52, 53],
  amphora: [54, 59], skull: [60, 61], greenPotion: [62, 63], redPotion: [64, 65], egg: [66, 67], tree: [68, 69],
  goldenTree: [70, 80], yellowFlower: [81, 71], whiteFlower: [72, 73], beetleTile: [74, 75], starWindow: [76, 77],
  blueStud: [499, 7], goldStud: [8, 78], apple: [79, 82], boySleepy: [83, 84], boyAwake: [486, 85], frog: [86, 87],
  butterfly: [88, 89], crab: [90, 91], mushroom: [92, 93], birdTile: [94, 95], phoneBox: [96, 97],
  stoneSlab: [98, 99], sword: [100, 101], shield: [102, 103], chalice: [104, 105], tools: [106, 107],
  cobra: [108, 109], snail: [110, 111], rock: [112, 113], trident: [114, 115], lightning: [116, 117],
  potOfGold: [118, 119], tripod: [485, 487], bow: [14, 488, 629, 630], acorn: [489, 9], lamp: [490, 477],
  candle: [491, 476], ring: [492, 478], pouch: [493, 480], eagleTile: [494, 479], spider: [495, 481],
  dagger: [482, 496], heart: [484, 120], rose: [483, 622], topHat: [623, 624], globe: [625, 626],
  heartArrow: [627, 628], puzzleCube: [631, 635], nugget: [636],
};

const DESIGN_BY_TILE = new Map(Object.entries(TILES).flatMap(([name, ids]) => ids.map((id) => [id, name] as const)));
const FALLBACK = 'blueOrb';
const contexts = new Map<string, GraphicsContext>();

export const DESIGN_NAMES = Object.keys(DESIGNS);

/** Shared drawing for a design; build once, reuse on every object. */
export function designContext(name: string): GraphicsContext {
  let ctx = contexts.get(name);
  if (!ctx) {
    ctx = new GraphicsContext();
    (DESIGNS[name] ?? DESIGNS[FALLBACK])(ctx);
    contexts.set(name, ctx);
  }
  return ctx;
}

export function designForTile(tile: number | undefined): string {
  return (tile !== undefined && DESIGN_BY_TILE.get(tile)) || FALLBACK;
}
