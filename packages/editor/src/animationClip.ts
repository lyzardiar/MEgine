export type AnimationWrapMode = 'once' | 'loop' | 'ping_pong';
export type AnimationInterpolation = 'step' | 'linear' | 'smooth' | 'cubic';
export type AnimationValue = boolean | number | number[] | string;
export type AnimationTangent = number | number[];
export type AnimationTangentMode = 'clamped_auto' | 'free' | 'linear' | 'constant';

export type AnimationKeyframe = {
  time: number;
  value: AnimationValue;
  in_tangent?: AnimationTangent;
  out_tangent?: AnimationTangent;
  in_tangent_mode?: AnimationTangentMode;
  out_tangent_mode?: AnimationTangentMode;
  in_weight?: number;
  out_weight?: number;
  broken?: boolean;
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

function animationTangentMode(value: unknown): AnimationTangentMode | undefined {
  if (value === 'auto') return 'clamped_auto';
  return value === 'clamped_auto' || value === 'free' || value === 'linear' || value === 'constant'
    ? value
    : undefined;
}

function animationTangentWeight(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

function tangentsEqual(left: AnimationTangent | undefined, right: AnimationTangent | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  if (typeof left === 'number' || typeof right === 'number') return left === right;
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function animationKeyTangentMode(
  key: AnimationKeyframe,
  side: 'in_tangent' | 'out_tangent',
): AnimationTangentMode {
  const mode = side === 'in_tangent' ? key.in_tangent_mode : key.out_tangent_mode;
  if (mode) return mode;
  return key[side] === undefined ? 'clamped_auto' : 'free';
}

export function animationKeyTangentWeight(
  key: AnimationKeyframe,
  side: 'in_tangent' | 'out_tangent',
): number | null {
  return animationTangentWeight(side === 'in_tangent' ? key.in_weight : key.out_weight) ?? null;
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
      const inMode = animationTangentMode(key.in_tangent_mode ?? key.inTangentMode)
        ?? (inTangent === undefined ? undefined : 'free');
      const outMode = animationTangentMode(key.out_tangent_mode ?? key.outTangentMode)
        ?? (outTangent === undefined ? undefined : 'free');
      const numericKey = typeof parsedValue === 'number' || Array.isArray(parsedValue);
      const inWeight = numericKey ? animationTangentWeight(key.in_weight ?? key.inWeight) : undefined;
      const outWeight = numericKey ? animationTangentWeight(key.out_weight ?? key.outWeight) : undefined;
      const inferredBroken = (inMode ?? 'clamped_auto') !== (outMode ?? 'clamped_auto')
        || !tangentsEqual(inTangent, outTangent);
      byTime.set(safeTime, {
        time: safeTime,
        value: parsedValue,
        ...(inTangent === undefined ? {} : { in_tangent: inTangent }),
        ...(outTangent === undefined ? {} : { out_tangent: outTangent }),
        ...(inMode == null || inMode === 'clamped_auto' ? {} : { in_tangent_mode: inMode }),
        ...(outMode == null || outMode === 'clamped_auto' ? {} : { out_tangent_mode: outMode }),
        ...(inWeight === undefined ? {} : { in_weight: inWeight }),
        ...(outWeight === undefined ? {} : { out_weight: outWeight }),
        ...(key.broken === true || inferredBroken ? { broken: true } : {}),
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
  const numericValue = typeof value === 'number' || Array.isArray(value);
  const inMode = numericValue ? animationTangentMode(preserved?.in_tangent_mode) : undefined;
  const outMode = numericValue ? animationTangentMode(preserved?.out_tangent_mode) : undefined;
  const inWeight = numericValue ? animationTangentWeight(preserved?.in_weight) : undefined;
  const outWeight = numericValue ? animationTangentWeight(preserved?.out_weight) : undefined;
  keyframes.push({
    time: keyTime,
    value: structuredClone(value),
    ...(inTangent === undefined ? {} : { in_tangent: structuredClone(inTangent) }),
    ...(outTangent === undefined ? {} : { out_tangent: structuredClone(outTangent) }),
    ...(inMode == null || inMode === 'clamped_auto' || (inMode === 'free' && inTangent === undefined)
      ? {}
      : { in_tangent_mode: inMode }),
    ...(outMode == null || outMode === 'clamped_auto' || (outMode === 'free' && outTangent === undefined)
      ? {}
      : { out_tangent_mode: outMode }),
    ...(inWeight === undefined ? {} : { in_weight: inWeight }),
    ...(outWeight === undefined ? {} : { out_weight: outWeight }),
    ...(numericValue && preserved?.broken ? { broken: true } : {}),
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
  patch: {
    in_tangent?: AnimationTangent | null;
    out_tangent?: AnimationTangent | null;
    in_tangent_mode?: AnimationTangentMode | null;
    out_tangent_mode?: AnimationTangentMode | null;
    in_weight?: number | null;
    out_weight?: number | null;
    broken?: boolean;
  },
): AnimationTrack {
  const current = track.keyframes[keyIndex];
  if (!current) return track;
  const next = { ...current };
  if ('in_tangent' in patch) {
    const value = animationTangent(patch.in_tangent, current.value);
    if (value === undefined || patch.in_tangent == null) {
      delete next.in_tangent;
      if (!('in_tangent_mode' in patch)) delete next.in_tangent_mode;
    }
    else {
      next.in_tangent = structuredClone(value);
      if (!('in_tangent_mode' in patch)) next.in_tangent_mode = 'free';
    }
  }
  if ('out_tangent' in patch) {
    const value = animationTangent(patch.out_tangent, current.value);
    if (value === undefined || patch.out_tangent == null) {
      delete next.out_tangent;
      if (!('out_tangent_mode' in patch)) delete next.out_tangent_mode;
    }
    else {
      next.out_tangent = structuredClone(value);
      if (!('out_tangent_mode' in patch)) next.out_tangent_mode = 'free';
    }
  }
  if ('in_tangent_mode' in patch) {
    const mode = animationTangentMode(patch.in_tangent_mode);
    if (mode == null || mode === 'clamped_auto') delete next.in_tangent_mode;
    else next.in_tangent_mode = mode;
  }
  if ('out_tangent_mode' in patch) {
    const mode = animationTangentMode(patch.out_tangent_mode);
    if (mode == null || mode === 'clamped_auto') delete next.out_tangent_mode;
    else next.out_tangent_mode = mode;
  }
  if ('in_weight' in patch) {
    const weight = animationTangentWeight(patch.in_weight);
    if (weight === undefined || patch.in_weight == null) delete next.in_weight;
    else next.in_weight = weight;
  }
  if ('out_weight' in patch) {
    const weight = animationTangentWeight(patch.out_weight);
    if (weight === undefined || patch.out_weight == null) delete next.out_weight;
    else next.out_weight = weight;
  }
  if ('broken' in patch) {
    if (patch.broken) next.broken = true;
    else delete next.broken;
  } else {
    const editsIn = 'in_tangent' in patch || 'in_tangent_mode' in patch;
    const editsOut = 'out_tangent' in patch || 'out_tangent_mode' in patch;
    if (editsIn !== editsOut) next.broken = true;
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
      in_tangent_mode: source.in_tangent_mode ?? null,
      out_tangent_mode: source.out_tangent_mode ?? null,
      in_weight: source.in_weight ?? null,
      out_weight: source.out_weight ?? null,
      broken: source.broken === true,
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

function clampedScalarTangent(
  previous: number,
  current: number,
  next: number,
  previousSpan: number,
  nextSpan: number,
): number {
  const previousSlope = (current - previous) / previousSpan;
  const nextSlope = (next - current) / nextSpan;
  if (!Number.isFinite(previousSlope) || !Number.isFinite(nextSlope)) return 0;
  if (previousSlope === 0 || nextSlope === 0 || Math.sign(previousSlope) !== Math.sign(nextSlope)) return 0;
  const previousWeight = 2 * nextSpan + previousSpan;
  const nextWeight = nextSpan + 2 * previousSpan;
  const denominator = previousWeight / previousSlope + nextWeight / nextSlope;
  return denominator === 0 ? 0 : (previousWeight + nextWeight) / denominator;
}

function clampedNumericTangent(
  previous: AnimationValue,
  current: AnimationValue,
  next: AnimationValue,
  previousSpan: number,
  nextSpan: number,
): AnimationTangent | null {
  if (!(previousSpan > Number.EPSILON) || !(nextSpan > Number.EPSILON)) return null;
  if (typeof previous === 'number' && typeof current === 'number' && typeof next === 'number') {
    return clampedScalarTangent(previous, current, next, previousSpan, nextSpan);
  }
  if (
    Array.isArray(previous)
    && Array.isArray(current)
    && Array.isArray(next)
    && previous.length === current.length
    && previous.length === next.length
  ) {
    return current.map((value, index) => clampedScalarTangent(
      previous[index],
      value,
      next[index],
      previousSpan,
      nextSpan,
    ));
  }
  return null;
}

export function automaticAnimationTangent(
  track: AnimationTrack,
  keyIndex: number,
): AnimationTangent | null {
  const key = track.keyframes[keyIndex];
  if (!key || (typeof key.value !== 'number' && !Array.isArray(key.value))) return null;
  if (track.keyframes.length === 1) {
    return typeof key.value === 'number' ? 0 : key.value.map(() => 0);
  }
  if (keyIndex === 0) {
    const right = track.keyframes[1];
    return numericSlope(key.value, right.value, right.time - key.time);
  }
  if (keyIndex === track.keyframes.length - 1) {
    const left = track.keyframes[keyIndex - 1];
    return numericSlope(left.value, key.value, key.time - left.time);
  }
  const left = track.keyframes[keyIndex - 1];
  const right = track.keyframes[keyIndex + 1];
  return clampedNumericTangent(
    left.value,
    key.value,
    right.value,
    key.time - left.time,
    right.time - key.time,
  );
}

function resolvedAnimationTangent(
  track: AnimationTrack,
  keyIndex: number,
  side: 'in_tangent' | 'out_tangent',
  linearSlope: AnimationTangent | null,
): AnimationTangent | null {
  const key = track.keyframes[keyIndex];
  if (!key) return null;
  const mode = animationKeyTangentMode(key, side);
  if (mode === 'linear') return linearSlope;
  if (mode === 'free') {
    return animationTangent(key[side], key.value) ?? automaticAnimationTangent(track, keyIndex);
  }
  return automaticAnimationTangent(track, keyIndex);
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

function cubicBezier(a: number, b: number, c: number, d: number, amount: number): number {
  const inverse = 1 - amount;
  return inverse * inverse * inverse * a
    + 3 * inverse * inverse * amount * b
    + 3 * inverse * amount * amount * c
    + amount * amount * amount * d;
}

function weightedCurveParameter(amount: number, outWeight: number, inWeight: number): number {
  if (Math.abs(outWeight - 1 / 3) < 1e-7 && Math.abs(inWeight - 1 / 3) < 1e-7) return amount;
  let lower = 0;
  let upper = 1;
  let parameter = amount;
  for (let iteration = 0; iteration < 24; iteration++) {
    const x = cubicBezier(0, outWeight, 1 - inWeight, 1, parameter);
    if (x < amount) lower = parameter;
    else upper = parameter;
    parameter = (lower + upper) * 0.5;
  }
  return parameter;
}

function weightedCubicInterpolateValue(
  left: AnimationValue,
  right: AnimationValue,
  outTangent: AnimationTangent,
  inTangent: AnimationTangent,
  span: number,
  amount: number,
  outWeight: number,
  inWeight: number,
): AnimationValue {
  const parameter = weightedCurveParameter(amount, outWeight, inWeight);
  if (
    typeof left === 'number'
    && typeof right === 'number'
    && typeof outTangent === 'number'
    && typeof inTangent === 'number'
  ) {
    return cubicBezier(
      left,
      left + outTangent * span * outWeight,
      right - inTangent * span * inWeight,
      right,
      parameter,
    );
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
    return left.map((value, index) => cubicBezier(
      value,
      value + outTangent[index] * span * outWeight,
      right[index] - inTangent[index] * span * inWeight,
      right[index],
      parameter,
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
      if (
        animationKeyTangentMode(left, 'out_tangent') === 'constant'
        || animationKeyTangentMode(right, 'in_tangent') === 'constant'
      ) return structuredClone(left.value);
      const outTangent = resolvedAnimationTangent(track, index - 1, 'out_tangent', fallback)
        ?? fallback;
      const inTangent = resolvedAnimationTangent(track, index, 'in_tangent', fallback)
        ?? fallback;
      if (outTangent != null && inTangent != null) {
        const authoredOutWeight = animationKeyTangentWeight(left, 'out_tangent');
        const authoredInWeight = animationKeyTangentWeight(right, 'in_tangent');
        if (authoredOutWeight != null || authoredInWeight != null) {
          return weightedCubicInterpolateValue(
            left.value,
            right.value,
            outTangent,
            inTangent,
            span,
            amount,
            authoredOutWeight ?? 1 / 3,
            authoredInWeight ?? 1 / 3,
          );
        }
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
