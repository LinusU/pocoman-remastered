import { Container, Graphics, Text, type Application, type FederatedPointerEvent } from 'pixi.js';
import type { SoundBank } from './audio';
import { Camera, CELL, type CameraSettings } from './camera';
import { Fx } from './fx';
import { DIR_DELTA, Game, type Dir, type Point } from './game';
import type { Action, Input } from './input';
import { designContext, designForTile, OBJECT_BOX } from './objects';
import type { Effects, MapLevel } from './pocomap';
import type { SaveStore, SolveResult } from './profiles';
import { TapMoves, type TapTarget } from './tapMoves';
import { UI_FONT, panel, safeArea } from './theme';

const KEY_STEP_MS = 150;
// With the stick, step time follows how far it is pushed.
const PAD_STEP_SLOW_MS = 240;
const PAD_STEP_FAST_MS = 140;
// Starting a push with the controller only leans the gem in this far (in
// cells); holding for PUSH_COMMIT_MS commits it, letting go springs it back.
const NUDGE_DEPTH = 0.2;
const PUSH_COMMIT_MS = 200;
// How far the player squishes into a wall or a stuck gem.
const BUMP_DEPTH = 0.07;
// Light smoothing on drawn positions rounds off starts and stops.
const SMOOTH_MS = 30;
// Spring for the nudge offset: slightly underdamped, so it bounces back.
const SPRING_STIFFNESS = 520;
const SPRING_DAMPING = 2 * Math.sqrt(SPRING_STIFFNESS) * 0.45;
// Pushable objects are drawn about three quarters of a cell wide.
const OBJECT_SCALE = (0.78 * CELL) / OBJECT_BOX;
// How long an object pops when it changes look on reaching a goal.
const POP_MS = 260;
const PLAYER_HEAD_RADIUS = 0.24;
const PLAYER_HEAD_HEIGHT = 0.78;
const PLAYER_BODY_HEIGHT = 0.55;
// The board floats up into place, then PocoMan drops in.
const BOARD_INTRO_MS = 900;
const DROP_MS = 420;
// Pause on a solved board before the results appear.
const CELEBRATE_MS = 1600;
// Step times when a tap walks PocoMan somewhere or pushes for him.
const AUTO_WALK_MS = 115;
const AUTO_PUSH_MS = 170;
// Restart from the touch bar needs a second tap within this long.
const RESTART_CONFIRM_MS = 2500;

const SFX = {
  select: ['assets/sfx/ui-move.mp3'],
  step: [1, 2, 3, 4].map((i) => `assets/sfx/step-${i}.mp3`),
  push: [1, 2, 3, 4].map((i) => `assets/sfx/push-${i}.mp3`),
  goal: ['assets/sfx/goal-1.mp3', 'assets/sfx/goal-2.mp3'],
  complete: ['assets/sfx/level-complete.mp3'],
  floatIn: ['assets/sfx/float-in.mp3'],
};
export const PLAY_SOUNDS = Object.values(SFX).flat();

const COLORS = {
  outline: 0x23243a,
  floorA: 0xe9d3a0,
  floorB: 0xdfc58f,
  floorLine: 0xb99a66,
  goal: 0x8a5a32,
  wallTop: 0x9a9fb8,
  wallFront: 0x666b86,
  wallSide: 0x4f536b,
  rockFront: 0x7a5a4a,
  rockSide: 0x5c4339,
  body: 0x2f4fa8,
  cape: 0xc8372d,
  head: 0xf7c531,
  eye: 0x2a1e10,
  shadow: 0x000000,
};

function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * - `tap`: a single deliberate step, eased in and out.
 * - `start`: setting off while a direction is held; eases in and ends at
 *   full speed so a following step can carry on seamlessly.
 * - `linear`: continuing a run of steps.
 * - `stop`: the last of a run; full speed at the start, easing out.
 */
type Ease = 'tap' | 'start' | 'linear' | 'stop';

interface Tween {
  from: Point;
  to: Point;
  t: number;
  ms: number;
  ease: Ease;
}

const EASES: Record<Ease, (k: number) => number> = {
  tap: (k) => k * k * (3 - 2 * k),
  // Cubic with velocity 0.3 at the start and exactly 1 at the end.
  start: (k) => -0.7 * k * k * k + 1.4 * k * k + 0.3 * k,
  linear: (k) => k,
  stop: (k) => 1 - (-0.7 * (1 - k) ** 3 + 1.4 * (1 - k) ** 2 + 0.3 * (1 - k)),
};

const easeOutQuart = (k: number) => 1 - (1 - k) ** 4;
const easeOutBounce = (k: number) => {
  if (k < 0.7) return (k / 0.7) ** 2;
  const b = (k - 0.85) / 0.15;
  return 1 - 0.12 * (1 - b * b);
};

function lerpTween(tw: Tween): Point {
  const e = EASES[tw.ease](Math.min(tw.t, 1));
  return { x: tw.from.x + (tw.to.x - tw.from.x) * e, y: tw.from.y + (tw.to.y - tw.from.y) * e };
}

const still = (p: Point): Tween => ({ from: { ...p }, to: { ...p }, t: 1, ms: KEY_STEP_MS, ease: 'tap' });

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function rectOf(points: Point[]): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** How much of `target` is covered by `cover`, from 0 to 1. */
function overlapRatio(cover: Rect, target: Rect): number {
  const ix = Math.min(cover.right, target.right) - Math.max(cover.left, target.left);
  const iy = Math.min(cover.bottom, target.bottom) - Math.max(cover.top, target.top);
  if (ix <= 0 || iy <= 0) return 0;
  return (ix * iy) / ((target.right - target.left) * (target.bottom - target.top));
}

const flat = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);

export const formatTime = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};

export interface LevelComplete {
  index: number;
  moves: number;
  pushes: number;
  timeMs: number;
  solve: SolveResult;
}

export interface PlayEnv {
  app: Application;
  input: Input;
  sounds: SoundBank;
  levels: MapLevel[];
  effects: Effects;
  store: SaveStore;
  /** Speaks an original sample, waiting for any line still playing. */
  say: (sample: number | undefined) => void;
  onComplete: (result: LevelComplete) => void;
  onPause: () => void;
  onToggleMusic: () => void;
}

export type PlayScreen = ReturnType<typeof createPlayScreen>;

/** The board, PocoMan and the HUD: everything that happens while playing a level. */
export function createPlayScreen(env: PlayEnv, initialCamera: CameraSettings) {
  const { app, input, sounds, levels, effects, store, say } = env;

  const root = new Container();
  const world = new Container();
  const hud = new Container();
  root.addChild(world, hud);
  root.visible = false;

  let levelIndex = 0;
  let game = new Game(levels[0].rows);
  const isSolid = (x: number, y: number) => !!(game.floor[y]?.[x] || game.walls[y]?.[x]);

  const island = new Graphics();
  const floor = new Graphics();
  const objects = new Container();
  objects.sortableChildren = true;
  const fx = new Fx();
  const taps = new TapMoves();
  world.addChild(island, floor, taps.view, objects, fx);

  let cam = new Camera(initialCamera);
  let walls: { g: Graphics; rect: Rect; z: number }[] = [];
  let boardRect: Rect = { left: 0, top: 0, right: 1, bottom: 1 };

  interface GemView {
    root: Container;
    shadow: Graphics;
    art: Graphics;
    design: string;
    pop: number;
  }
  let gemViews: GemView[] = [];
  let gemTweens: Tween[] = [];
  let gemDrawn: Point[] = [];
  const playerView = new Graphics();
  objects.addChild(playerView);
  const playerTween: Tween = still(game.player);
  const playerDrawn: Point = { ...game.player };
  let facing: Dir = 'down';

  // Level state beyond the rules themselves.
  let revealed = false;
  let celebrated = false;
  let celebrateMs = 0;
  let elapsedMs = 0;
  let introMs = 0;
  let worldBaseY = 0;
  // Set while state is snapped (undo, restart, load) so looks change quietly.
  let quiet = true;
  let active = false;

  const stroke = { color: COLORS.outline, width: 1.5, alpha: 0.85, join: 'round' as const };

  /** Rebuilds everything that only depends on the level and the camera. */
  function drawBoard() {
    const P = (x: number, y: number, h = 0) => cam.project(x, y, h);
    const H = cam.settings.wallHeight;

    // Rocky underside, deepest under the middle of the board. Only the
    // front edge and the side facing the camera are visible.
    island.clear();
    const rockDepth = (vx: number, vy: number) => {
      const dx = (vx - game.width / 2) / (game.width / 2);
      const dy = (vy - game.height / 2) / (game.height / 2);
      const centre = Math.max(0, 1 - Math.hypot(dx, dy * 0.8));
      return 0.4 + centre * 2.2 + hash(vx, vy) * 0.4;
    };
    const rockFace = (ax: number, ay: number, bx: number, by: number, color: number) => {
      const a = P(ax, ay);
      const b = P(bx, by);
      const da = rockDepth(ax, ay) * CELL;
      const db = rockDepth(bx, by) * CELL;
      island.poly([a.x, a.y, b.x, b.y, b.x, b.y + db, a.x, a.y + da]).fill(color).stroke(stroke);
    };
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        if (!isSolid(x, y)) continue;
        if (!isSolid(x, y + 1)) rockFace(x, y + 1, x + 1, y + 1, COLORS.rockFront);
        if (cam.yawSign > 0 && !isSolid(x + 1, y)) rockFace(x + 1, y + 1, x + 1, y, COLORS.rockSide);
        if (cam.yawSign < 0 && !isSolid(x - 1, y)) rockFace(x, y, x, y + 1, COLORS.rockSide);
      }
    }

    // Floor under every solid cell, so faded walls don't show a hole.
    floor.clear();
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        if (!isSolid(x, y)) continue;
        const quad = [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)];
        floor
          .poly(flat(quad))
          .fill((x + y) % 2 ? COLORS.floorA : COLORS.floorB)
          .stroke({ color: COLORS.floorLine, width: 1, alpha: 0.7 });
        if (game.isGoal(x, y)) {
          const a = P(x + 0.25, y + 0.25);
          const b = P(x + 0.75, y + 0.75);
          const c = P(x + 0.75, y + 0.25);
          const d = P(x + 0.25, y + 0.75);
          floor
            .moveTo(a.x, a.y).lineTo(b.x, b.y)
            .moveTo(c.x, c.y).lineTo(d.x, d.y)
            .stroke({ color: COLORS.goal, width: 6, cap: 'round' });
        }
      }
    }

    for (const w of walls) w.g.destroy();
    walls = [];
    for (let y = 0; y < game.height; y++) {
      for (let x = 0; x < game.width; x++) {
        if (!game.walls[y][x]) continue;
        const g = new Graphics();
        const pts: Point[] = [];
        const face = (corners: Point[], color: number) => {
          g.poly(flat(corners)).fill(color).stroke(stroke);
          pts.push(...corners);
        };
        // Faces against a neighbouring wall can't be seen, so skip them.
        if (!game.walls[y + 1]?.[x]) {
          face([P(x, y + 1), P(x + 1, y + 1), P(x + 1, y + 1, H), P(x, y + 1, H)], COLORS.wallFront);
        }
        if (cam.yawSign > 0 && !game.walls[y][x + 1]) {
          face([P(x + 1, y + 1), P(x + 1, y), P(x + 1, y, H), P(x + 1, y + 1, H)], COLORS.wallSide);
        }
        if (cam.yawSign < 0 && !game.walls[y][x - 1]) {
          face([P(x, y), P(x, y + 1), P(x, y + 1, H), P(x, y, H)], COLORS.wallSide);
        }
        face([P(x, y, H), P(x + 1, y, H), P(x + 1, y + 1, H), P(x, y + 1, H)], COLORS.wallTop);
        const z = cam.depth(x + 0.5, y + 0.5);
        g.zIndex = z;
        objects.addChild(g);
        walls.push({ g, rect: rectOf(pts), z });
      }
    }

    const corners = [P(0, 0), P(game.width, 0), P(0, game.height), P(game.width, game.height)];
    const r = rectOf([...corners, ...corners.map((c) => ({ x: c.x, y: c.y - H * CELL }))]);
    // Room above for upright actors in the back row, and below for the rock.
    boardRect = { ...r, top: r.top - CELL * 0.8, bottom: r.bottom + CELL * 1.5 };
  }

  /** Sort by whichever end of a step is nearer the viewer, so an actor never
   *  pops behind a block it is walking in front of. */
  const tweenDepth = (tw: Tween) =>
    Math.max(cam.depth(tw.from.x + 0.5, tw.from.y + 0.5), cam.depth(tw.to.x + 0.5, tw.to.y + 0.5)) + 0.01;

  /** Draws a level's pushable object, in its on-goal look once it rests on a goal. */
  function drawGem(v: GemView, at: Point, onGoal: boolean, dt: number): Rect {
    const level = levels[levelIndex];
    const design = designForTile(onGoal ? level.goalTile : level.objectTile);
    const cx = at.x + 0.5;
    const cy = at.y + 0.5;
    const feet = cam.project(cx, cy);
    if (design !== v.design) {
      if (v.design && !quiet) {
        v.pop = 1;
        if (onGoal) {
          fx.sparkle(feet.x, feet.y - CELL * 0.35, 0.9);
          sounds.playVariant(SFX.goal, 0.55, 0.04);
          if (!revealed) {
            revealed = true;
            say(level.sounds.reveal);
          }
        }
      }
      v.design = design;
      v.art.context = designContext(design);
    }
    v.pop = Math.max(0, v.pop - dt / POP_MS);

    v.shadow.clear().poly(cam.groundCircle(cx, cy, 0.32)).fill({ color: COLORS.shadow, alpha: 0.22 });
    const s = OBJECT_SCALE * (1 + 0.3 * Math.sin(v.pop * Math.PI));
    v.art.position.set(feet.x, feet.y);
    v.art.scale.set(s);
    const half = (OBJECT_BOX / 2) * s;
    return { left: feet.x - half, top: feet.y - OBJECT_BOX * 0.9 * s, right: feet.x + half, bottom: feet.y };
  }

  function drawPlayer(at: Point, lift: number): Rect {
    const cx = at.x + 0.5;
    const cy = at.y + 0.5;
    const ground = cam.project(cx, cy);
    const up = (h: number) => {
      const p = cam.upright(cx, cy, h);
      return { x: p.x, y: p.y - lift };
    };
    const feet = { x: ground.x, y: ground.y - lift };
    const hip = up(PLAYER_BODY_HEIGHT);
    const head = up(PLAYER_HEAD_HEIGHT);
    const hr = PLAYER_HEAD_RADIUS * CELL;
    const bw = 0.42 * CELL;
    const g = playerView.clear();
    // The shadow stays on the floor and shrinks while he's in the air.
    const shadowScale = Math.max(0.3, 1 - lift / (CELL * 4));
    g.poly(cam.groundCircle(cx, cy, 0.3 * shadowScale)).fill({ color: COLORS.shadow, alpha: 0.22 * shadowScale });
    // The cape trails behind the body, so it is in front when walking away.
    const capeShift = facing === 'left' ? 1 : facing === 'right' ? -1 : 0;
    const drawCape = () =>
      g.roundRect(feet.x - bw * 0.55 + capeShift * bw * 0.35, hip.y, bw * 1.1, feet.y - hip.y - 2, 4)
        .fill(COLORS.cape)
        .stroke(stroke);
    if (facing !== 'up') drawCape();
    g.roundRect(feet.x - bw / 2, hip.y, bw, feet.y - hip.y, 6).fill(COLORS.body).stroke(stroke);
    if (facing === 'up') drawCape();
    g.circle(head.x, head.y, hr).fill(COLORS.head).stroke(stroke);
    if (facing !== 'up') {
      const look = facing === 'left' ? -0.45 : facing === 'right' ? 0.45 : 0;
      for (const side of [-1, 1]) {
        g.ellipse(head.x + (look + side * 0.3) * hr, head.y - hr * 0.05, hr * 0.1, hr * 0.2).fill(COLORS.eye);
      }
    }
    return { left: feet.x - hr, top: head.y - hr, right: feet.x + hr, bottom: feet.y };
  }

  // --- HUD ----------------------------------------------------------------
  const label = (size: number, color = 0xf3ead2, weight: '500' | '600' | '700' = '600') =>
    new Text({ text: '', style: { fontFamily: UI_FONT, fontSize: size, fontWeight: weight, fill: color } });

  const levelPanel = new Container();
  const levelBg = levelPanel.addChild(panel(210, 64));
  const levelIcon = levelPanel.addChild(new Graphics());
  levelIcon.position.set(34, 56);
  levelIcon.scale.set(0.46);
  const levelText = levelPanel.addChild(label(24, 0xf3ead2, '700'));
  levelText.position.set(66, 8);
  const profileText = levelPanel.addChild(label(13, 0x9fb0e8));
  profileText.position.set(67, 38);

  function counter(name: string, width: number) {
    const c = new Container();
    c.addChild(panel(width, 64));
    const l = c.addChild(label(12, 0x9fb0e8));
    l.text = name;
    l.anchor.set(0.5, 0);
    l.position.set(width / 2, 8);
    const v = c.addChild(label(26, 0xf3ead2, '700'));
    v.text = '0';
    v.anchor.set(0.5, 0);
    v.position.set(width / 2, 24);
    return { c, v, width };
  }
  const movesC = counter('MOVES', 92);
  const pushesC = counter('PUSHES', 92);
  const timeC = counter('TIME', 100);

  const hint = label(14, 0xc9d3f0, '500');
  hint.anchor.set(0.5, 1);
  hint.alpha = 0.8;

  // Short messages, in place of the original's message boxes.
  const toast = new Container();
  const toastBg = toast.addChild(new Graphics());
  const toastText = toast.addChild(label(18, 0xf3ead2, '600'));
  toastText.anchor.set(0.5);
  toast.alpha = 0;
  let toastMs = 0;
  function showToast(message: string) {
    toastText.text = message;
    const w = toastText.width + 40;
    toastBg.clear().roundRect(-w / 2, -22, w, 44, 22).fill({ color: 0x0b1030, alpha: 0.85 }).stroke({ color: 0xf2c531, width: 1.5, alpha: 0.6 });
    toastMs = 2500;
  }

  // Phones have no keys for these, so touch gets a bar of buttons.
  const ICON = { color: 0xf3ead2, width: 4, cap: 'round' as const, join: 'round' as const };
  const arrowHead = (g: Graphics, x: number, y: number, angle: number) => {
    const p = (a: number, r: number) => [x + Math.cos(angle + a) * r, y + Math.sin(angle + a) * r];
    g.poly([...p(0, 7), ...p(2.3, 7), ...p(-2.3, 7)]).fill(ICON.color);
  };
  const ICONS = {
    undo: (g: Graphics) => {
      g.arc(2, 2, 11, Math.PI * 1.05, Math.PI * 2.35).stroke(ICON);
      arrowHead(g, -9, 0, Math.PI * 0.55);
    },
    restart: (g: Graphics) => {
      g.arc(0, 0, 12, Math.PI * -0.35, Math.PI * 1.35).stroke(ICON);
      arrowHead(g, 6.5, -10, Math.PI * 0.2);
    },
    menu: (g: Graphics) => {
      g.moveTo(-6, -10).lineTo(-6, 10).moveTo(6, -10).lineTo(6, 10).stroke({ ...ICON, width: 5 });
    },
  };
  const BUTTON_SIZE = 64;
  function touchButton(icon: keyof typeof ICONS, name: string, onTap: () => void) {
    const c = new Container();
    const bg = c.addChild(new Graphics().circle(0, 0, BUTTON_SIZE / 2).fill({ color: 0x0b1030, alpha: 0.72 }).stroke({ color: 0x9fb0e8, width: 1.5, alpha: 0.35 }));
    const g = c.addChild(new Graphics());
    g.position.set(0, -6);
    ICONS[icon](g);
    const l = c.addChild(label(11, 0x9fb0e8, '600'));
    l.text = name;
    l.anchor.set(0.5, 0);
    l.position.set(0, 12);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    // The board listens for taps too; this one is the button's alone.
    c.on('pointerdown', (e) => {
      e.stopPropagation();
      bg.tint = 0xf2c531;
      c.scale.set(0.92);
    });
    const lift = () => {
      bg.tint = 0xffffff;
      c.scale.set(1);
    };
    c.on('pointerup', lift);
    c.on('pointerupoutside', lift);
    c.on('pointertap', () => acceptingTaps && onTap());
    return c;
  }
  let restartArmedMs = 0;
  const touchBar = new Container();
  touchBar.addChild(
    touchButton('undo', 'UNDO', () => runAction('undo')),
    touchButton('restart', 'RESTART', () => {
      if (game.moves === 0) return;
      if (restartArmedMs > 0) {
        restartArmedMs = 0;
        runAction('restart');
      } else {
        restartArmedMs = RESTART_CONFIRM_MS;
        showToast('Tap again to restart');
      }
    }),
    touchButton('menu', 'MENU', () => runAction('pause')),
  );
  touchBar.visible = false;

  hud.addChild(levelPanel, movesC.c, pushesC.c, timeC.c, hint, touchBar, toast);

  const KEYBOARD_HINT = 'Arrows / WASD move  ·  Z undo  ·  R restart  ·  Esc menu';
  const GAMEPAD_HINT = 'Stick / D-pad move  ·  B undo  ·  hold View restart  ·  Start menu';
  const TOUCH_HINT = 'Tap PocoMan or an object to see where it can go';
  const hintFor = { keyboard: KEYBOARD_HINT, gamepad: GAMEPAD_HINT, touch: TOUCH_HINT };

  function updateHud() {
    movesC.v.text = String(game.moves);
    pushesC.v.text = String(game.pushes);
    timeC.v.text = formatTime(elapsedMs);
  }

  // --- Layout -------------------------------------------------------------
  function layout() {
    // Everything is laid out inside the part of the screen clear of the
    // notch and home bar; the board's backdrop still fills it all.
    const safe = safeArea();
    const left = safe.left;
    const right = app.screen.width - safe.right;
    const width = right - left;
    const height = app.screen.height - safe.top - safe.bottom;
    const cx = left + width / 2;
    const bottomEdge = safe.top + height;
    const b = boardRect;
    const bw = b.right - b.left;
    const bh = b.bottom - b.top;
    // On a short (landscape) screen the touch buttons stack down the right
    // edge instead of taking a strip along the bottom.
    const touch = touchBar.visible;
    const column = touch && height < 560;
    const top = safe.top + (width < 640 ? 150 : 96);
    const bottom = touch && !column ? 150 : column ? 24 : 40;
    const sides = column ? 2 * (BUTTON_SIZE + 32) : width * 0.1;
    const scale = Math.min((width - sides) / bw, (bottomEdge - top - bottom) / bh, 2.2);
    world.scale.set(scale);
    world.pivot.set(b.left + bw / 2, b.top + bh / 2);
    worldBaseY = top + (bottomEdge - top - bottom + 10) / 2;
    world.position.set(cx, worldBaseY);

    levelPanel.position.set(left + 16, safe.top + 16);
    const gap = 8;
    let x = right - 16;
    for (const c of [timeC, pushesC, movesC]) {
      x -= c.width;
      c.c.position.set(x, safe.top + (width < 640 ? 88 : 16));
      x -= gap;
    }
    touchBar.children.forEach((button, i) =>
      column
        ? button.position.set(0, i * (BUTTON_SIZE + 12))
        : button.position.set((i - 1) * (BUTTON_SIZE + 22), 0),
    );
    if (column) touchBar.position.set(right - 16 - BUTTON_SIZE / 2, top + BUTTON_SIZE / 2);
    else touchBar.position.set(cx, bottomEdge - 16 - BUTTON_SIZE / 2);
    const above = touch && !column ? BUTTON_SIZE + 52 : 0;
    hint.position.set(cx, bottomEdge - 12 - above);
    toast.position.set(cx, bottomEdge - 64 - above);
  }

  function setCamera(s: CameraSettings) {
    cam = new Camera(s);
    drawBoard();
    layout();
  }

  // --- State ----------------------------------------------------------------
  // The nudge: a sprung offset (in cells) along `dir`, applied to the player
  // and, while leaning into a push, to that gem.
  const nudge = { dir: 'down' as Dir, gem: -1, offset: 0, velocity: 0, target: 0, heldMs: 0, active: false };
  // Direction of the last push, kept only while that direction stays held,
  // so pushing a gem several cells in a row doesn't need a nudge each time.
  let pushRun: Dir | null = null;
  // True on the frame a step finishes, so the next one can carry straight on.
  let justFinished = false;
  // Moves still to make for a tapped dot, and how many it started with.
  let autoPath: Dir[] = [];
  let autoLength = 0;
  // Taps on the board only count while the level is being played.
  let acceptingTaps = false;

  function resetNudge() {
    Object.assign(nudge, { gem: -1, offset: 0, velocity: 0, target: 0, heldMs: 0, active: false });
  }

  function snapToState() {
    Object.assign(playerTween, still(game.player));
    Object.assign(playerDrawn, game.player);
    game.gems.forEach((g, i) => {
      Object.assign(gemTweens[i], still(g));
      Object.assign(gemDrawn[i], g);
    });
    resetNudge();
    pushRun = null;
    autoPath = [];
    taps.clear();
    quiet = true;
    updateHud();
  }

  /** Remembers the level in progress, so it can be resumed exactly. */
  function saveRun() {
    const p = store.active;
    p.current = levelIndex;
    p.lastPlayedAt = Date.now();
    p.run = celebrated ? undefined : { levelNumber: levels[levelIndex].number, state: game.serialize(), elapsedMs };
    store.save();
  }

  type StepKind = 'walk' | 'push' | 'blocked';
  function classify(dir: Dir): StepKind {
    const d = DIR_DELTA[dir];
    const nx = game.player.x + d.x;
    const ny = game.player.y + d.y;
    if (game.isWall(nx, ny)) return 'blocked';
    if (game.gemAt(nx, ny) < 0) return 'walk';
    const bx = nx + d.x;
    const by = ny + d.y;
    return game.isWall(bx, by) || game.gemAt(bx, by) >= 0 ? 'blocked' : 'push';
  }

  function step(dir: Dir, ms: number, ease: Ease) {
    const d = DIR_DELTA[dir];
    // Carry on from wherever a nudge left things, so a committed push
    // doesn't jump back first.
    const lean = nudge.dir === dir ? nudge.offset : 0;
    const before = { x: game.player.x + d.x * lean, y: game.player.y + d.y * lean };
    const res = game.tryMove(dir);
    if (!res.moved) return;
    const remaining = 1 - lean;
    Object.assign(playerTween, { from: before, to: { ...game.player }, t: 0, ms: ms * remaining, ease });
    if (res.pushedGem !== null) {
      const g = game.gems[res.pushedGem];
      const gemLean = nudge.gem === res.pushedGem ? lean : 0;
      Object.assign(gemTweens[res.pushedGem], {
        from: { x: g.x - d.x + d.x * gemLean, y: g.y - d.y + d.y * gemLean },
        to: { ...g },
        t: 0,
        ms: ms * remaining,
        ease,
      });
    }
    pushRun = res.pushedGem !== null ? dir : null;
    const stats = store.active.stats;
    stats.moves++;
    // Footsteps and pushes play straight away; speech waits its turn.
    if (res.pushedGem === null) {
      if (store.settings.motionSounds) sounds.playVariant(SFX.step, 0.45);
    } else {
      stats.pushes++;
      if (store.settings.motionSounds) sounds.playVariant(SFX.push, 0.7);
      const g = game.gems[res.pushedGem];
      if (game.isDeadCorner(g.x, g.y)) say(effects.cornered);
    }
    if (lean) {
      // The lean now lives in the tween; move it out of the drawn offset.
      playerDrawn.x += d.x * lean;
      playerDrawn.y += d.y * lean;
      if (res.pushedGem !== null && nudge.gem === res.pushedGem) {
        gemDrawn[res.pushedGem].x += d.x * lean;
        gemDrawn[res.pushedGem].y += d.y * lean;
      }
      resetNudge();
    }
    // Stepping another way leaves any nudge to spring back on its own.
    updateHud();
    saveRun();
  }

  /** Starts (or resumes) a level, with the board floating in. */
  function start(index: number, opts: { resume?: boolean } = {}) {
    levelIndex = Math.min(levels.length - 1, Math.max(0, index));
    const level = levels[levelIndex];
    game = new Game(level.rows);
    elapsedMs = 0;
    const run = store.active.run;
    if (opts.resume !== false && run?.levelNumber === level.number && game.load(run.state)) {
      elapsedMs = run.elapsedMs;
    }
    for (const v of gemViews) v.root.destroy({ children: true });
    gemViews = game.gems.map(() => {
      const root = objects.addChild(new Container());
      const shadow = root.addChild(new Graphics());
      const art = root.addChild(new Graphics());
      return { root, shadow, art, design: '', pop: 0 };
    });
    gemTweens = game.gems.map(still);
    gemDrawn = game.gems.map((g) => ({ ...g }));
    facing = 'down';
    fx.clear();
    levelText.text = `Level ${level.number}`;
    profileText.text = store.active.name;
    levelIcon.context = designContext(designForTile(level.objectTile));
    revealed = false;
    celebrated = false;
    celebrateMs = 0;
    introMs = BOARD_INTRO_MS + DROP_MS;
    input.clearTaps();
    snapToState();
    drawBoard();
    layout();
    for (const w of walls) w.g.alpha = 1;
    sounds.playVariant(SFX.floatIn, 0.5, 0.03);
    say(level.sounds.start);
    saveRun();
  }

  function handleActions() {
    for (let a = input.takeAction(); a; a = input.takeAction()) {
      runAction(a);
      if (a === 'pause') return;
    }
  }

  /** Does what a key, button or the touch bar asked for. */
  function runAction(a: Action) {
    if (a === 'pause') return env.onPause();
    if (a === 'toggleMusic') env.onToggleMusic();
    if (celebrated || introMs > 0) return;
    if (a === 'undo') {
      // The original only speaks when a push is taken back.
      const pushes = game.pushes;
      if (game.undo()) {
        store.active.stats.undos++;
        if (game.pushes < pushes) say(effects.undo);
        snapToState();
        saveRun();
      }
    }
    if (a === 'restart' && game.moves > 0) {
      game.restart();
      store.active.stats.restarts++;
      snapToState();
      saveRun();
    }
    if (a === 'nextLevel' && levelIndex < levels.length - 1) {
      if (store.isUnlocked(levelIndex + 1)) {
        start(levelIndex + 1);
      } else {
        say(effects.mustSolve);
        showToast('Solve this level before going on');
      }
    }
    if (a === 'prevLevel') {
      if (levelIndex === 0) {
        say(effects.firstLevel);
        showToast("You're at the first level. Nowhere to go but up.");
      } else {
        start(levelIndex - 1);
      }
    }
    input.clearTaps();
  }

  // --- Tap controls -----------------------------------------------------------
  // Where each actor was drawn last frame, for telling what a tap landed on.
  let actorHits: { target: TapTarget; z: number; r: Rect }[] = [];

  function onBoardTap(e: FederatedPointerEvent) {
    if (!acceptingTaps || celebrated || introMs > 0 || game.isSolved()) return;
    // A tap mid-walk stops there; the tap then counts from where he stops.
    autoPath = [];
    const local = world.toLocal(e.global);
    const ground = cam.unproject(local.x, local.y);
    // Fingers are blunt, so actors are a bit bigger to tap than they look.
    const pad = 12 / world.scale.x;
    const drawn = actorHits
      .filter(({ r }) => local.x > r.left - pad && local.x < r.right + pad && local.y > r.top - pad && local.y < r.bottom + pad)
      .sort((a, b) => b.z - a.z)[0]?.target;
    const cx = Math.floor(ground.x);
    const cy = Math.floor(ground.y);
    const gem = game.gemAt(cx, cy);
    const underFoot: TapTarget | null =
      game.player.x === cx && game.player.y === cy ? { kind: 'player' } : gem >= 0 ? { kind: 'gem', index: gem } : null;

    const result = taps.tap(game, ground, drawn ?? underFoot);
    if (result === 'select') {
      sounds.playVariant(SFX.select, 0.3, 0.02);
      navigator.vibrate?.(8);
    } else if (Array.isArray(result)) {
      autoPath = result;
      autoLength = result.length;
    }
  }
  root.eventMode = 'static';
  root.hitArea = app.screen;
  root.on('pointerdown', onBoardTap);

  /** Takes the next move of a tapped walk or push, if there is one. */
  function autoStep(): boolean {
    const dir = autoPath.shift();
    if (!dir) return false;
    const kind = classify(dir);
    if (kind === 'blocked') {
      autoPath = [];
      return false;
    }
    facing = dir;
    const first = autoPath.length === autoLength - 1;
    const last = autoPath.length === 0;
    // Slow down into a push, so it reads as a shove rather than a stroll.
    const nextIsPush = !last && classify(autoPath[0]) === 'push';
    const ease: Ease = first && last ? 'tap' : first ? 'start' : last || (kind === 'walk' && nextIsPush) ? 'stop' : 'linear';
    step(dir, kind === 'push' ? AUTO_PUSH_MS : AUTO_WALK_MS, ease);
    if (kind === 'walk' && nextIsPush) autoLength = autoPath.length + 1;
    return true;
  }

  /** Decides the next step when the player is standing still. */
  function updateIntent(dt: number) {
    const intent = input.current();
    if (pushRun && intent.dir !== pushRun) pushRun = null;
    nudge.active = false;
    if (game.isSolved() || introMs > 0) {
      input.clearTaps();
      return;
    }

    const tap = input.takeTap();
    const dir = tap ?? intent.dir;
    // Keys and the controller take over from a tapped move.
    if (dir) {
      autoPath = [];
      taps.clear();
    } else if (autoStep()) {
      return;
    }
    if (!dir) return;
    facing = dir;

    const held = !tap;
    const fromPad = held && intent.source === 'gamepad';
    const ms = fromPad
      ? PAD_STEP_SLOW_MS + (PAD_STEP_FAST_MS - PAD_STEP_SLOW_MS) * intent.strength
      : KEY_STEP_MS;
    // A step that follows straight on from the previous one keeps full speed.
    const ease: Ease = tap ? 'tap' : justFinished ? 'linear' : 'start';

    const kind = classify(dir);
    if (kind === 'walk') {
      step(dir, ms, ease);
    } else if (kind === 'push') {
      // Keys are deliberate presses, and an ongoing run of pushes clearly
      // means to keep going; anything else on the controller nudges first.
      if (!fromPad || pushRun === dir) {
        step(dir, ms, ease);
        return;
      }
      if (nudge.dir !== dir || nudge.gem < 0) {
        Object.assign(nudge, { dir, heldMs: 0, offset: nudge.dir === dir ? nudge.offset : 0, velocity: 0 });
        const d = DIR_DELTA[dir];
        nudge.gem = game.gemAt(game.player.x + d.x, game.player.y + d.y);
      }
      nudge.active = true;
      nudge.heldMs += dt;
      nudge.target = NUDGE_DEPTH * Math.min(1, nudge.heldMs / PUSH_COMMIT_MS);
      if (nudge.heldMs >= PUSH_COMMIT_MS) step(dir, ms, 'start');
    } else if (held) {
      if (nudge.dir !== dir) Object.assign(nudge, { dir, offset: 0, velocity: 0 });
      nudge.gem = -1;
      nudge.active = true;
      nudge.target = BUMP_DEPTH;
    } else {
      // A tapped bump: a little kick that springs straight back.
      Object.assign(nudge, { dir, gem: -1, velocity: 2.2 });
    }
  }

  function updateSpring(dt: number) {
    if (!nudge.active) {
      nudge.target = 0;
      nudge.heldMs = 0;
    }
    const steps = Math.ceil(dt / 4);
    const h = dt / 1000 / steps;
    for (let i = 0; i < steps; i++) {
      const a = SPRING_STIFFNESS * (nudge.target - nudge.offset) - SPRING_DAMPING * nudge.velocity;
      nudge.velocity += a * h;
      nudge.offset += nudge.velocity * h;
    }
    if (!nudge.active && Math.abs(nudge.offset) < 0.001 && Math.abs(nudge.velocity) < 0.01) {
      nudge.offset = 0;
      nudge.velocity = 0;
      nudge.gem = -1;
    }
  }

  /** Advances one frame. With `playing` false (paused or in a menu) the
   *  board still animates, but takes no input and the clock stops. */
  function update(dt: number, playing: boolean) {
    acceptingTaps = playing;
    if (playing) handleActions();
    hint.visible = store.settings.showHints;
    hint.text = hintFor[input.lastSource];
    const touch = input.lastSource === 'touch';
    if (touchBar.visible !== touch) {
      touchBar.visible = touch;
      layout();
    }
    restartArmedMs = Math.max(0, restartArmedMs - dt);

    // The board floats up into place, then PocoMan drops in.
    introMs = Math.max(0, introMs - dt);
    const boardK = Math.min(1, (BOARD_INTRO_MS + DROP_MS - introMs) / BOARD_INTRO_MS);
    world.position.y = worldBaseY + (1 - easeOutQuart(boardK)) * app.screen.height * 0.6;
    world.alpha = Math.min(1, boardK * 2);
    const dropK = Math.min(1, Math.max(0, (DROP_MS - introMs) / DROP_MS));
    const lift = (1 - easeOutBounce(dropK)) * CELL * 7;

    // Advance the current step first, so a step that ends this frame can
    // hand over to the next one without a standing-still frame in between.
    const wasStepping = playerTween.t < 1;
    playerTween.t = Math.min(1, playerTween.t + dt / playerTween.ms);
    gemTweens.forEach((tw) => (tw.t = Math.min(1, tw.t + dt / tw.ms)));
    justFinished = wasStepping && playerTween.t >= 1;
    if (playing && playerTween.t >= 1) updateIntent(dt);
    else nudge.active = false;
    updateSpring(dt);

    if (playing && introMs === 0) {
      store.active.stats.playMs += dt;
      if (game.moves > 0 && !celebrated) elapsedMs += dt;
      timeC.v.text = formatTime(elapsedMs);
    }

    const smooth = 1 - Math.exp(-dt / SMOOTH_MS);
    const follow = (drawn: Point, target: Point) => {
      drawn.x += (target.x - drawn.x) * smooth;
      drawn.y += (target.y - drawn.y) * smooth;
    };
    const lean = DIR_DELTA[nudge.dir];
    follow(playerDrawn, lerpTween(playerTween));
    const pg = { x: playerDrawn.x + lean.x * nudge.offset, y: playerDrawn.y + lean.y * nudge.offset };

    // A little hop while walking stands in for a walk cycle.
    const playerRect = drawPlayer(pg, lift);
    playerView.y = (playerTween.t < 1 ? -Math.sin(playerTween.t * Math.PI) * 4 : 0) - taps.hover({ kind: 'player' }) / world.scale.y;
    playerView.zIndex = tweenDepth(playerTween);
    playerView.visible = introMs < DROP_MS;

    const actors: typeof actorHits = [{ target: { kind: 'player' }, z: playerView.zIndex, r: playerRect }];
    gemViews.forEach((v, i) => {
      follow(gemDrawn[i], lerpTween(gemTweens[i]));
      const off = nudge.gem === i ? nudge.offset : 0;
      const at = { x: gemDrawn[i].x + lean.x * off, y: gemDrawn[i].y + lean.y * off };
      const g = game.gems[i];
      // Mid-step it only keeps the on-goal look when going from goal to goal;
      // the tween can start part-way (after a nudge), so round to the cell.
      const tw = gemTweens[i];
      const fromGoal = game.isGoal(Math.round(tw.from.x), Math.round(tw.from.y));
      const onGoal = game.isGoal(g.x, g.y) && (tw.t >= 1 || fromGoal);
      v.root.zIndex = tweenDepth(gemTweens[i]);
      const target: TapTarget = { kind: 'gem', index: i };
      actors.push({ target, z: v.root.zIndex, r: drawGem(v, at, onGoal, dt) });
      v.art.y -= taps.hover(target) / world.scale.y;
    });
    actorHits = actors;
    quiet = false;
    taps.draw(cam, game, dt, 1 / world.scale.x);

    // Celebrate once the last object has actually landed, then show results.
    if (!celebrated && game.isSolved() && gemTweens.every((tw) => tw.t >= 1) && introMs === 0) {
      celebrated = true;
      celebrateMs = CELEBRATE_MS;
      const solve = store.recordSolve(levelIndex, game.moves, game.pushes, elapsedMs);
      say(levels[levelIndex].sounds.complete);
      sounds.playVariant(SFX.complete, 0.7, 0);
      const b = boardRect;
      fx.confetti(b.left, b.top, b.right - b.left, (b.bottom - b.top) * 0.7, 110);
      pendingResult = { index: levelIndex, moves: game.moves, pushes: game.pushes, timeMs: elapsedMs, solve };
    }
    if (celebrateMs > 0) {
      celebrateMs -= dt;
      if (celebrateMs <= 0 && pendingResult) {
        const result = pendingResult;
        pendingResult = null;
        env.onComplete(result);
      }
    }

    fx.update(dt);
    toastMs = Math.max(0, toastMs - dt);
    toast.alpha = Math.min(1, toastMs / 400);

    // Fade any wall that hides a good part of the player or a gem.
    for (const w of walls) {
      const hides = actors.some(({ z, r }) => w.z > z && overlapRatio(w.rect, r) > 0.3);
      const target = hides ? 0.4 : 1;
      w.g.alpha += (target - w.g.alpha) * Math.min(1, dt / 90);
    }
  }
  let pendingResult: LevelComplete | null = null;

  function setActive(on: boolean) {
    active = on;
    root.visible = on;
    if (!on) fx.clear();
  }

  app.renderer.on('resize', () => active && layout());

  return {
    root,
    start,
    update,
    layout,
    setCamera,
    setActive,
    saveRun,
    showToast,
    get levelIndex() {
      return levelIndex;
    },
    get game() {
      return game;
    },
    get nudge() {
      return nudge;
    },
  };
}
