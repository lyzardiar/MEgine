export type TrailVec3 = [number, number, number];
export type TrailColor = [number, number, number, number];

export interface TrailPoint2D {
  position: TrailVec3;
  age: number;
}

export interface TrailState2D {
  points: TrailPoint2D[];
  head: TrailVec3 | null;
}

export interface TrailSegment2D {
  start: TrailVec3;
  end: TrailVec3;
  width: number;
  color: TrailColor;
}

const MAX_TRAIL_POINTS = 2_048;

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function color(value: unknown, fallback: TrailColor): TrailColor {
  if (!Array.isArray(value)) return fallback;
  return [0, 1, 2, 3].map((index) => finite(value[index], fallback[index])) as TrailColor;
}

function distance(left: TrailVec3, right: TrailVec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function mix(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function createTrailState2D(): TrailState2D {
  return { points: [], head: null };
}

export function stepTrail2D(
  state: TrailState2D,
  component: Record<string, unknown>,
  deltaSeconds: number,
  position: TrailVec3,
): void {
  if (component.enabled === false) {
    state.points.length = 0;
    state.head = null;
    return;
  }
  const delta = Math.min(0.25, Math.max(0, finite(deltaSeconds, 0)));
  const lifetime = Math.max(0.01, finite(component.time, 0.6));
  for (const point of state.points) point.age += delta;
  state.points = state.points.filter((point) => point.age < lifetime);
  if (component.emitting === false) {
    state.head = null;
    return;
  }
  const current: TrailVec3 = [
    finite(position[0], 0),
    finite(position[1], 0),
    finite(position[2], 0),
  ];
  state.head = current;
  const minimum = Math.max(0.0001, finite(component.min_vertex_distance, 0.08));
  const last = state.points.at(-1);
  if (!last || distance(last.position, current) >= minimum) {
    state.points.push({ position: current, age: 0 });
  }
  const maxPoints = Math.min(
    MAX_TRAIL_POINTS,
    Math.max(2, finite(component.max_points, 128) | 0),
  );
  if (state.points.length > maxPoints) {
    state.points.splice(0, state.points.length - maxPoints);
  }
}

export function collectTrailSegments2D(
  state: TrailState2D,
  component: Record<string, unknown>,
): TrailSegment2D[] {
  if (component.enabled === false) return [];
  const path = state.points.map((point) => ({ ...point, position: [...point.position] as TrailVec3 }));
  const last = path.at(-1);
  if (state.head && (!last || distance(last.position, state.head) > 0.000001)) {
    path.push({ position: [...state.head], age: 0 });
  }
  const lifetime = Math.max(0.01, finite(component.time, 0.6));
  const widthStart = Math.max(0, finite(component.width_start, 0.2));
  const widthEnd = Math.max(0, finite(component.width_end, 0));
  const colorStart = color(component.color_start, [1, 0.8, 0.25, 1]);
  const colorEnd = color(component.color_end, [1, 0.15, 0.02, 0]);
  return path.slice(1).flatMap((point, index) => {
    const previous = path[index];
    if (distance(previous.position, point.position) <= 0.000001) return [];
    const progress = Math.min(1, Math.max(0, (previous.age + point.age) * 0.5 / lifetime));
    return [{
      start: previous.position,
      end: point.position,
      width: mix(widthStart, widthEnd, progress),
      color: colorStart.map((channel, channelIndex) => (
        mix(channel, colorEnd[channelIndex], progress)
      )) as TrailColor,
    }];
  });
}
