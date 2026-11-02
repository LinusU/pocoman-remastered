export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export const DIR_DELTA: Record<Dir, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const DIRS = Object.keys(DIR_DELTA) as Dir[];

/** A cell an object can be pushed to, and the moves that get it there. */
export interface PushPlan {
  to: Point;
  path: Dir[];
}

export interface MoveResult {
  moved: boolean;
  pushedGem: number | null;
}

interface Snapshot {
  player: Point;
  gems: Point[];
  moves: number;
  pushes: number;
}

/** Everything needed to resume a level where it was left. */
export interface GameState extends Snapshot {
  history: Snapshot[];
}

/** Pure Sokoban rules; knows nothing about rendering. */
export class Game {
  readonly width: number;
  readonly height: number;
  readonly walls: boolean[][];
  readonly goals: Point[] = [];
  /** Cells reachable from the player's start: these get a floor tile. */
  readonly floor: boolean[][];

  player: Point = { x: 0, y: 0 };
  gems: Point[] = [];
  moves = 0;
  pushes = 0;

  /** State before each push; undo goes back one push at a time. */
  private history: Snapshot[] = [];
  private readonly initial: Snapshot;

  constructor(rows: string[]) {
    this.height = rows.length;
    this.width = Math.max(...rows.map((r) => r.length));
    this.walls = [];
    for (let y = 0; y < this.height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < this.width; x++) {
        const c = rows[y][x] ?? ' ';
        row.push(c === '#');
        if (c === '@' || c === '+') this.player = { x, y };
        if (c === '$' || c === '*') this.gems.push({ x, y });
        if (c === '.' || c === '+' || c === '*') this.goals.push({ x, y });
      }
      this.walls.push(row);
    }
    this.floor = this.computeFloor();
    this.initial = this.snapshot();
  }

  isWall(x: number, y: number): boolean {
    return this.walls[y]?.[x] ?? true;
  }

  gemAt(x: number, y: number): number {
    return this.gems.findIndex((g) => g.x === x && g.y === y);
  }

  isGoal(x: number, y: number): boolean {
    return this.goals.some((g) => g.x === x && g.y === y);
  }

  /** An object here can never be moved again: walls on two adjacent sides,
   *  and it isn't a goal. */
  isDeadCorner(x: number, y: number): boolean {
    if (this.isGoal(x, y)) return false;
    const sideways = this.isWall(x - 1, y) || this.isWall(x + 1, y);
    const upDown = this.isWall(x, y - 1) || this.isWall(x, y + 1);
    return sideways && upDown;
  }

  /** Every goal is covered. Some levels have a spare gem, so not every gem
   *  needs to be on a goal. */
  isSolved(): boolean {
    return this.goals.every((g) => this.gemAt(g.x, g.y) >= 0);
  }

  tryMove(dir: Dir): MoveResult {
    const d = DIR_DELTA[dir];
    const nx = this.player.x + d.x;
    const ny = this.player.y + d.y;
    if (this.isWall(nx, ny)) return { moved: false, pushedGem: null };

    const gem = this.gemAt(nx, ny);
    if (gem >= 0) {
      const bx = nx + d.x;
      const by = ny + d.y;
      if (this.isWall(bx, by) || this.gemAt(bx, by) >= 0) {
        return { moved: false, pushedGem: null };
      }
      this.history.push(this.snapshot());
      this.gems[gem] = { x: bx, y: by };
      this.pushes++;
    }
    this.player = { x: nx, y: ny };
    this.moves++;
    return { moved: true, pushedGem: gem >= 0 ? gem : null };
  }

  /** Steps from the player to every cell, walking around walls and objects;
   *  -1 where the player can't get to. */
  walkDistances(): number[][] {
    const dist = this.walls.map((row) => row.map(() => -1));
    dist[this.player.y][this.player.x] = 0;
    const queue = [this.player];
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      for (const d of Object.values(DIR_DELTA)) {
        const x = p.x + d.x;
        const y = p.y + d.y;
        if (this.isWall(x, y) || dist[y][x] >= 0 || this.gemAt(x, y) >= 0) continue;
        dist[y][x] = dist[p.y][p.x] + 1;
        queue.push({ x, y });
      }
    }
    return dist;
  }

  /** A shortest walk to `to`, keeping to straight runs where it can; null
   *  if the player can't get there. */
  walkPath(to: Point, dist = this.walkDistances()): Dir[] | null {
    if (!(dist[to.y]?.[to.x] >= 0)) return null;
    const path: Dir[] = [];
    let at = to;
    let last: Dir | null = null;
    // Walk back downhill to the player, preferring to keep the same heading.
    while (dist[at.y][at.x] > 0) {
      const here = dist[at.y][at.x];
      const options = DIRS.filter((dir) => dist[at.y - DIR_DELTA[dir].y]?.[at.x - DIR_DELTA[dir].x] === here - 1);
      const dir: Dir = last && options.includes(last) ? last : options[0];
      path.push(dir);
      last = dir;
      at = { x: at.x - DIR_DELTA[dir].x, y: at.y - DIR_DELTA[dir].y };
    }
    return path.reverse();
  }

  /** Every cell an object can reach in one straight run of pushes, from a
   *  side the player can walk to. */
  pushPlans(gem: number): PushPlan[] {
    const g = this.gems[gem];
    const dist = this.walkDistances();
    const plans: PushPlan[] = [];
    for (const dir of DIRS) {
      const d = DIR_DELTA[dir];
      const approach = this.walkPath({ x: g.x - d.x, y: g.y - d.y }, dist);
      if (!approach) continue;
      const pushes: Dir[] = [];
      for (let x = g.x + d.x, y = g.y + d.y; !this.isWall(x, y) && this.gemAt(x, y) < 0; x += d.x, y += d.y) {
        pushes.push(dir);
        plans.push({ to: { x, y }, path: [...approach, ...pushes] });
      }
    }
    return plans;
  }

  /** Goes back to just before the latest push, or to the start if nothing
   *  has been pushed yet. Returns false when there is nothing to undo. */
  undo(): boolean {
    const s = this.history.pop() ?? (this.moves > 0 ? this.initial : null);
    if (!s) return false;
    this.restore(s);
    return true;
  }

  serialize(): GameState {
    return { ...this.snapshot(), history: this.history.map((h) => ({ ...h, gems: h.gems.map((g) => ({ ...g })) })) };
  }

  /** Restores a saved state; ignored if it doesn't fit this level. */
  load(state: GameState): boolean {
    if (state.gems?.length !== this.gems.length || this.isWall(state.player.x, state.player.y)) return false;
    this.restore(state);
    this.history = state.history ?? [];
    return true;
  }

  restart(): void {
    this.history = [];
    this.restore(this.initial);
  }

  private snapshot(): Snapshot {
    return {
      player: { ...this.player },
      gems: this.gems.map((g) => ({ ...g })),
      moves: this.moves,
      pushes: this.pushes,
    };
  }

  private restore(s: Snapshot): void {
    this.player = { ...s.player };
    this.gems = s.gems.map((g) => ({ ...g }));
    this.moves = s.moves;
    this.pushes = s.pushes;
  }

  private computeFloor(): boolean[][] {
    const floor = this.walls.map((row) => row.map(() => false));
    const stack: Point[] = [this.player];
    while (stack.length) {
      const p = stack.pop()!;
      if (this.isWall(p.x, p.y) || floor[p.y][p.x]) continue;
      floor[p.y][p.x] = true;
      for (const d of Object.values(DIR_DELTA)) stack.push({ x: p.x + d.x, y: p.y + d.y });
    }
    return floor;
  }
}
