import {
  add,
  quatNormalize,
  quatRotateVec,
  type Quat,
  type Vec3,
} from './math3d.ts';

export type LinePointHit = {
  entity: number;
  index: number;
  x: number;
  y: number;
};

export function readLine2DPoints(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!Array.isArray(point) || point.length < 2) return [];
    const x = Number(point[0]);
    const y = Number(point[1]);
    return [[
      Number.isFinite(x) ? x : 0,
      Number.isFinite(y) ? y : 0,
    ] as [number, number]];
  });
}

export function linePointWorld(
  point: [number, number],
  position: Vec3,
  scale: Vec3,
  rotation?: Quat | null,
): Vec3 {
  const local: Vec3 = [point[0] * scale[0], point[1] * scale[1], 0];
  return add(
    position,
    rotation ? quatRotateVec(quatNormalize(rotation), local) : local,
  );
}

/** Convert a world-space view-plane drag back into Line2D local point units. */
export function linePointDeltaFromWorld(
  worldDelta: Vec3,
  scale: Vec3,
  rotation?: Quat | null,
): [number, number] {
  let local = worldDelta;
  if (rotation) {
    const q = quatNormalize(rotation);
    local = quatRotateVec([-q[0], -q[1], -q[2], q[3]], worldDelta);
  }
  return [
    Math.abs(scale[0]) > 1e-7 ? local[0] / scale[0] : 0,
    Math.abs(scale[1]) > 1e-7 ? local[1] / scale[1] : 0,
  ];
}

export function moveLine2DPoint(
  points: ReadonlyArray<readonly [number, number]>,
  index: number,
  delta: readonly [number, number],
): Array<[number, number]> {
  return points.map((point, pointIndex) => pointIndex === index
    ? [point[0] + delta[0], point[1] + delta[1]]
    : [point[0], point[1]]);
}

export function hitTestLinePoint(
  handles: readonly LinePointHit[],
  x: number,
  y: number,
  radius = 7,
): LinePointHit | null {
  let best: { handle: LinePointHit; distance: number } | null = null;
  for (const handle of handles) {
    const distance = Math.hypot(x - handle.x, y - handle.y);
    if (distance <= radius && (!best || distance < best.distance)) {
      best = { handle, distance };
    }
  }
  return best?.handle ?? null;
}
