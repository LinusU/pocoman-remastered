import { Graphics } from 'pixi.js';
import type { Camera } from './camera';
import type { Dir, Game, Point } from './game';

// Tap controls: tap PocoMan to see every cell he can walk to, or an object
// to see every cell it can be pushed to in one straight run. Tapping a dot
// makes the whole move.

export type TapTarget = { kind: 'player' } | { kind: 'gem'; index: number };

interface Dot {
  cell: Point;
  /** Steps from the player, for the ripple as the dots appear. */
  order: number;
  /** The moves, for pushes; walks are worked out when tapped. */
  path?: Dir[];
  goal: boolean;
}

// A tap this close to a dot (in cells) takes it even over an object drawn
// on top; further out, objects win, and then any dot within reach.
const DOT_SURE = 0.36;
const DOT_REACH = 0.75;
const RIPPLE_MS = 22;
const POP_MS = 160;
const GOLD = 0xf2c531;
const OUTLINE = 0x23243a;

const sameTarget = (a: TapTarget | null, b: TapTarget | null) =>
  !!a && !!b && (a.kind === 'player' ? b.kind === 'player' : b.kind === 'gem' && a.index === b.index);

export class TapMoves {
  /** Drawn on the floor, under the actors. */
  readonly view = new Graphics();
  selected: TapTarget | null = null;
  private dots: Dot[] = [];
  private ageMs = 0;

  get active(): boolean {
    return !!this.selected;
  }

  clear(): void {
    this.selected = null;
    this.dots = [];
    this.view.clear();
  }

  select(game: Game, target: TapTarget): void {
    this.selected = target;
    this.ageMs = 0;
    if (target.kind === 'player') {
      const dist = game.walkDistances();
      this.dots = [];
      dist.forEach((row, y) =>
        row.forEach((d, x) => d > 0 && this.dots.push({ cell: { x, y }, order: d, goal: game.isGoal(x, y) })),
      );
    } else {
      this.dots = game.pushPlans(target.index).map((p) => ({
        cell: p.to,
        order: p.path.length,
        path: p.path,
        goal: game.isGoal(p.to.x, p.to.y),
      }));
    }
  }

  /**
   * Handles a tap at a point on the ground (in cells), given the actor drawn
   * under the finger, if any. Returns the moves to make once a dot is
   * tapped, `'select'` or `'deselect'` when the selection changed, and null
   * when the tap did nothing.
   */
  tap(game: Game, ground: Point, actor: TapTarget | null): Dir[] | 'select' | 'deselect' | null {
    let near: Dot | null = null;
    let nearDist = Infinity;
    for (const dot of this.dots) {
      const d = Math.hypot(ground.x - (dot.cell.x + 0.5), ground.y - (dot.cell.y + 0.5));
      if (d < nearDist) {
        near = dot;
        nearDist = d;
      }
    }
    const take = (dot: Dot) => {
      const path = dot.path ?? game.walkPath(dot.cell);
      this.clear();
      return path && path.length ? path : null;
    };
    if (near && nearDist < DOT_SURE) return take(near);
    if (actor) {
      if (sameTarget(actor, this.selected)) {
        this.clear();
        return 'deselect';
      }
      this.select(game, actor);
      return 'select';
    }
    if (near && nearDist < DOT_REACH) return take(near);
    if (!this.selected) return null;
    this.clear();
    return 'deselect';
  }

  /** How high (in screen pixels) the selected actor hovers right now. */
  hover(target: TapTarget): number {
    return sameTarget(target, this.selected) ? 3 + 3 * Math.sin(this.ageMs / 180) : 0;
  }

  /** Draws the dots; `px` is one screen pixel in world units, so lines stay
   *  crisp however small the board is scaled. */
  draw(cam: Camera, game: Game, dt: number, px: number): void {
    const g = this.view.clear();
    const sel = this.selected;
    if (!sel) return;
    this.ageMs += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.ageMs / 260);

    const at = sel.kind === 'player' ? game.player : game.gems[sel.index];
    g.poly(cam.groundCircle(at.x + 0.5, at.y + 0.5, 0.44, 0, 32))
      .fill({ color: GOLD, alpha: 0.12 + 0.08 * pulse })
      .stroke({ color: GOLD, width: 2.5 * px, alpha: 0.7 + 0.3 * pulse });

    for (const dot of this.dots) {
      const k = Math.min(1, Math.max(0, (this.ageMs - dot.order * RIPPLE_MS) / POP_MS));
      if (k <= 0) continue;
      // Overshoots a little as it pops in.
      const s = k < 1 ? Math.sin(k * Math.PI * 0.75) / Math.sin(Math.PI * 0.75) : 1;
      const r = (dot.goal ? 0.16 : 0.12) * s;
      const cx = dot.cell.x + 0.5;
      const cy = dot.cell.y + 0.5;
      if (dot.goal) {
        g.poly(cam.groundCircle(cx, cy, r + 0.08, 0, 20)).stroke({ color: GOLD, width: 1.5 * px, alpha: 0.6 * k });
      }
      g.poly(cam.groundCircle(cx, cy, r, 0, 16))
        .fill({ color: GOLD, alpha: 0.95 * k })
        .stroke({ color: OUTLINE, width: px, alpha: 0.8 * k });
    }
  }
}
