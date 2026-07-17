/**
 * Screen-space RectTransform gizmo (Scene view UI).
 * Move / rotate / scale tools + Unity-like size handles on the rect.
 */

import type { GizmoMode } from './editorTool';
import type { GizmoPart } from './transformGizmo';
import type { Rect } from './ui/rectLayout';

export type SizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type RectGizmoHit =
  | { kind: 'axis'; axis: 'x' | 'y'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'center'; x: number; y: number; r: number }
  | { kind: 'ring'; cx: number; cy: number; r: number }
  | { kind: 'body'; corners: Array<{ x: number; y: number }> }
  | { kind: 'size'; handle: SizeHandle; x: number; y: number }
  | { kind: 'anchor'; target: 'min' | 'max' | 'both'; x: number; y: number };

const AXIS_LEN = 56;
const AXIS_GAP = 10;
const SHAFT_W = 3;
const HEAD_LEN = 11;
const HIT_AXIS = 10;
const HIT_CENTER = 9;
const HIT_RING = 12;
const HIT_SIZE = 8;
const SIZE_BOX = 7;
const ROTATE_R = AXIS_LEN * 0.9;

const COL = { x: '#e74c3c', y: '#2ecc71', center: '#f0f0f0', ring: '#88c0ff', size: '#9ad0ff' };
const HOVER = '#ffc107';
const ACTIVE = '#ffe566';

function samePart(a: GizmoPart | null, b: GizmoPart): boolean {
  if (!a || a.kind !== b.kind) return false;
  if (a.kind === 'axis' && b.kind === 'axis') return a.axis === b.axis;
  if (a.kind === 'center' && b.kind === 'center') return true;
  if (a.kind === 'size' && b.kind === 'size') return a.handle === b.handle;
  if (a.kind === 'anchor' && b.kind === 'anchor') return a.target === b.target;
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

function sizeHandleBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
) {
  const s = SIZE_BOX;
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#1a1a1a';
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

/** Local UI axes in screen space (y-down). rotDeg = Z rotation (Unity, degrees CCW). */
export function rectLocalAxes(rotDeg: number): { x: { dx: number; dy: number }; y: { dx: number; dy: number } } {
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: { dx: c, dy: -s },
    y: { dx: -s, dy: -c },
  };
}

/** Handle origin for Unity's Pivot / Center toolbar toggle. */
export function rectToolHandlePivot(
  rect: Rect,
  pivotPoint: { x: number; y: number },
  pivotNorm: [number, number],
  rotDeg: number,
  mode: 'pivot' | 'center',
): { x: number; y: number } {
  if (mode === 'pivot') return { ...pivotPoint };
  const axes = rectLocalAxes(rotDeg);
  const localX = rect.w * (0.5 - pivotNorm[0]);
  const localY = rect.h * (pivotNorm[1] - 0.5);
  return {
    x: pivotPoint.x + localX * axes.x.dx + localY * axes.y.dx,
    y: pivotPoint.y + localX * axes.x.dy + localY * axes.y.dy,
  };
}

/** Rotate a screen point using RectTransform's positive CCW convention. */
export function rotateRectToolPoint(
  point: { x: number; y: number },
  pivot: { x: number; y: number },
  degrees: number,
): { x: number; y: number } {
  const radians = (degrees * Math.PI) / 180;
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  return {
    x: pivot.x + dx * c + dy * s,
    y: pivot.y - dx * s + dy * c,
  };
}

/** Corner / edge positions in screen space for a (possibly rotated) rect. */
function sizeHandlePoints(
  rect: Rect,
  rotDeg: number,
  pivot: [number, number],
): Record<SizeHandle, { x: number; y: number }> {
  const piv = rectPivot(rect, pivot);
  const axes = rectLocalAxes(rotDeg);
  const [px, py] = pivot;
  const { w, h } = rect;
  const at = (u: number, v: number) => ({
    x: piv.x + u * axes.x.dx + v * axes.y.dx,
    y: piv.y + u * axes.x.dy + v * axes.y.dy,
  });
  // axes.x = UI 右；axes.y = 屏幕向上（与 UI Y+ 向下相反）
  // 因此「上」沿 +axes.y，「下」沿 -axes.y
  const l = -w * px;
  const r = w * (1 - px);
  const top = h * py;
  const bot = -h * (1 - py);
  return {
    nw: at(l, top),
    n: at((l + r) * 0.5, top),
    ne: at(r, top),
    e: at(r, (top + bot) * 0.5),
    se: at(r, bot),
    s: at((l + r) * 0.5, bot),
    sw: at(l, bot),
    w: at(l, (top + bot) * 0.5),
  };
}

export function drawRectGizmo(
  ctx: CanvasRenderingContext2D,
  pivot: { x: number; y: number },
  rotDeg: number,
  mode: GizmoMode,
  hover: GizmoPart | null,
  active: GizmoPart | null,
  /** When set, draw Unity-style size handles on the rect. */
  rect?: Rect | null,
  pivotNorm: [number, number] = [0.5, 0.5],
  pivotEditing = false,
  anchors?: { min: { x: number; y: number }; max: { x: number; y: number } },
  handleRotDeg = rotDeg,
): RectGizmoHit[] {
  const hits: RectGizmoHit[] = [];
  const axes = rectLocalAxes(handleRotDeg);
  const ox = pivot.x;
  const oy = pivot.y;

  // The outline stays visible for every tool; resize handles belong to Rect Tool.
  if (rect && rect.w > 2 && rect.h > 2) {
    const pts = sizeHandlePoints(rect, rotDeg, pivotNorm);
    // Outline
    ctx.strokeStyle = 'rgba(100, 180, 255, 0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const order: SizeHandle[] = ['nw', 'ne', 'se', 'sw'];
    ctx.moveTo(pts.nw.x, pts.nw.y);
    for (const h of order.slice(1)) ctx.lineTo(pts[h].x, pts[h].y);
    ctx.closePath();
    ctx.stroke();

    if (mode === 'rect' && !pivotEditing && !anchors) {
      for (const handle of Object.keys(pts) as SizeHandle[]) {
        const p = pts[handle];
        const part: GizmoPart = { kind: 'size', handle };
        const col = colorOf(part, hover, active, COL.size);
        sizeHandleBox(ctx, p.x, p.y, col);
        hits.push({ kind: 'size', handle, x: p.x, y: p.y });
      }

      const part: GizmoPart = { kind: 'center' };
      const col = colorOf(part, hover, active, '#66c7ff');
      ctx.fillStyle = '#181818';
      ctx.beginPath();
      ctx.arc(ox, oy, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.stroke();
      hits.push({ kind: 'center', x: ox, y: oy, r: 7 });
      hits.push({
        kind: 'body',
        corners: [pts.nw, pts.ne, pts.se, pts.sw],
      });
    }
  }

  if (anchors) {
    const same = Math.hypot(anchors.max.x - anchors.min.x, anchors.max.y - anchors.min.y) < 4;
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = 'rgba(245, 197, 66, 0.72)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      Math.min(anchors.min.x, anchors.max.x),
      Math.min(anchors.min.y, anchors.max.y),
      Math.abs(anchors.max.x - anchors.min.x),
      Math.abs(anchors.max.y - anchors.min.y),
    );
    ctx.beginPath();
    ctx.moveTo(anchors.min.x, anchors.min.y);
    ctx.lineTo(ox, oy);
    if (!same) {
      ctx.moveTo(anchors.max.x, anchors.max.y);
      ctx.lineTo(ox, oy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const drawAnchor = (point: { x: number; y: number }, target: 'min' | 'max' | 'both') => {
      const part: GizmoPart = { kind: 'anchor', target };
      const color = colorOf(part, hover, active, '#f5c542');
      ctx.fillStyle = color;
      ctx.strokeStyle = '#171717';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(point.x, point.y - 7);
      ctx.lineTo(point.x + 7, point.y);
      ctx.lineTo(point.x, point.y + 7);
      ctx.lineTo(point.x - 7, point.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      hits.push({ kind: 'anchor', target, x: point.x, y: point.y });
    };
    if (same) drawAnchor(anchors.min, 'both');
    else {
      drawAnchor(anchors.min, 'min');
      drawAnchor(anchors.max, 'max');
    }
    ctx.restore();
    return hits;
  }

  if (pivotEditing) {
    const part: GizmoPart = { kind: 'center' };
    const col = colorOf(part, hover, active, '#66c7ff');
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(ox, oy, 7, 0, Math.PI * 2);
    ctx.moveTo(ox - 12, oy);
    ctx.lineTo(ox + 12, oy);
    ctx.moveTo(ox, oy - 12);
    ctx.lineTo(ox, oy + 12);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(ox, oy, 2.5, 0, Math.PI * 2);
    ctx.fill();
    hits.push({ kind: 'center', x: ox, y: oy, r: 12 });
    return hits;
  }

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
  for (const h of hits) {
    if (h.kind === 'anchor' && Math.hypot(x - h.x, y - h.y) <= 11) {
      return { kind: 'anchor', target: h.target };
    }
  }
  // Size handles first (precise)
  for (const h of hits) {
    if (h.kind === 'size') {
      if (Math.hypot(x - h.x, y - h.y) <= HIT_SIZE) return { kind: 'size', handle: h.handle };
    }
  }
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
      if (d <= HIT_RING) return { kind: 'center' };
    }
  }
  for (const h of hits) {
    if (h.kind === 'body' && pointInQuad(x, y, h.corners)) return { kind: 'center' };
  }
  return null;
}

function pointInQuad(
  x: number,
  y: number,
  corners: Array<{ x: number; y: number }>,
): boolean {
  let inside = false;
  for (let index = 0, previous = corners.length - 1; index < corners.length; previous = index++) {
    const a = corners[index];
    const b = corners[previous];
    const crosses = (a.y > y) !== (b.y > y)
      && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
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
  if (part.kind === 'size') {
    const h = part.handle;
    if (h === 'e' || h === 'w') return 'ew-resize';
    if (h === 'n' || h === 's') return 'ns-resize';
    if (h === 'ne' || h === 'sw') return 'nesw-resize';
    return 'nwse-resize';
  }
  if (part.kind === 'anchor') return 'move';
  if (mode === 'rotate') return 'grab';
  if (part.kind === 'center') return 'move';
  if (part.kind === 'axis') return part.axis === 'x' ? 'ew-resize' : 'ns-resize';
  return 'default';
}

export function projectScreenDelta(
  dx: number,
  dy: number,
  dir: { dx: number; dy: number },
): number {
  return dx * dir.dx + dy * dir.dy;
}
