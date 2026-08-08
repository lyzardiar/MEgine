/** Screen-stable Scene transform gizmo with one geometry model for draw and hit testing. */

import type { Camera, Quat, Vec3 } from './math3d';
import {
  add,
  cross,
  dot,
  lookBasis,
  norm,
  project,
  scale,
  screenPointRay,
  sub,
} from './math3d.ts';
import { transformBasis } from './editorGizmos.ts';
import type { GizmoMode } from './editorTool.ts';

export type GizmoAxis = 'x' | 'y' | 'z';
export type GizmoPlane = 'xy' | 'xz' | 'yz';

export type GizmoPart =
  | { kind: 'axis'; axis: GizmoAxis }
  | { kind: 'plane'; plane: GizmoPlane }
  | { kind: 'center' }
  | { kind: 'size'; handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' }
  | { kind: 'anchor'; target: 'min' | 'max' | 'both' };

type Point = { x: number; y: number };
type Vp = { x: number; y: number; w: number; h: number };

export type GizmoHit =
  | { kind: 'axis'; axis: GizmoAxis; shape: 'segment'; start: Point; end: Point }
  | {
      kind: 'axis';
      axis: GizmoAxis;
      shape: 'ellipse';
      center: Point;
      radius: number;
      u: Point;
      v: Point;
    }
  | { kind: 'plane'; plane: GizmoPlane; corners: [Point, Point, Point, Point] }
  | { kind: 'center'; shape: 'circle' | 'annulus'; center: Point; radius: number; band: number };

const AXES: GizmoAxis[] = ['x', 'y', 'z'];
const AXIS_COLORS: Record<GizmoAxis, string> = {
  x: '#e95b5b',
  y: '#8bc85b',
  z: '#5b8ee8',
};
const PLANE_COLORS: Record<GizmoPlane, string> = {
  xy: AXIS_COLORS.z,
  xz: AXIS_COLORS.y,
  yz: AXIS_COLORS.x,
};
const HOVER = '#f5ce4b';
const ACTIVE = '#fff0a6';
const AXIS_LENGTH = 86;
const AXIS_GAP = 7;
const ARROW_LENGTH = 14;
const ARROW_WIDTH = 11;
const PLANE_OFFSET = 18;
const PLANE_SIZE = 14;
const ROTATE_RADIUS = 68;
const HIT_AXIS = 10;
const HIT_RING = 9;

function samePart(left: GizmoPart | null, right: GizmoPart): boolean {
  if (!left || left.kind !== right.kind) return false;
  if (left.kind === 'axis' && right.kind === 'axis') return left.axis === right.axis;
  if (left.kind === 'plane' && right.kind === 'plane') return left.plane === right.plane;
  if (left.kind === 'size' && right.kind === 'size') return left.handle === right.handle;
  if (left.kind === 'anchor' && right.kind === 'anchor') return left.target === right.target;
  return left.kind === 'center';
}

function partColor(part: GizmoPart, hover: GizmoPart | null, active: GizmoPart | null): string {
  if (samePart(active, part)) return ACTIVE;
  if (samePart(hover, part)) return HOVER;
  if (part.kind === 'axis') return AXIS_COLORS[part.axis];
  if (part.kind === 'plane') return PLANE_COLORS[part.plane];
  return '#f3f3f3';
}

function partOpacity(part: GizmoPart, hover: GizmoPart | null, active: GizmoPart | null): number {
  if (samePart(active, part) || samePart(hover, part)) return 1;
  if (active) return 0.24;
  if (hover) return 0.58;
  return 1;
}

function projectedAxis(origin: Vec3, direction: Vec3, camera: Camera, viewport: Vp, center: Point) {
  // Only the direction comes from world space; the visible handle remains screen-sized.
  // Scale the direction sample with distance so distant objects do not lose whole axes.
  const cameraDistance = Math.hypot(...sub(origin, camera.eye));
  const projected = project(
    add(origin, scale(direction, Math.max(1, cameraDistance * 0.04))),
    camera,
    viewport,
  );
  if (!projected) return null;
  const dx = projected.x - center.x;
  const dy = projected.y - center.y;
  const length = Math.hypot(dx, dy);
  if (length < 3) return null;
  const unit = { x: dx / length, y: dy / length };
  return {
    unit,
    screen: { x: dx, y: dy },
    tip: { x: center.x + unit.x * AXIS_LENGTH, y: center.y + unit.y * AXIS_LENGTH },
    angle: Math.atan2(unit.y, unit.x),
    depth: projected.depth,
  };
}

function outlinedLine(
  context: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  color: string,
  width: number,
) {
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.strokeStyle = 'rgba(12,12,12,0.72)';
  context.lineWidth = width + 2;
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function arrowHead(context: CanvasRenderingContext2D, tip: Point, angle: number, color: string) {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  const normal = { x: -direction.y, y: direction.x };
  const base = {
    x: tip.x - direction.x * ARROW_LENGTH,
    y: tip.y - direction.y * ARROW_LENGTH,
  };
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.lineTo(base.x + normal.x * ARROW_WIDTH * 0.5, base.y + normal.y * ARROW_WIDTH * 0.5);
  context.lineTo(base.x - normal.x * ARROW_WIDTH * 0.5, base.y - normal.y * ARROW_WIDTH * 0.5);
  context.closePath();
  context.lineWidth = 1.5;
  context.strokeStyle = 'rgba(12,12,12,0.78)';
  context.stroke();
  context.fillStyle = color;
  context.fill();

  context.beginPath();
  context.moveTo(tip.x - direction.x * 2, tip.y - direction.y * 2);
  context.lineTo(
    base.x + normal.x * ARROW_WIDTH * 0.34,
    base.y + normal.y * ARROW_WIDTH * 0.34,
  );
  context.strokeStyle = 'rgba(255,255,255,0.34)';
  context.lineWidth = 0.8;
  context.stroke();
}

function planeCorners(center: Point, axisA: Point, axisB: Point): [Point, Point, Point, Point] {
  const origin = {
    x: center.x + (axisA.x + axisB.x) * PLANE_OFFSET,
    y: center.y + (axisA.y + axisB.y) * PLANE_OFFSET,
  };
  return [
    origin,
    { x: origin.x + axisA.x * PLANE_SIZE, y: origin.y + axisA.y * PLANE_SIZE },
    {
      x: origin.x + (axisA.x + axisB.x) * PLANE_SIZE,
      y: origin.y + (axisA.y + axisB.y) * PLANE_SIZE,
    },
    { x: origin.x + axisB.x * PLANE_SIZE, y: origin.y + axisB.y * PLANE_SIZE },
  ];
}

function drawPlane(
  context: CanvasRenderingContext2D,
  corners: [Point, Point, Point, Point],
  color: string,
  hot: boolean,
) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16));
  context.beginPath();
  context.moveTo(corners[0].x, corners[0].y);
  for (const corner of corners.slice(1)) context.lineTo(corner.x, corner.y);
  context.closePath();
  context.fillStyle = `rgba(${channels.join(',')},${hot ? 0.5 : 0.18})`;
  context.fill();
  context.strokeStyle = 'rgba(12,12,12,0.55)';
  context.lineWidth = hot ? 3 : 2.5;
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = hot ? 2 : 1;
  context.stroke();
}

function polygonContains(point: Point, corners: [Point, Point, Point, Point]): boolean {
  let sign = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const left = corners[index];
    const right = corners[(index + 1) % corners.length];
    const crossValue = (right.x - left.x) * (point.y - left.y)
      - (right.y - left.y) * (point.x - left.x);
    if (Math.abs(crossValue) < 1e-6) continue;
    const nextSign = Math.sign(crossValue);
    if (sign !== 0 && nextSign !== sign) return false;
    sign = nextSign;
  }
  return true;
}

function strokeEllipse(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  u: Point,
  v: Point,
  include: (angle: number) => boolean,
) {
  context.beginPath();
  let drawing = false;
  for (let index = 0; index <= 96; index += 1) {
    const angle = index / 96 * Math.PI * 2;
    const point = {
      x: center.x + (Math.cos(angle) * u.x + Math.sin(angle) * v.x) * radius,
      y: center.y + (Math.cos(angle) * u.y + Math.sin(angle) * v.y) * radius,
    };
    if (!include(angle)) {
      drawing = false;
    } else if (!drawing) {
      context.moveTo(point.x, point.y);
      drawing = true;
    } else {
      context.lineTo(point.x, point.y);
    }
  }
  context.stroke();
}

function drawRotationRing(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  u: Point,
  v: Point,
  worldU: Vec3,
  worldV: Vec3,
  viewToCamera: Vec3,
  color: string,
  hot: boolean,
) {
  const front = (angle: number) => dot(
    add(scale(worldU, Math.cos(angle)), scale(worldV, Math.sin(angle))),
    viewToCamera,
  ) >= 0;
  context.save();
  context.setLineDash([3, 4]);
  context.globalAlpha = hot ? 0.34 : 0.14;
  context.strokeStyle = color;
  context.lineWidth = hot ? 2.25 : 1.25;
  strokeEllipse(context, center, radius, u, v, () => true);

  context.setLineDash([]);
  context.globalAlpha = hot ? 0.7 : 0.44;
  context.strokeStyle = 'rgba(12,12,12,0.76)';
  context.lineWidth = hot ? 5 : 4;
  strokeEllipse(context, center, radius, u, v, front);

  context.globalAlpha = 1;
  context.strokeStyle = color;
  context.lineWidth = hot ? 3 : 2;
  strokeEllipse(context, center, radius, u, v, front);
  context.restore();
}

function drawViewRotationRing(
  context: CanvasRenderingContext2D,
  center: Point,
  radius: number,
  color: string,
  hot: boolean,
) {
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(12,12,12,0.68)';
  context.lineWidth = hot ? 4.5 : 3.5;
  context.stroke();
  context.strokeStyle = color;
  context.lineWidth = hot ? 2.5 : 1.25;
  context.stroke();
}

function drawScaleCap(
  context: CanvasRenderingContext2D,
  tip: Point,
  color: string,
  hot: boolean,
) {
  const half = hot ? 7 : 6;
  context.fillStyle = 'rgba(12,12,12,0.78)';
  context.fillRect(tip.x - half - 1.5, tip.y - half - 1.5, half * 2 + 3, half * 2 + 3);
  context.fillStyle = color;
  context.fillRect(tip.x - half, tip.y - half, half * 2, half * 2);
  context.strokeStyle = 'rgba(255,255,255,0.3)';
  context.lineWidth = 1;
  context.strokeRect(tip.x - half + 0.5, tip.y - half + 0.5, half * 2 - 1, half * 2 - 1);
}

function drawScaleCenterHandle(
  context: CanvasRenderingContext2D,
  center: Point,
  color: string,
  hot: boolean,
) {
  const half = hot ? 7 : 6;
  context.beginPath();
  context.rect(center.x - half - 1, center.y - half - 1, half * 2 + 2, half * 2 + 2);
  context.fillStyle = 'rgba(12,12,12,0.9)';
  context.fill();
  context.beginPath();
  context.rect(center.x - half, center.y - half, half * 2, half * 2);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.28)';
  context.lineWidth = 1;
  context.stroke();
}

function drawMoveCenterHandle(
  context: CanvasRenderingContext2D,
  center: Point,
  color: string,
  hot: boolean,
) {
  const radius = hot ? 7 : 5.5;
  context.beginPath();
  context.arc(center.x, center.y, radius + 2, 0, Math.PI * 2);
  context.fillStyle = 'rgba(12,12,12,0.78)';
  context.fill();
  context.beginPath();
  context.arc(center.x, center.y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.strokeStyle = 'rgba(255,255,255,0.42)';
  context.lineWidth = 1;
  context.stroke();
}

function drawRotationHub(context: CanvasRenderingContext2D, center: Point) {
  context.beginPath();
  context.arc(center.x, center.y, 3.5, 0, Math.PI * 2);
  context.fillStyle = 'rgba(22,22,24,0.86)';
  context.fill();
  context.strokeStyle = 'rgba(235,235,235,0.72)';
  context.lineWidth = 1;
  context.stroke();
}

export function drawTransformGizmo(
  context: CanvasRenderingContext2D,
  camera: Camera,
  viewport: Vp,
  worldOrigin: Vec3,
  rotation: Quat | null | undefined,
  mode: GizmoMode,
  hover: GizmoPart | null,
  active: GizmoPart | null,
): GizmoHit[] {
  const projectedOrigin = project(worldOrigin, camera, viewport);
  if (!projectedOrigin) return [];
  context.save();
  const center = { x: projectedOrigin.x, y: projectedOrigin.y };
  const basis = transformBasis(rotation);
  const directions: Record<GizmoAxis, Vec3> = { x: basis.right, y: basis.up, z: basis.forward };
  const projected = Object.fromEntries(
    AXES.map((axis) => [axis, projectedAxis(worldOrigin, directions[axis], camera, viewport, center)]),
  ) as Record<GizmoAxis, ReturnType<typeof projectedAxis>>;
  const drawAxes = [...AXES].sort(
    (left, right) => (projected[right]?.depth ?? 0) - (projected[left]?.depth ?? 0),
  );
  const hits: GizmoHit[] = [];

  if (mode === 'translate') {
    const planes: Array<[GizmoPlane, GizmoAxis, GizmoAxis]> = [
      ['xy', 'x', 'y'], ['xz', 'x', 'z'], ['yz', 'y', 'z'],
    ];
    for (const [plane, axisA, axisB] of planes) {
      const a = projected[axisA];
      const b = projected[axisB];
      if (!a || !b || Math.abs(a.unit.x * b.unit.y - b.unit.x * a.unit.y) < 0.12) continue;
      const part: GizmoPart = { kind: 'plane', plane };
      const corners = planeCorners(center, a.unit, b.unit);
      context.save();
      context.globalAlpha = partOpacity(part, hover, active);
      drawPlane(context, corners, partColor(part, hover, active), samePart(hover, part) || samePart(active, part));
      context.restore();
      hits.push({ kind: 'plane', plane, corners });
    }
  }

  if (mode === 'rotate') {
    const viewToCamera = norm(sub(camera.eye, worldOrigin));
    for (const axis of drawAxes) {
      const otherAxes = AXES.filter((candidate) => candidate !== axis);
      const firstHandle = projected[otherAxes[0]];
      const secondHandle = projected[otherAxes[1]];
      if (!firstHandle || !secondHandle
        || Math.abs(firstHandle.unit.x * secondHandle.unit.y
          - secondHandle.unit.x * firstHandle.unit.y) < 0.08) continue;
      const scaleToRadius = 1 / Math.max(
        Math.hypot(firstHandle.screen.x, firstHandle.screen.y),
        Math.hypot(secondHandle.screen.x, secondHandle.screen.y),
      );
      const first = {
        x: firstHandle.screen.x * scaleToRadius,
        y: firstHandle.screen.y * scaleToRadius,
      };
      const second = {
        x: secondHandle.screen.x * scaleToRadius,
        y: secondHandle.screen.y * scaleToRadius,
      };
      const part: GizmoPart = { kind: 'axis', axis };
      const color = partColor(part, hover, active);
      context.save();
      context.globalAlpha = partOpacity(part, hover, active);
      drawRotationRing(
        context,
        center,
        ROTATE_RADIUS,
        first,
        second,
        directions[otherAxes[0]],
        directions[otherAxes[1]],
        viewToCamera,
        color,
        samePart(hover, part) || samePart(active, part),
      );
      context.restore();
      hits.push({ kind: 'axis', axis, shape: 'ellipse', center, radius: ROTATE_RADIUS, u: first, v: second });
    }
    const radius = ROTATE_RADIUS + 12;
    const part: GizmoPart = { kind: 'center' };
    context.save();
    context.globalAlpha = partOpacity(part, hover, active);
    drawViewRotationRing(
      context,
      center,
      radius,
      partColor(part, hover, active),
      samePart(hover, part) || samePart(active, part),
    );
    context.restore();
    drawRotationHub(context, center);
    hits.push({ kind: 'center', shape: 'annulus', center, radius, band: HIT_RING });
  } else {
    for (const axis of drawAxes) {
      const handle = projected[axis];
      if (!handle) continue;
      const part: GizmoPart = { kind: 'axis', axis };
      const color = partColor(part, hover, active);
      const hot = samePart(hover, part) || samePart(active, part);
      const start = {
        x: center.x + handle.unit.x * AXIS_GAP,
        y: center.y + handle.unit.y * AXIS_GAP,
      };
      const end = mode === 'translate'
        ? {
            x: handle.tip.x - handle.unit.x * (ARROW_LENGTH - 2),
            y: handle.tip.y - handle.unit.y * (ARROW_LENGTH - 2),
          }
        : handle.tip;
      context.save();
      context.globalAlpha = partOpacity(part, hover, active);
      outlinedLine(context, start, end, color, hot ? 4 : 2.5);
      if (mode === 'translate') arrowHead(context, handle.tip, handle.angle, color);
      else drawScaleCap(context, handle.tip, color, hot);
      context.restore();
      hits.push({ kind: 'axis', axis, shape: 'segment', start, end: handle.tip });
    }

    const part: GizmoPart = { kind: 'center' };
    const hot = samePart(hover, part) || samePart(active, part);
    context.save();
    context.globalAlpha = partOpacity(part, hover, active);
    if (mode === 'translate') {
      drawMoveCenterHandle(context, center, partColor(part, hover, active), hot);
    } else {
      drawScaleCenterHandle(context, center, partColor(part, hover, active), hot);
    }
    context.restore();
    hits.push({ kind: 'center', shape: 'circle', center, radius: hot ? 11 : 10, band: 0 });
  }

  context.restore();
  return hits;
}

function segmentDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-6) return Number.POSITIVE_INFINITY;
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * amount), point.y - (start.y + dy * amount));
}

function ellipseDistance(point: Point, hit: Extract<GizmoHit, { shape: 'ellipse' }>): number {
  const dx = point.x - hit.center.x;
  const dy = point.y - hit.center.y;
  const ax = hit.u.x * hit.radius;
  const ay = hit.u.y * hit.radius;
  const bx = hit.v.x * hit.radius;
  const by = hit.v.y * hit.radius;
  const determinant = ax * by - bx * ay;
  if (Math.abs(determinant) < 1e-6) return Number.POSITIVE_INFINITY;
  const u = (dx * by - bx * dy) / determinant;
  const v = (ax * dy - dx * ay) / determinant;
  return Math.abs(Math.hypot(u, v) - 1) * hit.radius;
}

export function hitTestTransformGizmo(hits: GizmoHit[], x: number, y: number): GizmoPart | null {
  const point = { x, y };
  let bestRing: { part: GizmoPart; distance: number } | null = null;
  for (const hit of hits) {
    if (hit.kind !== 'axis' || hit.shape !== 'ellipse') continue;
    const distance = ellipseDistance(point, hit);
    if (distance <= HIT_RING && (!bestRing || distance < bestRing.distance)) {
      bestRing = { part: { kind: 'axis', axis: hit.axis }, distance };
    }
  }
  if (bestRing) return bestRing.part;

  for (const hit of hits) {
    if (hit.kind !== 'center') continue;
    const distance = Math.hypot(x - hit.center.x, y - hit.center.y);
    if (hit.shape === 'annulus' ? Math.abs(distance - hit.radius) <= hit.band : distance <= hit.radius) {
      return { kind: 'center' };
    }
  }
  for (const hit of hits) {
    if (hit.kind === 'axis' && hit.shape === 'segment'
      && segmentDistance(point, hit.start, hit.end) <= HIT_AXIS) {
      return { kind: 'axis', axis: hit.axis };
    }
  }
  for (const hit of hits) {
    if (hit.kind === 'plane' && polygonContains(point, hit.corners)) {
      return { kind: 'plane', plane: hit.plane };
    }
  }
  return null;
}

function projectedBasis(
  origin: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  camera: Camera,
  viewport: Vp,
): { a: Point; b: Point } | null {
  const center = project(origin, camera, viewport);
  const projectedA = project(add(origin, axisA), camera, viewport);
  const projectedB = project(add(origin, axisB), camera, viewport);
  if (!center || !projectedA || !projectedB) return null;
  return {
    a: { x: projectedA.x - center.x, y: projectedA.y - center.y },
    b: { x: projectedB.x - center.x, y: projectedB.y - center.y },
  };
}

export function worldDeltaAlongAxis(
  origin: Vec3,
  axis: Vec3,
  screenDelta: { dx: number; dy: number },
  camera: Camera,
  viewport: Vp,
): Vec3 {
  const basis = projectedBasis(origin, axis, [0, 0, 0], camera, viewport);
  if (!basis) return [0, 0, 0];
  const denominator = basis.a.x ** 2 + basis.a.y ** 2;
  if (denominator < 1e-4) return [0, 0, 0];
  const amount = (screenDelta.dx * basis.a.x + screenDelta.dy * basis.a.y) / denominator;
  return scale(axis, amount);
}

/** Solve both projected plane axes together; independent projection double-counts oblique drags. */
export function worldDeltaOnPlane(
  origin: Vec3,
  axisA: Vec3,
  axisB: Vec3,
  screenDelta: { dx: number; dy: number },
  camera: Camera,
  viewport: Vp,
): Vec3 {
  const center = project(origin, camera, viewport);
  const normal = norm(cross(axisA, axisB));
  if (center && Math.hypot(...normal) > 1e-6) {
    const startRay = screenRay(center.x, center.y, camera, viewport);
    const endRay = screenRay(
      center.x + screenDelta.dx,
      center.y + screenDelta.dy,
      camera,
      viewport,
    );
    const start = intersectRayPlane(startRay.origin, startRay.dir, origin, normal);
    const end = intersectRayPlane(endRay.origin, endRay.dir, origin, normal);
    if (start && end) {
      const delta = sub(end, start);
      return add(scale(axisA, dot(delta, axisA)), scale(axisB, dot(delta, axisB)));
    }
  }
  const basis = projectedBasis(origin, axisA, axisB, camera, viewport);
  if (!basis) return [0, 0, 0];
  const determinant = basis.a.x * basis.b.y - basis.b.x * basis.a.y;
  if (Math.abs(determinant) < 1e-4) {
    const lengthA = basis.a.x ** 2 + basis.a.y ** 2;
    const lengthB = basis.b.x ** 2 + basis.b.y ** 2;
    return lengthA >= lengthB
      ? worldDeltaAlongAxis(origin, axisA, screenDelta, camera, viewport)
      : worldDeltaAlongAxis(origin, axisB, screenDelta, camera, viewport);
  }
  const amountA = (screenDelta.dx * basis.b.y - basis.b.x * screenDelta.dy) / determinant;
  const amountB = (basis.a.x * screenDelta.dy - screenDelta.dx * basis.a.y) / determinant;
  return add(scale(axisA, amountA), scale(axisB, amountB));
}

export function worldDeltaViewPlane(
  origin: Vec3,
  screenDelta: { dx: number; dy: number },
  camera: Camera,
  viewport: Vp,
): Vec3 {
  const { right, up } = lookBasis(camera.eye, camera.target);
  return worldDeltaOnPlane(origin, right, up, screenDelta, camera, viewport);
}

export function gizmoPartEquals(left: GizmoPart | null, right: GizmoPart | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return samePart(left, right);
}

export function cursorForGizmoPart(part: GizmoPart | null): string {
  if (!part) return 'default';
  if (part.kind === 'center' || part.kind === 'plane' || part.kind === 'anchor') return 'move';
  return 'grab';
}

export function worldAxisVec(axis: GizmoAxis): Vec3 {
  return axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1];
}

function planeBasis(axis: Vec3): { u: Vec3; v: Vec3 } {
  const normalized = norm(axis);
  const reference: Vec3 = Math.abs(normalized[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(normalized, reference));
  return { u, v: norm(cross(normalized, u)) };
}

export function screenRay(screenX: number, screenY: number, camera: Camera, viewport: Vp) {
  return screenPointRay(screenX, screenY, camera, viewport);
}

function intersectRayPlane(
  rayOrigin: Vec3,
  rayDirection: Vec3,
  planeOrigin: Vec3,
  planeNormal: Vec3,
): Vec3 | null {
  const normal = norm(planeNormal);
  const denominator = dot(rayDirection, normal);
  if (Math.abs(denominator) < 1e-5) return null;
  const distance = dot(sub(planeOrigin, rayOrigin), normal) / denominator;
  if (distance < 0.02) return null;
  return add(rayOrigin, scale(rayDirection, distance));
}

export function angleAroundWorldAxis(
  origin: Vec3,
  axis: Vec3,
  screenX: number,
  screenY: number,
  camera: Camera,
  viewport: Vp,
): number | null {
  const ray = screenRay(screenX, screenY, camera, viewport);
  const hit = intersectRayPlane(ray.origin, ray.dir, origin, axis);
  if (!hit) return null;
  const basis = planeBasis(axis);
  const relative = sub(hit, origin);
  const x = dot(relative, basis.u);
  const y = dot(relative, basis.v);
  return Math.hypot(x, y) < 1e-8 ? null : Math.atan2(y, x);
}
