import type { Point } from './game';

export interface CameraSettings {
  /** Rotation around the vertical axis, in degrees. Positive shows the right-hand faces. */
  yaw: number;
  /** Camera elevation above the horizon, in degrees. 90 is straight top-down. */
  pitch: number;
  /** Wall height, in cells. */
  wallHeight: number;
}

// Near top-down, so every goal and corridor stays readable.
export const DEFAULT_CAMERA: CameraSettings = { yaw: 8, pitch: 80, wallHeight: 0.8 };

// Characters and gems are drawn upright as if seen from this elevation
// rather than the board's, so they don't flatten in a top-down view.
const ACTOR_VIEW_PITCH = 35;
const ACTOR_HEIGHT_SCALE = Math.cos((ACTOR_VIEW_PITCH * Math.PI) / 180);

/** Size of one cell, in world pixels, before the board is scaled to fit. */
export const CELL = 64;

/**
 * Orthographic camera over the grid. Ground coordinates are in cells: x to
 * the right, y towards the viewer, h straight up.
 */
export class Camera {
  private cy: number;
  private sy: number;
  private sp: number;
  private cp: number;

  constructor(readonly settings: CameraSettings) {
    const yaw = (settings.yaw * Math.PI) / 180;
    const pitch = (settings.pitch * Math.PI) / 180;
    this.cy = Math.cos(yaw);
    this.sy = Math.sin(yaw);
    this.sp = Math.sin(pitch);
    this.cp = Math.cos(pitch);
  }

  get yawSign(): number {
    return Math.sign(this.sy);
  }

  project(gx: number, gy: number, h = 0): Point {
    return {
      x: (gx * this.cy - gy * this.sy) * CELL,
      y: ((gx * this.sy + gy * this.cy) * this.sp - h * this.cp) * CELL,
    };
  }

  /** The ground point that projects to (px, py): `project` undone at h = 0. */
  unproject(px: number, py: number): Point {
    const u = px / CELL;
    const v = py / (this.sp * CELL);
    return { x: u * this.cy + v * this.sy, y: v * this.cy - u * this.sy };
  }

  /** A point `h` cells above the ground on an upright actor standing at (gx, gy). */
  upright(gx: number, gy: number, h: number): Point {
    const feet = this.project(gx, gy);
    return { x: feet.x, y: feet.y - h * ACTOR_HEIGHT_SCALE * CELL };
  }

  /** Distance towards the viewer; draw lower values first. */
  depth(gx: number, gy: number): number {
    return gx * this.sy + gy * this.cy;
  }

  /** Flat polygon for a circle lying on the ground. */
  groundCircle(cx: number, cy: number, r: number, h = 0, segments = 28): number[] {
    const pts: number[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const p = this.project(cx + Math.cos(a) * r, cy + Math.sin(a) * r, h);
      pts.push(p.x, p.y);
    }
    return pts;
  }
}
