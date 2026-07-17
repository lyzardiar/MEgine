export type AnimationWrapMode = 'once' | 'loop' | 'ping_pong';
export type AnimationInterpolation = 'step' | 'linear' | 'smooth';
export type AnimationValue = boolean | number | number[] | string;

export type AnimationKeyframe = {
  time: number;
  value: AnimationValue;
};

export type AnimationTrack = {
  target: string;
  component: string;
  property: string;
  interpolation: AnimationInterpolation;
  keyframes: AnimationKeyframe[];
};

export type AnimationClip = {
  version: number;
  name: string;
  duration: number;
  frame_rate: number;
  wrap_mode: AnimationWrapMode;
  tracks: AnimationTrack[];
};

export type AnimationSample = Pick<AnimationTrack, 'target' | 'component' | 'property'> & {
  value: AnimationValue;
};

const DEFAULT_FRAME_RATE = 60;

export function createAnimationClip(name = 'New Animation'): AnimationClip {
  return {
    version: 1,
    name,
    duration: 1,
    frame_rate: DEFAULT_FRAME_RATE,
    wrap_mode: 'loop',
    tracks: [],
  };
}

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function animationValue(value: unknown): AnimationValue | null {
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value) && value.length > 0) {
    const numbers = value.map(Number);
    return numbers.every(Number.isFinite) ? numbers : null;
  }
  return null;
}

function interpolation(value: unknown): AnimationInterpolation {
  return value === 'step' || value === 'smooth' ? value : 'linear';
}

function wrapMode(value: unknown): AnimationWrapMode {
  return value === 'once' || value === 'ping_pong' ? value : 'loop';
}

export function normalizeAnimationClip(value: unknown): AnimationClip {
  const source = record(value);
  const tracks: AnimationTrack[] = [];
  let maxTime = 0;
  for (const rawTrack of Array.isArray(source.tracks) ? source.tracks : []) {
    const track = record(rawTrack);
    const component = String(track.component ?? '').trim();
    const property = String(track.property ?? '').trim();
    if (!component || !property) continue;
    const byTime = new Map<number, AnimationKeyframe>();
    for (const rawKey of Array.isArray(track.keyframes) ? track.keyframes : []) {
      const key = record(rawKey);
      const time = Number(key.time);
      const parsedValue = animationValue(key.value);
      if (!Number.isFinite(time) || parsedValue == null) continue;
      const safeTime = Math.max(0, time);
      byTime.set(safeTime, { time: safeTime, value: parsedValue });
      maxTime = Math.max(maxTime, safeTime);
    }
    tracks.push({
      target: String(track.target ?? '').trim() || '.',
      component,
      property,
      interpolation: interpolation(track.interpolation),
      keyframes: [...byTime.values()].sort((left, right) => left.time - right.time),
    });
  }
  const authoredDuration = Number(source.duration);
  const authoredFrameRate = Number(source.frame_rate ?? source.frameRate);
  const authoredVersion = Math.trunc(Number(source.version));
  return {
    version: Number.isFinite(authoredVersion) && authoredVersion > 0 ? authoredVersion : 1,
    name: String(source.name ?? ''),
    duration: Math.max(
      Number.isFinite(authoredDuration) ? Math.max(0, authoredDuration) : 0,
      maxTime,
    ),
    frame_rate: Number.isFinite(authoredFrameRate) && authoredFrameRate > 0
      ? authoredFrameRate
      : DEFAULT_FRAME_RATE,
    wrap_mode: wrapMode(source.wrap_mode ?? source.wrapMode),
    tracks,
  };
}

export function parseAnimationClip(text: string): AnimationClip {
  return normalizeAnimationClip(JSON.parse(text));
}

export function serializeAnimationClip(clip: AnimationClip): string {
  return `${JSON.stringify(normalizeAnimationClip(clip), null, 2)}\n`;
}

export function wrappedAnimationTime(
  time: number,
  duration: number,
  mode: AnimationWrapMode,
): number {
  if (!Number.isFinite(time) || !Number.isFinite(duration) || duration <= 0) return 0;
  if (mode === 'once') return Math.max(0, Math.min(duration, time));
  if (mode === 'loop') return ((time % duration) + duration) % duration;
  const period = duration * 2;
  const wrapped = ((time % period) + period) % period;
  return wrapped <= duration ? wrapped : period - wrapped;
}

function interpolateValue(
  left: AnimationValue,
  right: AnimationValue,
  amount: number,
): AnimationValue {
  if (amount >= 1) return structuredClone(right);
  if (typeof left === 'number' && typeof right === 'number') {
    return left + (right - left) * amount;
  }
  if (
    Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
  ) {
    return left.map((value, index) => value + (right[index] - value) * amount);
  }
  return structuredClone(left);
}

export function sampleAnimationTrack(
  track: AnimationTrack,
  time: number,
): AnimationValue | null {
  const first = track.keyframes[0];
  if (!first) return null;
  if (time <= first.time) return structuredClone(first.value);
  for (let index = 1; index < track.keyframes.length; index++) {
    const left = track.keyframes[index - 1];
    const right = track.keyframes[index];
    if (time > right.time) continue;
    const span = right.time - left.time;
    let amount = span > Number.EPSILON
      ? Math.max(0, Math.min(1, (time - left.time) / span))
      : 1;
    if (amount >= 1) return structuredClone(right.value);
    if (track.interpolation === 'step') amount = 0;
    else if (track.interpolation === 'smooth') amount = amount * amount * (3 - 2 * amount);
    return interpolateValue(left.value, right.value, amount);
  }
  return structuredClone(track.keyframes[track.keyframes.length - 1].value);
}

export function sampleAnimationClip(clip: AnimationClip, time: number): AnimationSample[] {
  const sampleTime = wrappedAnimationTime(time, clip.duration, clip.wrap_mode);
  return clip.tracks.flatMap((track) => {
    const value = sampleAnimationTrack(track, sampleTime);
    return value == null ? [] : [{
      target: track.target,
      component: track.component,
      property: track.property,
      value,
    }];
  });
}
