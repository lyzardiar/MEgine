export type SceneSnapSettings = {
  enabled: boolean;
  move: number;
  rotate: number;
  scale: number;
};

export type SnapAccumulator = {
  raw: number;
  applied: number;
};

export const DEFAULT_SCENE_SNAP: SceneSnapSettings = {
  enabled: false,
  move: 10,
  rotate: 15,
  scale: 0.1,
};

export const EMPTY_SNAP_ACCUMULATOR: SnapAccumulator = { raw: 0, applied: 0 };

function positive(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeSceneSnapSettings(value: unknown): SceneSnapSettings {
  const raw = value && typeof value === 'object'
    ? value as Partial<SceneSnapSettings>
    : {};
  return {
    enabled: raw.enabled === true,
    move: positive(raw.move, DEFAULT_SCENE_SNAP.move),
    rotate: positive(raw.rotate, DEFAULT_SCENE_SNAP.rotate),
    scale: positive(raw.scale, DEFAULT_SCENE_SNAP.scale),
  };
}

function clean(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : Number(value.toFixed(10));
}

/**
 * Converts per-pointer-event deltas into a stable accumulated snap result.
 * The returned delta is the difference from the value already applied to the
 * object, so slow drags are not lost when every individual event is smaller
 * than the configured increment.
 */
export function advanceSnap(
  state: SnapAccumulator,
  rawDelta: number,
  step: number,
  enabled: boolean,
): { delta: number; state: SnapAccumulator } {
  const raw = clean(state.raw + (Number.isFinite(rawDelta) ? rawDelta : 0));
  const safeStep = positive(step, 1);
  const target = enabled ? clean(Math.round(raw / safeStep) * safeStep) : raw;
  return {
    delta: clean(target - state.applied),
    state: { raw, applied: target },
  };
}
