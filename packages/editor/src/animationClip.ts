export type AnimationWrapMode = 'once' | 'loop' | 'ping_pong';
export type AnimationInterpolation = 'step' | 'linear' | 'smooth' | 'cubic';
export type AnimationValue = boolean | number | number[] | string;
export type AnimationTangent = number | number[];

export type AnimationKeyframe = {
  time: number;
  value: AnimationValue;
  in_tangent?: AnimationTangent;
  out_tangent?: AnimationTangent;
};

export type AnimationTrack = {
  target: string;
  component: string;
  property: string;
  interpolation: AnimationInterpolation;
  keyframes: AnimationKeyframe[];
};

export type AnimationEvent = {
  time: number;
  function: string;
  parameter: AnimationValue | null;
};

export type AnimationClip = {
  version: number;
  name: string;
  duration: number;
  frame_rate: number;
  wrap_mode: AnimationWrapMode;
  events: AnimationEvent[];
  tracks: AnimationTrack[];
};

export type AnimationSample = Pick<AnimationTrack, 'target' | 'component' | 'property'> & {
  value: AnimationValue;
};

export type AnimationKeyframeEdit = {
  track: AnimationTrack;
  keyIndex: number;
};

const DEFAULT_FRAME_RATE = 60;

export function createAnimationClip(name = 'New Animation'): AnimationClip {
  return {
    version: 1,
    name,
    duration: 1,
    frame_rate: DEFAULT_FRAME_RATE,
    wrap_mode: 'loop',
    events: [],
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

function animationTangent(value: unknown, keyValue: AnimationValue): AnimationTangent | undefined {
  if (typeof keyValue === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
  if (Array.isArray(keyValue) && Array.isArray(value) && value.length === keyValue.length) {
    return value.every((part) => typeof part === 'number' && Number.isFinite(part))
      ? value as number[]
      : undefined;
  }
  return undefined;
}

function interpolation(value: unknown): AnimationInterpolation {
  return value === 'step' || value === 'smooth' || value === 'cubic' ? value : 'linear';
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
      const inTangent = animationTangent(key.in_tangent ?? key.inTangent, parsedValue);
      const outTangent = animationTangent(key.out_tangent ?? key.outTangent, parsedValue);
      byTime.set(safeTime, {
        time: safeTime,
        value: parsedValue,
        ...(inTangent === undefined ? {} : { in_tangent: inTangent }),
        ...(outTangent === undefined ? {} : { out_tangent: outTangent }),
      });
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
  const events: AnimationEvent[] = [];
  for (const rawEvent of Array.isArray(source.events) ? source.events : []) {
    const event = record(rawEvent);
    const time = Number(event.time);
    const functionName = String(event.function ?? event.name ?? '').trim();
    if (!Number.isFinite(time) || !functionName) continue;
    const safeTime = Math.max(0, time);
    const parameter = event.parameter == null ? null : animationValue(event.parameter);
    if (event.parameter != null && parameter == null) continue;
    events.push({ time: safeTime, function: functionName, parameter });
    maxTime = Math.max(maxTime, safeTime);
  }
  events.sort((left, right) => left.time - right.time || left.function.localeCompare(right.function));
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
    events,
    tracks,
  };
}

export function parseAnimationClip(text: string): AnimationClip {
  return normalizeAnimationClip(JSON.parse(text));
}

export function serializeAnimationClip(clip: AnimationClip): string {
  return `${JSON.stringify(normalizeAnimationClip(clip), null, 2)}\n`;
}

export function snapAnimationTime(
  time: number,
  frameRate: number,
  duration = Number.POSITIVE_INFINITY,
): number {
  const fps = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : DEFAULT_FRAME_RATE;
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const snapped = Math.round(safeTime * fps) / fps;
  const limit = Number.isFinite(duration) ? Math.max(0, duration) : Number.POSITIVE_INFINITY;
  return Math.min(limit, snapped);
}

function writeAnimationKeyframe(
  track: AnimationTrack,
  excludedIndex: number | null,
  time: number,
  value: AnimationValue,
  frameRate: number,
  duration: number,
): AnimationKeyframeEdit {
  const keyTime = snapAnimationTime(time, frameRate, duration);
  const epsilon = 0.5 / (Number.isFinite(frameRate) && frameRate > 0
    ? frameRate
    : DEFAULT_FRAME_RATE);
  const preserved = excludedIndex == null
    ? track.keyframes.find((key) => Math.abs(key.time - keyTime) <= epsilon)
    : track.keyframes[excludedIndex];
  const keyframes = track.keyframes.filter((key, index) => (
    index !== excludedIndex && Math.abs(key.time - keyTime) > epsilon
  ));
  const inTangent = animationTangent(preserved?.in_tangent, value);
  const outTangent = animationTangent(preserved?.out_tangent, value);
  keyframes.push({
    time: keyTime,
    value: structuredClone(value),
    ...(inTangent === undefined ? {} : { in_tangent: structuredClone(inTangent) }),
    ...(outTangent === undefined ? {} : { out_tangent: structuredClone(outTangent) }),
  });
  keyframes.sort((left, right) => left.time - right.time);
  return {
    track: { ...track, keyframes },
    keyIndex: keyframes.findIndex((key) => key.time === keyTime),
  };
}

export function upsertAnimationKeyframe(
  track: AnimationTrack,
  time: number,
  value: AnimationValue,
  frameRate: number,
  duration = Number.POSITIVE_INFINITY,
): AnimationKeyframeEdit {
  return writeAnimationKeyframe(track, null, time, value, frameRate, duration);
}

export function replaceAnimationKeyframe(
  track: AnimationTrack,
  keyIndex: number,
  time: number,
  value: AnimationValue,
  frameRate: number,
  duration = Number.POSITIVE_INFINITY,
): AnimationKeyframeEdit | null {
  if (!track.keyframes[keyIndex]) return null;
  return writeAnimationKeyframe(track, keyIndex, time, value, frameRate, duration);
}

export function removeAnimationKeyframe(
  track: AnimationTrack,
  keyIndex: number,
): AnimationTrack {
  if (!track.keyframes[keyIndex]) return track;
  return {
    ...track,
    keyframes: track.keyframes.filter((_key, index) => index !== keyIndex),
  };
}

export function setAnimationKeyframeTangents(
  track: AnimationTrack,
  keyIndex: number,
  patch: { in_tangent?: AnimationTangent | null; out_tangent?: AnimationTangent | null },
): AnimationTrack {
  const current = track.keyframes[keyIndex];
  if (!current) return track;
  const next = { ...current };
  if ('in_tangent' in patch) {
    const value = animationTangent(patch.in_tangent, current.value);
    if (value === undefined || patch.in_tangent == null) delete next.in_tangent;
    else next.in_tangent = structuredClone(value);
  }
  if ('out_tangent' in patch) {
    const value = animationTangent(patch.out_tangent, current.value);
    if (value === undefined || patch.out_tangent == null) delete next.out_tangent;
    else next.out_tangent = structuredClone(value);
  }
  return {
    ...track,
    keyframes: track.keyframes.map((key, index) => index === keyIndex ? next : key),
  };
}

export function pasteAnimationKeyframe(
  track: AnimationTrack,
  source: AnimationKeyframe,
  time: number,
  frameRate: number,
  duration = Number.POSITIVE_INFINITY,
): AnimationKeyframeEdit {
  const edit = upsertAnimationKeyframe(track, time, source.value, frameRate, duration);
  return {
    keyIndex: edit.keyIndex,
    track: setAnimationKeyframeTangents(edit.track, edit.keyIndex, {
      in_tangent: source.in_tangent ?? null,
      out_tangent: source.out_tangent ?? null,
    }),
  };
}

export function addAnimationEvent(
  clip: AnimationClip,
  time: number,
  functionName = 'AnimationEvent',
): { clip: AnimationClip; eventIndex: number } {
  const event: AnimationEvent = {
    time: snapAnimationTime(time, clip.frame_rate, clip.duration),
    function: functionName.trim() || 'AnimationEvent',
    parameter: null,
  };
  const events = [...clip.events, event]
    .sort((left, right) => left.time - right.time || left.function.localeCompare(right.function));
  return { clip: { ...clip, events }, eventIndex: events.indexOf(event) };
}

export function replaceAnimationEvent(
  clip: AnimationClip,
  eventIndex: number,
  patch: Partial<AnimationEvent>,
): { clip: AnimationClip; eventIndex: number } | null {
  const current = clip.events[eventIndex];
  if (!current) return null;
  const next: AnimationEvent = {
    time: snapAnimationTime(patch.time ?? current.time, clip.frame_rate, clip.duration),
    function: (patch.function ?? current.function).trim() || current.function,
    parameter: patch.parameter === undefined ? current.parameter : structuredClone(patch.parameter),
  };
  const events = clip.events.filter((_event, index) => index !== eventIndex);
  events.push(next);
  events.sort((left, right) => left.time - right.time || left.function.localeCompare(right.function));
  return { clip: { ...clip, events }, eventIndex: events.indexOf(next) };
}

export function pasteAnimationEvent(
  clip: AnimationClip,
  source: AnimationEvent,
  time: number,
): { clip: AnimationClip; eventIndex: number } {
  const added = addAnimationEvent(clip, time, source.function);
  return replaceAnimationEvent(added.clip, added.eventIndex, {
    parameter: structuredClone(source.parameter),
  }) ?? added;
}

export function removeAnimationEvent(clip: AnimationClip, eventIndex: number): AnimationClip {
  if (!clip.events[eventIndex]) return clip;
  return { ...clip, events: clip.events.filter((_event, index) => index !== eventIndex) };
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

export function advanceAnimationPreviewPhase(
  phase: number,
  delta: number,
  duration: number,
  mode: AnimationWrapMode,
): { phase: number; time: number; finished: boolean } {
  if (!Number.isFinite(phase) || !Number.isFinite(delta) || !Number.isFinite(duration) || duration <= 0) {
    return { phase: 0, time: 0, finished: mode === 'once' };
  }
  const next = phase + delta;
  if (mode === 'once') {
    const time = Math.max(0, Math.min(duration, next));
    return {
      phase: time,
      time,
      finished: (delta >= 0 && next >= duration) || (delta < 0 && next <= 0),
    };
  }
  const period = mode === 'ping_pong' ? duration * 2 : duration;
  const nextPhase = ((next % period) + period) % period;
  return {
    phase: nextPhase,
    time: wrappedAnimationTime(nextPhase, duration, mode),
    finished: false,
  };
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

function numericSlope(
  left: AnimationValue,
  right: AnimationValue,
  span: number,
): AnimationTangent | null {
  if (!(span > Number.EPSILON)) return null;
  if (typeof left === 'number' && typeof right === 'number') return (right - left) / span;
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    return left.map((value, index) => (right[index] - value) / span);
  }
  return null;
}

export function automaticAnimationTangent(
  track: AnimationTrack,
  keyIndex: number,
): AnimationTangent | null {
  const key = track.keyframes[keyIndex];
  if (!key || (typeof key.value !== 'number' && !Array.isArray(key.value))) return null;
  const left = track.keyframes[Math.max(0, keyIndex - 1)];
  const right = track.keyframes[Math.min(track.keyframes.length - 1, keyIndex + 1)];
  if (left === right) {
    return typeof key.value === 'number' ? 0 : key.value.map(() => 0);
  }
  return numericSlope(left.value, right.value, right.time - left.time);
}

function cubicInterpolateValue(
  left: AnimationValue,
  right: AnimationValue,
  outTangent: AnimationTangent,
  inTangent: AnimationTangent,
  span: number,
  amount: number,
): AnimationValue {
  const amount2 = amount * amount;
  const amount3 = amount2 * amount;
  const h00 = 2 * amount3 - 3 * amount2 + 1;
  const h10 = amount3 - 2 * amount2 + amount;
  const h01 = -2 * amount3 + 3 * amount2;
  const h11 = amount3 - amount2;
  if (
    typeof left === 'number'
    && typeof right === 'number'
    && typeof outTangent === 'number'
    && typeof inTangent === 'number'
  ) {
    return h00 * left + h10 * span * outTangent + h01 * right + h11 * span * inTangent;
  }
  if (
    Array.isArray(left)
    && Array.isArray(right)
    && Array.isArray(outTangent)
    && Array.isArray(inTangent)
    && left.length === right.length
    && left.length === outTangent.length
    && left.length === inTangent.length
  ) {
    return left.map((value, index) => (
      h00 * value
      + h10 * span * outTangent[index]
      + h01 * right[index]
      + h11 * span * inTangent[index]
    ));
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
    else if (track.interpolation === 'cubic') {
      const fallback = numericSlope(left.value, right.value, span);
      const outTangent = animationTangent(left.out_tangent, left.value)
        ?? automaticAnimationTangent(track, index - 1)
        ?? fallback;
      const inTangent = animationTangent(right.in_tangent, right.value)
        ?? automaticAnimationTangent(track, index)
        ?? fallback;
      if (outTangent != null && inTangent != null) {
        return cubicInterpolateValue(left.value, right.value, outTangent, inTangent, span, amount);
      }
    }
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
