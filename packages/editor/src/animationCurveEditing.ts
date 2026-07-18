import {
  automaticAnimationTangent,
  replaceAnimationKeyframe,
  sampleAnimationTrack,
  setAnimationKeyframeTangents,
  type AnimationKeyframeEdit,
  type AnimationTangent,
  type AnimationTrack,
  type AnimationValue,
} from './animationClip.ts';

export type AnimationCurveValueBounds = {
  minimum: number;
  maximum: number;
};

export type AnimationCurveViewport = AnimationCurveValueBounds & {
  timeStart: number;
  timeEnd: number;
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingTop: number;
  paddingBottom: number;
};

export type AnimationCurvePoint = {
  x: number;
  y: number;
};

export type AnimationCurveCoordinates = {
  time: number;
  value: number;
};

export function curveNumericChannels(value: AnimationValue | null): number[] | null {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value) && value.every(Number.isFinite)) return value;
  return null;
}

export function animationCurveChannelCount(track: AnimationTrack): number {
  return curveNumericChannels(track.keyframes[0]?.value ?? null)?.length ?? 0;
}

function tangentChannel(tangent: AnimationTangent | null, channel: number): number | null {
  if (typeof tangent === 'number') return channel === 0 && Number.isFinite(tangent) ? tangent : null;
  const value = tangent?.[channel];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function animationCurveTangentChannel(
  track: AnimationTrack,
  keyIndex: number,
  side: 'in_tangent' | 'out_tangent',
  channel: number,
): number | null {
  const key = track.keyframes[keyIndex];
  if (!key) return null;
  const tangent = key[side] ?? automaticAnimationTangent(track, keyIndex);
  return tangentChannel(tangent ?? null, channel);
}

export function animationCurveValueBounds(
  track: AnimationTrack,
  timeStart: number,
  timeEnd: number,
  sampleCount = 160,
): AnimationCurveValueBounds | null {
  if (animationCurveChannelCount(track) === 0) return null;
  const firstTime = Number.isFinite(timeStart) ? timeStart : 0;
  const lastTime = Number.isFinite(timeEnd) && timeEnd > firstTime ? timeEnd : firstTime + 1;
  const count = Math.max(2, Math.min(1024, Math.trunc(sampleCount) || 160));
  const values: number[] = [];
  for (let index = 0; index <= count; index += 1) {
    const time = firstTime + (lastTime - firstTime) * index / count;
    const channels = curveNumericChannels(sampleAnimationTrack(track, time));
    if (channels) values.push(...channels.slice(0, 4));
  }
  for (const key of track.keyframes) {
    if (key.time < firstTime || key.time > lastTime) continue;
    const channels = curveNumericChannels(key.value);
    if (channels) values.push(...channels.slice(0, 4));
  }
  if (values.length === 0) return null;
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;
  if (Math.abs(maximum - minimum) < 1e-6) {
    minimum -= 0.5;
    maximum += 0.5;
  } else {
    const padding = (maximum - minimum) * 0.08;
    minimum -= padding;
    maximum += padding;
  }
  return { minimum, maximum };
}

function plotWidth(viewport: AnimationCurveViewport): number {
  return Math.max(1, viewport.width - viewport.paddingLeft - viewport.paddingRight);
}

function plotHeight(viewport: AnimationCurveViewport): number {
  return Math.max(1, viewport.height - viewport.paddingTop - viewport.paddingBottom);
}

export function animationCurvePoint(
  viewport: AnimationCurveViewport,
  time: number,
  value: number,
): AnimationCurvePoint {
  const timeSpan = Math.max(Number.EPSILON, viewport.timeEnd - viewport.timeStart);
  const valueSpan = Math.max(Number.EPSILON, viewport.maximum - viewport.minimum);
  return {
    x: viewport.paddingLeft + (time - viewport.timeStart) / timeSpan * plotWidth(viewport),
    y: viewport.paddingTop + (viewport.maximum - value) / valueSpan * plotHeight(viewport),
  };
}

export function animationCurveCoordinates(
  viewport: AnimationCurveViewport,
  x: number,
  y: number,
): AnimationCurveCoordinates {
  const left = viewport.paddingLeft;
  const right = viewport.width - viewport.paddingRight;
  const top = viewport.paddingTop;
  const bottom = viewport.height - viewport.paddingBottom;
  const safeX = Math.max(left, Math.min(right, Number.isFinite(x) ? x : left));
  const safeY = Math.max(top, Math.min(bottom, Number.isFinite(y) ? y : bottom));
  return {
    time: viewport.timeStart + (safeX - left) / plotWidth(viewport)
      * (viewport.timeEnd - viewport.timeStart),
    value: viewport.maximum - (safeY - top) / plotHeight(viewport)
      * (viewport.maximum - viewport.minimum),
  };
}

export function moveAnimationCurveKey(
  track: AnimationTrack,
  keyIndex: number,
  channel: number,
  time: number,
  value: number,
  frameRate: number,
  duration: number,
): AnimationKeyframeEdit | null {
  const key = track.keyframes[keyIndex];
  const channels = curveNumericChannels(key?.value ?? null);
  if (!key || !channels || !Number.isInteger(channel) || channel < 0 || channel >= channels.length) {
    return null;
  }
  if (!Number.isFinite(value)) return null;
  const nextValue: AnimationValue = typeof key.value === 'number'
    ? value
    : channels.map((part, index) => index === channel ? value : part);
  return replaceAnimationKeyframe(track, keyIndex, time, nextValue, frameRate, duration);
}

function tangentWithChannel(
  source: AnimationTangent | null,
  keyValue: AnimationValue,
  channel: number,
  slope: number,
): AnimationTangent | null {
  if (!Number.isFinite(slope)) return null;
  if (typeof keyValue === 'number') return channel === 0 ? slope : null;
  if (!Array.isArray(keyValue) || channel < 0 || channel >= keyValue.length) return null;
  const base = Array.isArray(source) && source.length === keyValue.length
    ? [...source]
    : keyValue.map(() => 0);
  base[channel] = slope;
  return base;
}

export function setAnimationCurveTangentChannel(
  track: AnimationTrack,
  keyIndex: number,
  side: 'in_tangent' | 'out_tangent',
  channel: number,
  slope: number,
): AnimationTrack {
  const key = track.keyframes[keyIndex];
  if (!key) return track;
  const fallback = automaticAnimationTangent(track, keyIndex);
  const next = tangentWithChannel(key[side] ?? fallback, key.value, channel, slope);
  return next == null ? track : setAnimationKeyframeTangents(track, keyIndex, { [side]: next });
}

export function setAnimationCurveTangentsAuto(
  track: AnimationTrack,
  keyIndex: number,
): AnimationTrack {
  return setAnimationKeyframeTangents(track, keyIndex, {
    in_tangent: null,
    out_tangent: null,
  });
}

export function setAnimationCurveTangentsFlat(
  track: AnimationTrack,
  keyIndex: number,
): AnimationTrack {
  const key = track.keyframes[keyIndex];
  if (!key) return track;
  const flat: AnimationTangent | null = typeof key.value === 'number'
    ? 0
    : Array.isArray(key.value) ? key.value.map(() => 0) : null;
  return flat == null ? track : setAnimationKeyframeTangents(track, keyIndex, {
    in_tangent: flat,
    out_tangent: flat,
  });
}

export function animationCurveTangentHandle(
  track: AnimationTrack,
  keyIndex: number,
  side: 'in_tangent' | 'out_tangent',
  channel: number,
  viewport: AnimationCurveViewport,
  handleTime = (viewport.timeEnd - viewport.timeStart) * 0.08,
): AnimationCurvePoint | null {
  const key = track.keyframes[keyIndex];
  const values = curveNumericChannels(key?.value ?? null);
  const slope = animationCurveTangentChannel(track, keyIndex, side, channel);
  if (!key || !values || slope == null || values[channel] == null) return null;
  const direction = side === 'in_tangent' ? -1 : 1;
  const time = key.time + direction * Math.max(Number.EPSILON, handleTime);
  const value = values[channel] + direction * slope * Math.max(Number.EPSILON, handleTime);
  return animationCurvePoint(viewport, time, value);
}

export function animationCurveSlopeFromPoint(
  keyTime: number,
  keyValue: number,
  pointerTime: number,
  pointerValue: number,
): number | null {
  const deltaTime = pointerTime - keyTime;
  if (![keyTime, keyValue, pointerTime, pointerValue].every(Number.isFinite)) return null;
  if (Math.abs(deltaTime) < 1e-6) return null;
  const slope = (pointerValue - keyValue) / deltaTime;
  return Number.isFinite(slope) ? slope : null;
}
