/**
 * Screen-space RectTransform gizmo (Scene view UI — move / rotate / scale).
 * Axes: local X (red) / local Y (green), oriented by local_rotation.
 */

import type { GizmoMode, GizmoPart } from './transformGizmo';
import type { Rect } from './ui/rectLayout';

export type RectGizmoHit =
  | { kind: 'axis'; axis: 'x' | 'y'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'center'; x: number; y: number; r: number }
  | { kind: 'ring'; cx: number; cy: number; r: number };

const AXIS_LEN = 56;
const AXIS_GAP = 10;
const SHAFT_W = 3;
const HEAD_LEN = 11;
const HEAD_W = 5.5;
const HIT_AXIS = 10;
const HIT_CENTER = 9;
const HIT_RING = 12;
const ROTATE_R = AXIS_LEN * 0.9;

const COL = { x: '#e74c3c', y: '#2ecc71', center: '#f0f0f0', ring: '#88c0ff' };
const HOVER = '#ffc107';
const ACTIVE = '#ffe566';

function samePart(a: GizmoPart | null, b: GizmoPart): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'axis' && b.kind === 'axis') return a.axis === b.axis;
  if (a.kind === 'center' && b.kind === 'center') return true;
  return false;
}

function colorOf(part: GizmoPart, hover: GizmoPart | null, active: GizmoPart | null, base: string) {
  if (samePart(active, part)) return ACTIVE;
  if (samePart(hover, part)) return HOVER;
  return base;
}

function arrowHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  fill: string,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - HEAD_LEN * Math.cos(ang - 0.4), y - HEAD_LEN * Math.sin(ang - 0.4));
  ctx.lineTo(x - HEAD_LEN * Math.cos(ang) * 0.55, y - HEAD_LEN * Math.sin(ang) * 0.55);
  ctx.lineTo(x - HEAD_LEN * Math.cos(ang + 0.4), y - HEAD_LEN * Math.sin(ang + 0.4));
  ctx.closePath();
  ctx.fill();
}

function scaleBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
) {
  const s = 6;
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1;
  ctx.fillRect(x - s / 2, y - s / 2, s, s);
  ctx.strokeRect(x - s / 2 + 0.5, y - s / 2 + 0.5, s - 1, s - 1);
}

/** Pivot point of a laid-out UI rect. */
export function rectPivot(rect: Rect, pivot: [number, number] = [0.5, 0.5]): { x: number; y: number } {
  return {
    x: rect.x + rect.w * pivot[0],
    y: rect.y + rect.h * pivot[1],
  };
}

/** Local UI axes in screen space (y-down). rotDeg = Z rotation (Unity, degrees CCW).
 *  Always orthonormal: X ⊥ Y, both unit length, glued to the object's local XY. */
export function rectLocalAxes(rotDeg: number): { x: { dx: number; dy: number }; y: { dx: number; dy: number } } {
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // Unity y-up: X=(c,s) Y=(-s,c) → screen y-down flip Y:
  return {
    x: { dx: c, dy: -s },
    y: { dx: -s, dy: -c },
  };
}

export function drawRectGizmo(
  ctx: CanvasRenderingContext2D,
  pivot: { x: number; y: number },
  rotDeg: number,
  mode: GizmoMode,
  hover: GizmoPart | null,
  active: GizmoPart | null,
): RectGizmoHit[] {
  const hits: RectGizmoHit[] = [];
  const axes = rectLocalAxes(rotDeg);
  const ox = pivot.x;
  const oy = pivot.y;

  if (mode === 'translate' || mode === 'scale') {
    for (const axis of ['x', 'y'] as const) {
      const dir = axes[axis];
      const ang = Math.atan2(dir.dy, dir.dx);
      const x0 = ox + dir.dx * AXIS_GAP;
      const y0 = oy + dir.dy * AXIS_GAP;
      const x1 = ox + dir.dx * AXIS_LEN;
      const y1 = oy + dir.dy * AXIS_LEN;
      const part: GizmoPart = { kind: 'axis', axis };
      const col = colorOf(part, hover, active, COL[axis]);

      ctx.strokeStyle = col;
      ctx.lineWidth = SHAFT_W;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      if (mode === 'translate') arrowHead(ctx, x1, y1, ang, col);
      else scaleBox(ctx, x1, y1, col);

      hits.push({ kind: 'axis', axis, x0, y0, x1, y1 });
    }

    const part: GizmoPart = { kind: 'center' };
    const col = colorOf(part, hover, active, COL.center);
    ctx.fillStyle = col;
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.rect(ox - 5, oy - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
    hits.push({ kind: 'center', x: ox, y: oy, r: HIT_CENTER });
  }

  if (mode === 'rotate') {
    const part: GizmoPart = { kind: 'center' };
    const col = colorOf(part, hover, active, COL.ring);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ox, oy, ROTATE_R, 0, Math.PI * 2);
    ctx.stroke();
    // handle knob along local X
    const tip = {
      x: ox + axes.x.dx * ROTATE_R,
      y: oy + axes.x.dy * ROTATE_R,
    };
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 5, 0, Math.PI * 2);
    ctx.fill();
    hits.push({ kind: 'ring', cx: ox, cy: oy, r: ROTATE_R });
    hits.push({ kind: 'center', x: ox, y: oy, r: HIT_CENTER });
  }

  return hits;
}

export function hitTestRectGizmo(hits: RectGizmoHit[], x: number, y: number): GizmoPart | null {
  // Prefer axes / center over ring
  for (const h of hits) {
    if (h.kind === 'center') {
      if (Math.hypot(x - h.x, y - h.y) <= h.r) return { kind: 'center' };
    }
  }
  for (const h of hits) {
    if (h.kind === 'axis') {
      const d = distToSeg(x, y, h.x0, h.y0, h.x1, h.y1);
      if (d <= HIT_AXIS) return { kind: 'axis', axis: h.axis };
    }
  }
  for (const h of hits) {
    if (h.kind === 'ring') {
      const d = Math.abs(Math.hypot(x - h.cx, y - h.cy) - h.r);
      if (d <= HIT_RING) return { kind: 'center' }; // treat as rotate grab
    }
  }
  return null;
}

function distToSeg(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - x0, py - y0);
  let t = ((px - x0) * dx + (py - y0) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

export function cursorForRectGizmo(part: GizmoPart | null, mode: GizmoMode): string {
  if (!part) return 'default';
  if (mode === 'rotate') return 'grab';
  if (part.kind === 'center') return 'move';
  if (part.kind === 'axis') return part.axis === 'x' ? 'ew-resize' : 'ns-resize';
  return 'default';
}

/** Project screen delta onto local axis (unit screen dir). */
export function projectScreenDelta(
  dx: number,
  dy: number,
  dir: { dx: number; dy: number },
): number {
  return dx * dir.dx + dy * dir.dy;
}
