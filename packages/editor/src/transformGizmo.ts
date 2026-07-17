/**
 * Unity-style Scene transform gizmo (screen-space draw + hit + 1:1 drag).
 */

import type { Camera, Quat, Vec3 } from './math3d';
import { add, cross, dot, lookBasis, norm, project, scale, sub } from './math3d';
import { transformBasis } from './editorGizmos';
import type { GizmoMode } from './editorTool';

export type GizmoAxis = 'x' | 'y' | 'z';
export type GizmoPlane = 'xy' | 'xz' | 'yz';

export type GizmoPart =
  | { kind: 'axis'; axis: GizmoAxis }
  | { kind: 'plane'; plane: GizmoPlane }
  | { kind: 'center' }
  /** RectTransform size handle (Unity Rect tool). */
  | { kind: 'size'; handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' }
  | { kind: 'anchor'; target: 'min' | 'max' | 'both' };

export type GizmoHit =
  | { kind: 'axis'; axis: GizmoAxis; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'plane'; plane: GizmoPlane; cx: number; cy: number; size: number }
  | { kind: 'center'; x: number; y: number; r: number };

const AXIS_COLORS: Record<GizmoAxis, string> = {
  x: '#e74c3c',
  y: '#2ecc71',
  z: '#3498db',
};
const PLANE_COLORS: Record<GizmoPlane, string> = {
  xy: '#3498db', // Z normal → blue tint
  xz: '#2ecc71', // Y
  yz: '#e74c3c', // X
};
const HOVER = '#ffc107';
const ACTIVE = '#ffe566';

const AXIS_LEN = 78;
const AXIS_GAP = 14; // leave hole near center (Unity-like)
const SHAFT_W = 3.5;
const HEAD_LEN = 14;
const HEAD_W = 7;
const PLANE_SIZE = 16;
const PLANE_OFF = 22;
const HIT_AXIS = 11;
const HIT_PLANE = 2;
const HIT_RING = 16; // px band around rotate ellipse
const ROTATE_R = AXIS_LEN * 0.85;

type Vp = { x: number; y: number; w: number; h: number };

function colorFor(part: GizmoPart, hover: GizmoPart | null, active: GizmoPart | null): string {
  const same =
    (a: GizmoPart | null, b: GizmoPart) =>
      !!a &&
      a.kind === b.kind &&
      ((a.kind === 'axis' && b.kind === 'axis' && a.axis === b.axis) ||
        (a.kind === 'plane' && b.kind === 'plane' && a.plane === b.plane) ||
        (a.kind === 'center' && b.kind === 'center'));

  if (same(active, part) || same(hover, part)) {
    return active && same(active, part) ? ACTIVE : HOVER;
  }
  if (part.kind === 'axis') return AXIS_COLORS[part.axis];
  if (part.kind === 'plane') return PLANE_COLORS[part.plane];
  return '#f0f0f0';
}

function screenAxisTip(
  origin: Vec3,
  dir: Vec3,
  cam: Camera,
  vp: Vp,
  o: { x: number; y: number },
): { x: number; y: number; ang: number; visible: boolean } | null {
  const tipW = add(origin, scale(dir, 1.2));
  const tip = project(tipW, cam, vp);
  if (!tip) return null;
  const dx = tip.x - o.x;
  const dy = tip.y - o.y;
  const dl = Math.hypot(dx, dy);
  if (dl < 4) return { x: o.x, y: o.y, ang: 0, visible: false }; // edge-on
  return {
    x: o.x + (dx / dl) * AXIS_LEN,
    y: o.y + (dy / dl) * AXIS_LEN,
    ang: Math.atan2(dy, dx),
    visible: true,
  };
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  fill: string,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - HEAD_LEN * Math.cos(ang - 0.38), y - HEAD_LEN * Math.sin(ang - 0.38));
  ctx.lineTo(x - HEAD_LEN * Math.cos(ang) * 0.55, y - HEAD_LEN * Math.sin(ang) * 0.55);
  ctx.lineTo(x - HEAD_LEN * Math.cos(ang + 0.38), y - HEAD_LEN * Math.sin(ang + 0.38));
  ctx.closePath();
  ctx.fill();
}

function drawShaft(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  width: number,
) {
  // subtle outline for contrast on any sky
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = width + 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function planeCorners(
  ox: number,
  oy: number,
  ax: { x: number; y: number },
  ay: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const ux = ax.x - ox;
  const uy = ax.y - oy;
  const vx = ay.x - ox;
  const vy = ay.y - oy;
  const ul = Math.hypot(ux, uy) || 1;
  const vl = Math.hypot(vx, vy) || 1;
  const s = PLANE_SIZE;
  const o = PLANE_OFF;
  const uxN = ux / ul;
  const uyN = uy / ul;
  const vxN = vx / vl;
  const vyN = vy / vl;
  const c0x = ox + uxN * o + vxN * o;
  const c0y = oy + uyN * o + vyN * o;
  return [
    { x: c0x, y: c0y },
    { x: c0x + uxN * s, y: c0y + uyN * s },
    { x: c0x + uxN * s + vxN * s, y: c0y + uyN * s + vyN * s },
    { x: c0x + vxN * s, y: c0y + vyN * s },
  ];
}

function drawPlaneQuad(
  ctx: CanvasRenderingContext2D,
  corners: Array<{ x: number; y: number }>,
  color: string,
  hot: boolean,
) {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
  ctx.closePath();
  ctx.fillStyle = `rgba(${r},${g},${b},${hot ? 0.65 : 0.28})`;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = hot ? 2 : 1.25;
  ctx.stroke();
}

function pointInQuad(px: number, py: number, c: Array<{ x: number; y: number }>): boolean {
  // barycentric via two triangles
  const tri = (a: number, b: number, c0: number, d: number, e: number, f: number) => {
    const v0x = c0 - a;
    const v0y = d - b;
    const v1x = e - a;
    const v1y = f - b;
    const v2x = px - a;
    const v2y = py - b;
    const den = v0x * v1y - v1x * v0y;
    if (Math.abs(den) < 1e-8) return false;
    const u = (v2x * v1y - v1x * v2y) / den;
    const v = (v0x * v2y - v2x * v0y) / den;
    return u >= 0 && v >= 0 && u + v <= 1;
  };
  return (
    tri(c[0].x, c[0].y, c[1].x, c[1].y, c[2].x, c[2].y) ||
    tri(c[0].x, c[0].y, c[2].x, c[2].y, c[3].x, c[3].y)
  );
}

export function drawTransformGizmo(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  vp: Vp,
  worldOrigin: Vec3,
  rotation: Quat | null | undefined,
  mode: GizmoMode,
  hover: GizmoPart | null,
  active: GizmoPart | null,
): GizmoHit[] {
  const o = project(worldOrigin, cam, vp);
  if (!o) return [];

  // 与移动/缩放同一套本地 XYZ（红右、绿上、蓝前）
  const basis = transformBasis(rotation);
  const dirs: Record<GizmoAxis, Vec3> = {
    x: basis.right,
    y: basis.up,
    z: basis.forward,
  };

  const tips: Partial<Record<GizmoAxis, { x: number; y: number; ang: number; visible: boolean }>> =
    {};
  for (const axis of ['x', 'y', 'z'] as GizmoAxis[]) {
    const t = screenAxisTip(worldOrigin, dirs[axis], cam, vp, o);
    if (t) tips[axis] = t;
  }

  const hits: GizmoHit[] = [];

  // --- Planes (draw under axes) ---
  if (mode === 'translate') {
    const planeDefs: Array<{ plane: GizmoPlane; a: GizmoAxis; b: GizmoAxis }> = [
      { plane: 'xy', a: 'x', b: 'y' },
      { plane: 'xz', a: 'x', b: 'z' },
      { plane: 'yz', a: 'y', b: 'z' },
    ];
    for (const pd of planeDefs) {
      const ta = tips[pd.a];
      const tb = tips[pd.b];
      if (!ta?.visible || !tb?.visible) continue;
      const part: GizmoPart = { kind: 'plane', plane: pd.plane };
      const col = colorFor(part, hover, active);
      const corners = planeCorners(o.x, o.y, ta, tb);
      const hot =
        (hover?.kind === 'plane' && hover.plane === pd.plane) ||
        (active?.kind === 'plane' && active.plane === pd.plane);
      drawPlaneQuad(ctx, corners, col, hot);
      const cx = (corners[0].x + corners[2].x) / 2;
      const cy = (corners[0].y + corners[2].y) / 2;
      hits.push({ kind: 'plane', plane: pd.plane, cx, cy, size: PLANE_SIZE });
      // store corners on hit via extending — use size + center for simple hit; better: keep corners
      (hits[hits.length - 1] as GizmoHit & { corners?: typeof corners }).corners = corners;
    }
  }

  // --- Axes (translate / scale shafts; rotate 也画短轴，与移动 XYZ 对齐) ---
  if (mode !== 'rotate') {
    for (const axis of ['x', 'y', 'z'] as GizmoAxis[]) {
      const tip = tips[axis];
      if (!tip?.visible) continue;
      const part: GizmoPart = { kind: 'axis', axis };
      const col = colorFor(part, hover, active);
      const dx = tip.x - o.x;
      const dy = tip.y - o.y;
      const dl = Math.hypot(dx, dy) || 1;
      const nx = dx / dl;
      const ny = dy / dl;
      const x0 = o.x + nx * AXIS_GAP;
      const y0 = o.y + ny * AXIS_GAP;
      const x1 = tip.x - (mode === 'translate' ? nx * (HEAD_LEN - 2) : 0);
      const y1 = tip.y - (mode === 'translate' ? ny * (HEAD_LEN - 2) : 0);

      const hot =
        (hover?.kind === 'axis' && hover.axis === axis) ||
        (active?.kind === 'axis' && active.axis === axis);
      drawShaft(ctx, x0, y0, x1, y1, col, hot ? SHAFT_W + 1.5 : SHAFT_W);

      if (mode === 'translate') {
        drawArrowHead(ctx, tip.x, tip.y, tip.ang, col);
      } else if (mode === 'scale') {
        const s = hot ? 7 : 6;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(tip.x - s - 1, tip.y - s - 1, s * 2 + 2, s * 2 + 2);
        ctx.fillStyle = col;
        ctx.fillRect(tip.x - s, tip.y - s, s * 2, s * 2);
      }

      hits.unshift({ kind: 'axis', axis, x0, y0, x1: tip.x, y1: tip.y });
    }
  } else {
    // Rotate: 细轴指示方向（不可点，点圆环）
    for (const axis of ['x', 'y', 'z'] as GizmoAxis[]) {
      const tip = tips[axis];
      if (!tip?.visible) continue;
      const part: GizmoPart = { kind: 'axis', axis };
      const col = colorFor(part, hover, active);
      const dx = tip.x - o.x;
      const dy = tip.y - o.y;
      const dl = Math.hypot(dx, dy) || 1;
      const nx = dx / dl;
      const ny = dy / dl;
      const len = ROTATE_R * 0.55;
      drawShaft(
        ctx,
        o.x + nx * 6,
        o.y + ny * 6,
        o.x + nx * len,
        o.y + ny * len,
        col,
        2,
      );
    }
  }

  // Rotate: three thick arcs (easier to see & grab)
  if (mode === 'rotate') {
    const screenDir = (
      tip: { x: number; y: number } | undefined,
    ): { x: number; y: number } | null => {
      if (!tip) return null;
      const dx = tip.x - o.x;
      const dy = tip.y - o.y;
      const l = Math.hypot(dx, dy);
      if (l < 3) return null;
      return { x: dx / l, y: dy / l };
    };

    for (const axis of ['x', 'y', 'z'] as GizmoAxis[]) {
      const part: GizmoPart = { kind: 'axis', axis };
      const col = colorFor(part, hover, active);
      const hot =
        (hover?.kind === 'axis' && hover.axis === axis) ||
        (active?.kind === 'axis' && active.axis === axis);
      const others = (['x', 'y', 'z'] as GizmoAxis[]).filter((a) => a !== axis);
      let da = screenDir(tips[others[0]]);
      let db = screenDir(tips[others[1]]);
      if (!da && !db) continue;
      if (!da && db) da = { x: -db.y, y: db.x };
      if (!db && da) db = { x: -da.y, y: da.x };
      const ux = da!.x;
      const uy = da!.y;
      const vx = db!.x;
      const vy = db!.y;
      if (Math.abs(ux * vy - vx * uy) < 0.02) continue;

      const r = ROTATE_R;
      ctx.beginPath();
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const px = o.x + Math.cos(t) * ux * r + Math.sin(t) * vx * r;
        const py = o.y + Math.cos(t) * uy * r + Math.sin(t) * vy * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = (hot ? 7 : 5) + 2;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = hot ? 7 : 5;
      ctx.stroke();

      hits.unshift({
        kind: 'axis',
        axis,
        x0: o.x - r,
        y0: o.y,
        x1: o.x + r,
        y1: o.y,
      });
      (
        hits[0] as GizmoHit & {
          ring?: {
            cx: number;
            cy: number;
            r: number;
            ux: number;
            uy: number;
            vx: number;
            vy: number;
          };
        }
      ).ring = { cx: o.x, cy: o.y, r, ux, uy, vx, vy };
    }

    // Outer screen-space free-rotate ring (Unity-like)
    {
      const r = ROTATE_R + 18;
      const hot = hover?.kind === 'center' || active?.kind === 'center';
      const col = hot ? HOVER : 'rgba(220,220,220,0.85)';
      ctx.beginPath();
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = (hot ? 5 : 3.5) + 1.5;
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = hot ? 5 : 3.5;
      ctx.stroke();
      hits.unshift({ kind: 'center', x: o.x, y: o.y, r });
      (
        hits[0] as GizmoHit & { screenRing?: { cx: number; cy: number; r: number } }
      ).screenRing = { cx: o.x, cy: o.y, r };
    }
  }

  // Center handle
  if (mode === 'translate' || mode === 'scale') {
    const part: GizmoPart = { kind: 'center' };
    const col = colorFor(part, hover, active);
    const hot =
      (hover?.kind === 'center') || (active?.kind === 'center');
    const s = hot ? 6 : 5;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(o.x - s - 1, o.y - s - 1, s * 2 + 2, s * 2 + 2);
    ctx.fillStyle = col;
    ctx.fillRect(o.x - s, o.y - s, s * 2, s * 2);
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.strokeRect(o.x - s, o.y - s, s * 2, s * 2);
    hits.unshift({ kind: 'center', x: o.x, y: o.y, r: s + 4 });
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(o.x, o.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return hits;
}

type PlaneHit = GizmoHit & { corners?: Array<{ x: number; y: number }> };
type AxisHit = GizmoHit & {
  ring?: { cx: number; cy: number; r: number; ux: number; uy: number; vx: number; vy: number };
};
type CenterHit = GizmoHit & { screenRing?: { cx: number; cy: number; r: number } };

export function hitTestTransformGizmo(hits: GizmoHit[], x: number, y: number): GizmoPart | null {
  // 1) Colored rotate ellipses — pick nearest ring band
  let bestRing: { part: GizmoPart; dist: number } | null = null;
  for (const h of hits) {
    if (h.kind !== 'axis') continue;
    const ah = h as AxisHit;
    if (!ah.ring) continue;
    const { cx, cy, r, ux, uy, vx, vy } = ah.ring;
    const dx = x - cx;
    const dy = y - cy;
    const Ax = ux * r;
    const Ay = uy * r;
    const Bx = vx * r;
    const By = vy * r;
    const det = Ax * By - Bx * Ay;
    if (Math.abs(det) < 1e-6) continue;
    const a = (dx * By - Bx * dy) / det;
    const b = (Ax * dy - dx * Ay) / det;
    const rad = Math.hypot(a, b);
    // approximate pixel distance to ellipse curve
    const dist = Math.abs(rad - 1) * r;
    if (dist < HIT_RING && (!bestRing || dist < bestRing.dist)) {
      bestRing = { part: { kind: 'axis', axis: h.axis }, dist };
    }
  }
  if (bestRing) return bestRing.part;

  // 2) Outer screen-space free-rotate annulus
  for (const h of hits) {
    if (h.kind !== 'center') continue;
    const ch = h as CenterHit;
    if (ch.screenRing) {
      const d = Math.hypot(x - ch.screenRing.cx, y - ch.screenRing.cy);
      if (Math.abs(d - ch.screenRing.r) < HIT_RING + 4) {
        return { kind: 'center' };
      }
      continue;
    }
    if (Math.hypot(x - h.x, y - h.y) <= h.r) {
      return { kind: 'center' };
    }
  }

  // 3) Translate/scale axis shafts
  for (const h of hits) {
    if (h.kind !== 'axis') continue;
    const ah = h as AxisHit;
    if (ah.ring) continue;
    const dx = h.x1 - h.x0;
    const dy = h.y1 - h.y0;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - h.x0) * dx + (y - h.y0) * dy) / len2));
    const px = h.x0 + dx * t;
    const py = h.y0 + dy * t;
    if (Math.hypot(x - px, y - py) < HIT_AXIS) return { kind: 'axis', axis: h.axis };
  }

  // 4) Planes
  for (const h of hits) {
    if (h.kind !== 'plane') continue;
    const ph = h as PlaneHit;
    if (ph.corners && pointInQuad(x, y, ph.corners)) {
      return { kind: 'plane', plane: h.plane };
    }
    if (Math.hypot(x - h.cx, y - h.cy) < h.size / 2 + HIT_PLANE) {
      return { kind: 'plane', plane: h.plane };
    }
  }
  return null;
}

/** World delta for 1 screen-pixel along a unit world axis (Unity 1:1 feel). */
export function worldDeltaAlongAxis(
  origin: Vec3,
  axis: Vec3,
  screenDelta: { dx: number; dy: number },
  cam: Camera,
  vp: Vp,
): Vec3 {
  const p0 = project(origin, cam, vp);
  const p1 = project(add(origin, axis), cam, vp);
  if (!p0 || !p1) return [0, 0, 0];
  const sx = p1.x - p0.x;
  const sy = p1.y - p0.y;
  const denom = sx * sx + sy * sy;
  if (denom < 1e-4) return [0, 0, 0]; // edge-on
  const t = (screenDelta.dx * sx + screenDelta.dy * sy) / denom;
  return scale(axis, t);
}

export function worldDeltaOnPlane(
  origin: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  screenDelta: { dx: number; dy: number },
  cam: Camera,
  vp: Vp,
): Vec3 {
  const da = worldDeltaAlongAxis(origin, axisA, screenDelta, cam, vp);
  const db = worldDeltaAlongAxis(origin, axisB, screenDelta, cam, vp);
  return add(da, db);
}

/** View-plane drag (center handle): pan in camera right/up, depth-matched. */
export function worldDeltaViewPlane(
  origin: Vec3,
  screenDelta: { dx: number; dy: number },
  cam: Camera,
  vp: Vp,
): Vec3 {
  const p0 = project(origin, cam, vp);
  if (!p0) return [0, 0, 0];
  const { right, up } = lookBasis(cam.eye, cam.target);
  const pr = project(add(origin, right), cam, vp);
  const pu = project(add(origin, up), cam, vp);
  if (!pr || !pu) return [0, 0, 0];
  const rx = pr.x - p0.x;
  const ry = pr.y - p0.y;
  const ux = pu.x - p0.x;
  const uy = pu.y - p0.y;
  const det = rx * uy - ux * ry;
  if (Math.abs(det) < 1e-4) return [0, 0, 0];
  const tr = (screenDelta.dx * uy - screenDelta.dy * ux) / det;
  const tu = (rx * screenDelta.dy - ry * screenDelta.dx) / det;
  return add(scale(right, tr), scale(up, tu));
}

export function gizmoPartEquals(a: GizmoPart | null, b: GizmoPart | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'axis' && b.kind === 'axis') return a.axis === b.axis;
  if (a.kind === 'plane' && b.kind === 'plane') return a.plane === b.plane;
  if (a.kind === 'size' && b.kind === 'size') return a.handle === b.handle;
  if (a.kind === 'anchor' && b.kind === 'anchor') return a.target === b.target;
  return a.kind === 'center';
}

export function cursorForGizmoPart(part: GizmoPart | null): string {
  if (!part) return 'default';
  if (part.kind === 'center') return 'move';
  if (part.kind === 'plane') return 'move';
  if (part.kind === 'anchor') return 'move';
  return 'grab';
}

export function worldAxisVec(axis: GizmoAxis): Vec3 {
  return axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
}

function planeBasis(axis: Vec3): { u: Vec3; v: Vec3 } {
  const a = norm(axis);
  const tmp: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(a, tmp));
  const v = norm(cross(a, u));
  return { u, v };
}

/** Unproject screen pixel → world ray (matches `project` NDC). */
export function screenRay(
  sx: number,
  sy: number,
  cam: Camera,
  vp: Vp,
): { origin: Vec3; dir: Vec3 } {
  const { forward, right, up } = lookBasis(cam.eye, cam.target);
  const aspect = vp.w / Math.max(1, vp.h);
  const tanHalf = Math.tan(((cam.fovYDeg * Math.PI) / 180) * 0.5);
  const ndcX = ((sx - vp.x) / Math.max(1, vp.w)) * 2 - 1;
  const ndcY = 1 - ((sy - vp.y) / Math.max(1, vp.h)) * 2;
  const dir = norm(
    add(add(forward, scale(right, ndcX * tanHalf * aspect)), scale(up, ndcY * tanHalf)),
  );
  return { origin: [...cam.eye] as Vec3, dir };
}

function intersectRayPlane(
  rayOrigin: Vec3,
  rayDir: Vec3,
  planeOrigin: Vec3,
  planeNormal: Vec3,
): Vec3 | null {
  const n = norm(planeNormal);
  const denom = dot(rayDir, n);
  if (Math.abs(denom) < 1e-5) return null;
  const t = dot(sub(planeOrigin, rayOrigin), n) / denom;
  if (t < 0.02) return null;
  return add(rayOrigin, scale(rayDir, t));
}

/**
 * Angle (radians) of the mouse ray hit around `axis`, in the plane through `origin`.
 * Used so dragging the X/Y/Z ring only spins that world axis.
 */
export function angleAroundWorldAxis(
  origin: Vec3,
  axis: Vec3,
  screenX: number,
  screenY: number,
  cam: Camera,
  vp: Vp,
): number | null {
  const ray = screenRay(screenX, screenY, cam, vp);
  const hit = intersectRayPlane(ray.origin, ray.dir, origin, axis);
  if (!hit) return null;
  const { u, v } = planeBasis(axis);
  const w = sub(hit, origin);
  const x = dot(w, u);
  const y = dot(w, v);
  if (Math.hypot(x, y) < 1e-8) return null;
  return Math.atan2(y, x);
}

