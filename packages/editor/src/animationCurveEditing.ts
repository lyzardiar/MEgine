import {
  animationKeyTangentMode,
  animationKeyTangentWeight,
  automaticAnimationTangent,
  replaceAnimationKeyframe,
  sampleAnimationTrack,
  setAnimationKeyframeTangents,
  type AnimationKeyframeEdit,
  type AnimationTangent,
  type AnimationTangentMode,
  type AnimationTrack,
  type AnimationValue,
} from './animationClip.ts';

export type AnimationCurveValueBounds = {
  minimum: number;
  maximum: number;
};

export type AnimationCurveViewBounds = AnimationCurveValueBounds & {
  timeStart: number;
  timeEnd: number;
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

export function animationCurveMaximumZoom(
  duration: number,
  frameRate: number,
  maximumZoom = 64,
): number {
  const safeFrameRate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 60;
  const safeDuration = Math.max(1 / safeFrameRate, Number.isFinite(duration) ? duration : 0);
  const safeMaximum = Math.max(1, Number.isFinite(maximumZoom) ? maximumZoom : 64);
  return Math.max(1, Math.min(safeMaximum, safeDuration * safeFrameRate));
}

export type AnimationCurvePoint = {
  x: number;
  y: number;
};

export type AnimationCurveCoordinates = {
  time: number;
  value: number;
};

export type AnimationCurveRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function curveNumericChannels(value: AnimationValue | null): number[] | null {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value) && value.every(Number.isFinite)) return value;
  return null;
}

export function animationCurveChannelCount(track: AnimationTrack): number {
  return curveNumericChannels(track.keyframes[0]?.value ?? null)?.length ?? 0;
}

export function animationCurveChannelDrawOrder(channelCount: number, selectedChannel: number): number[] {
  const count = Math.max(0, Math.min(4, Math.floor(Number.isFinite(channelCount) ? channelCount : 0)));
  const channels = Array.from({ length: count }, (_unused, channel) => channel);
  if (!Number.isInteger(selectedChannel) || selectedChannel < 0 || selectedChannel >= count) return channels;
  return channels.filter((channel) => channel !== selectedChannel).concat(selectedChannel);
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
  const mode = animationKeyTangentMode(key, side);
  if (mode === 'constant') return null;
  let tangent: AnimationTangent | null | undefined;
  if (mode === 'linear') {
    const neighbourIndex = side === 'in_tangent' ? keyIndex - 1 : keyIndex + 1;
    const neighbour = track.keyframes[neighbourIndex];
    const span = neighbour ? neighbour.time - key.time : 0;
    const keyChannels = curveNumericChannels(key.value);
    const neighbourChannels = curveNumericChannels(neighbour?.value ?? null);
    if (keyChannels && neighbourChannels && keyChannels.length === neighbourChannels.length && Math.abs(span) > Number.EPSILON) {
      tangent = keyChannels.map((value, index) => (neighbourChannels[index] - value) / span);
    }
  } else if (mode === 'free') {
    tangent = key[side] ?? automaticAnimationTangent(track, keyIndex);
  } else {
    tangent = automaticAnimationTangent(track, keyIndex);
  }
  return tangentChannel(tangent ?? null, channel);
}

export type AnimationCurveTangentConstraint = 'clamped_auto' | 'free_smooth' | 'flat' | 'broken';

export function animationCurveTangentConstraint(
  track: AnimationTrack,
  keyIndex: number,
  channel: number,
): AnimationCurveTangentConstraint | null {
  const key = track.keyframes[keyIndex];
  const channels = curveNumericChannels(key?.value ?? null);
  if (!key || !channels || channel < 0 || channel >= channels.length) return null;
  const inMode = animationKeyTangentMode(key, 'in_tangent');
  const outMode = animationKeyTangentMode(key, 'out_tangent');
  if (key.broken || inMode !== outMode || inMode === 'linear' || inMode === 'constant') return 'broken';
  if (inMode === 'clamped_auto') return 'clamped_auto';
  const input = tangentChannel(key.in_tangent ?? null, channel);
  const output = tangentChannel(key.out_tangent ?? null, channel);
  if (input == null || output == null || Math.abs(input - output) > 1e-6) return 'broken';
  return Math.abs(input) <= 1e-6 ? 'flat' : 'free_smooth';
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

function animationCurveTimeRange(
  timeStart: number,
  timeEnd: number,
  duration: number,
  minimumSpan: number,
): Pick<AnimationCurveViewBounds, 'timeStart' | 'timeEnd'> {
  const safeDuration = Math.max(Number.EPSILON, Number.isFinite(duration) ? duration : 0);
  const safeMinimum = Math.max(
    Number.EPSILON,
    Math.min(safeDuration, Number.isFinite(minimumSpan) ? minimumSpan : Number.EPSILON),
  );
  const first = Number.isFinite(timeStart) ? timeStart : 0;
  const last = Number.isFinite(timeEnd) ? timeEnd : safeDuration;
  const requestedSpan = Math.max(safeMinimum, Math.abs(last - first));
  const span = Math.min(safeDuration, requestedSpan);
  const center = Number.isFinite(first + last) ? (first + last) / 2 : safeDuration / 2;
  const start = Math.max(0, Math.min(safeDuration - span, center - span / 2));
  return { timeStart: start, timeEnd: start + span };
}

export function animationCurveSelectionBounds(
  track: AnimationTrack,
  keyIndices: readonly number[],
  channel: number,
  duration: number,
  frameRate: number,
  maximumZoom = 64,
): AnimationCurveViewBounds | null {
  if (!Number.isInteger(channel) || channel < 0) return null;
  const selected = new Set(keyIndices.filter((key) => Number.isInteger(key) && key >= 0));
  const points = [...selected].flatMap((keyIndex) => {
    const key = track.keyframes[keyIndex];
    const value = curveNumericChannels(key?.value ?? null)?.[channel];
    return key && value != null ? [{ time: key.time, value }] : [];
  });
  if (points.length === 0) return null;

  const safeFrameRate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 60;
  const frameTime = 1 / safeFrameRate;
  const safeDuration = Math.max(frameTime, Number.isFinite(duration) ? duration : frameTime);
  const safeMaximumZoom = Math.max(1, Number.isFinite(maximumZoom) ? maximumZoom : 64);
  const firstTime = Math.min(...points.map((point) => point.time));
  const lastTime = Math.max(...points.map((point) => point.time));
  const timePadding = Math.max(frameTime, (lastTime - firstTime) * 0.12);
  const time = animationCurveTimeRange(
    firstTime - timePadding,
    lastTime + timePadding,
    safeDuration,
    Math.max(frameTime * 4, safeDuration / safeMaximumZoom),
  );

  const minimumValue = Math.min(...points.map((point) => point.value));
  const maximumValue = Math.max(...points.map((point) => point.value));
  const valueSpan = maximumValue - minimumValue;
  const valuePadding = valueSpan < 1e-6
    ? Math.max(0.5, Math.abs(minimumValue) * 0.1)
    : valueSpan * 0.12;
  return {
    ...time,
    minimum: minimumValue - valuePadding,
    maximum: maximumValue + valuePadding,
  };
}

export function zoomAnimationCurveView(
  view: AnimationCurveViewBounds,
  anchor: AnimationCurveCoordinates,
  timeScale: number,
  valueScale: number,
  duration: number,
  minimumTimeSpan = Number.EPSILON,
): AnimationCurveViewBounds {
  const safeDuration = Math.max(Number.EPSILON, Number.isFinite(duration) ? duration : 0);
  const sourceTime = animationCurveTimeRange(
    view.timeStart,
    view.timeEnd,
    safeDuration,
    minimumTimeSpan,
  );
  const sourceTimeSpan = sourceTime.timeEnd - sourceTime.timeStart;
  const safeTimeScale = Math.max(0.02, Math.min(50, Number.isFinite(timeScale) ? timeScale : 1));
  const nextTimeSpan = Math.max(
    Math.min(safeDuration, Math.max(Number.EPSILON, minimumTimeSpan)),
    Math.min(safeDuration, sourceTimeSpan * safeTimeScale),
  );
  const timeAnchor = Number.isFinite(anchor.time) ? anchor.time : (sourceTime.timeStart + sourceTime.timeEnd) / 2;
  const timeRatio = Math.max(0, Math.min(1, (timeAnchor - sourceTime.timeStart) / sourceTimeSpan));
  const timeStart = Math.max(0, Math.min(safeDuration - nextTimeSpan, timeAnchor - timeRatio * nextTimeSpan));

  const sourceMinimum = Number.isFinite(view.minimum) ? view.minimum : 0;
  const sourceMaximum = Number.isFinite(view.maximum) && view.maximum > sourceMinimum
    ? view.maximum
    : sourceMinimum + 1;
  const sourceValueSpan = sourceMaximum - sourceMinimum;
  const safeValueScale = Math.max(0.02, Math.min(50, Number.isFinite(valueScale) ? valueScale : 1));
  const valueAnchor = Number.isFinite(anchor.value) ? anchor.value : (sourceMinimum + sourceMaximum) / 2;
  const minimumValueSpan = Math.max(1e-6, Math.abs(valueAnchor) * 1e-9);
  const nextValueSpan = Math.max(minimumValueSpan, Math.min(1e12, sourceValueSpan * safeValueScale));
  const valueRatio = Math.max(0, Math.min(1, (valueAnchor - sourceMinimum) / sourceValueSpan));
  const minimum = valueAnchor - valueRatio * nextValueSpan;
  return {
    timeStart,
    timeEnd: timeStart + nextTimeSpan,
    minimum,
    maximum: minimum + nextValueSpan,
  };
}

export function panAnimationCurveView(
  view: AnimationCurveViewBounds,
  timeDelta: number,
  valueDelta: number,
  duration: number,
): AnimationCurveViewBounds {
  const safeDuration = Math.max(Number.EPSILON, Number.isFinite(duration) ? duration : 0);
  const sourceTime = animationCurveTimeRange(
    view.timeStart,
    view.timeEnd,
    safeDuration,
    Number.EPSILON,
  );
  const timeSpan = sourceTime.timeEnd - sourceTime.timeStart;
  const requestedTime = sourceTime.timeStart + (Number.isFinite(timeDelta) ? timeDelta : 0);
  const timeStart = Math.max(0, Math.min(safeDuration - timeSpan, requestedTime));
  const safeValueDelta = Number.isFinite(valueDelta) ? valueDelta : 0;
  const sourceMinimum = Number.isFinite(view.minimum) ? view.minimum : 0;
  const sourceMaximum = Number.isFinite(view.maximum) && view.maximum > sourceMinimum
    ? view.maximum
    : sourceMinimum + 1;
  return {
    timeStart,
    timeEnd: timeStart + timeSpan,
    minimum: sourceMinimum + safeValueDelta,
    maximum: sourceMaximum + safeValueDelta,
  };
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

export function animationCurveKeysInRect(
  track: AnimationTrack,
  channel: number,
  viewport: AnimationCurveViewport,
  rect: AnimationCurveRect,
): number[] {
  if (!Number.isInteger(channel) || channel < 0) return [];
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return [];
  const left = Math.min(rect.x, rect.x + rect.width);
  const right = Math.max(rect.x, rect.x + rect.width);
  const top = Math.min(rect.y, rect.y + rect.height);
  const bottom = Math.max(rect.y, rect.y + rect.height);
  return track.keyframes.flatMap((key, keyIndex) => {
    const value = curveNumericChannels(key.value)?.[channel];
    if (value == null || key.time < viewport.timeStart || key.time > viewport.timeEnd) return [];
    const point = animationCurvePoint(viewport, key.time, value);
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom
      ? [keyIndex]
      : [];
  });
}

export function offsetAnimationCurveKeyValues(
  track: AnimationTrack,
  keyIndices: readonly number[],
  channel: number,
  delta: number,
): AnimationTrack {
  if (!Number.isInteger(channel) || channel < 0 || !Number.isFinite(delta) || delta === 0) return track;
  const selected = new Set(keyIndices.filter((key) => Number.isInteger(key) && key >= 0));
  if (selected.size === 0) return track;
  let changed = false;
  const keyframes = track.keyframes.map((key, keyIndex) => {
    if (!selected.has(keyIndex)) return key;
    const values = curveNumericChannels(key.value);
    if (!values || values[channel] == null) return key;
    changed = true;
    const value: AnimationValue = typeof key.value === 'number'
      ? values[0] + delta
      : values.map((part, index) => index === channel ? part + delta : part);
    return { ...key, value };
  });
  return changed ? { ...track, keyframes } : track;
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
  weight?: number,
): AnimationTrack {
  const key = track.keyframes[keyIndex];
  if (!key) return track;
  const fallback = automaticAnimationTangent(track, keyIndex);
  const next = tangentWithChannel(key[side] ?? fallback, key.value, channel, slope);
  if (next == null) return track;
  const constraint = animationCurveTangentConstraint(track, keyIndex, channel);
  if (!key.broken && (constraint === 'clamped_auto' || constraint === 'free_smooth' || constraint === 'flat')) {
    const opposite = side === 'in_tangent' ? 'out_tangent' : 'in_tangent';
    const linked = tangentWithChannel(key[opposite] ?? fallback, key.value, channel, slope);
    if (linked == null) return track;
    return setAnimationKeyframeTangents(track, keyIndex, {
      [side]: next,
      [opposite]: linked,
      ...(weight === undefined ? {} : { [side === 'in_tangent' ? 'in_weight' : 'out_weight']: weight }),
      in_tangent_mode: 'free',
      out_tangent_mode: 'free',
      broken: false,
    });
  }
  return setAnimationKeyframeTangents(track, keyIndex, {
    [side]: next,
    [`${side}_mode`]: 'free',
    ...(weight === undefined ? {} : { [side === 'in_tangent' ? 'in_weight' : 'out_weight']: weight }),
    broken: true,
  });
}

export function setAnimationCurveTangentsAuto(
  track: AnimationTrack,
  keyIndex: number,
): AnimationTrack {
  return setAnimationKeyframeTangents(track, keyIndex, {
    in_tangent: null,
    out_tangent: null,
    in_tangent_mode: 'clamped_auto',
    out_tangent_mode: 'clamped_auto',
    in_weight: null,
    out_weight: null,
    broken: false,
  });
}

export function setAnimationCurveTangentsFreeSmooth(
  track: AnimationTrack,
  keyIndex: number,
): AnimationTrack {
  const smooth = automaticAnimationTangent(track, keyIndex);
  if (smooth == null) return track;
  return setAnimationKeyframeTangents(track, keyIndex, {
    in_tangent: smooth,
    out_tangent: smooth,
    in_tangent_mode: 'free',
    out_tangent_mode: 'free',
    broken: false,
  });
}

export function setAnimationCurveTangentsBroken(
  track: AnimationTrack,
  keyIndex: number,
): AnimationTrack {
  const key = track.keyframes[keyIndex];
  return key ? setAnimationKeyframeTangents(track, keyIndex, { broken: true }) : track;
}

export function setAnimationCurveTangentSideMode(
  track: AnimationTrack,
  keyIndex: number,
  side: 'in_tangent' | 'out_tangent',
  mode: AnimationTangentMode,
): AnimationTrack {
  const key = track.keyframes[keyIndex];
  if (!key) return track;
  const tangent = mode === 'clamped_auto'
    ? null
    : mode === 'free'
      ? key[side] ?? automaticAnimationTangent(track, keyIndex)
      : key[side] ?? null;
  return setAnimationKeyframeTangents(track, keyIndex, {
    [side]: tangent,
    [`${side}_mode`]: mode,
    ...(mode === 'free' ? {} : { [side === 'in_tangent' ? 'in_weight' : 'out_weight']: null }),
    broken: true,
  });
}

export function setAnimationCurveTangentWeight(
  track: AnimationTrack,
  keyIndex: number,
  side: 'in_tangent' | 'out_tangent',
  weight: number | null,
): AnimationTrack {
  const key = track.keyframes[keyIndex];
  if (!key) return track;
  const weightField = side === 'in_tangent' ? 'in_weight' : 'out_weight';
  if (weight == null) return setAnimationKeyframeTangents(track, keyIndex, { [weightField]: null });
  const tangent = key[side] ?? automaticAnimationTangent(track, keyIndex);
  if (tangent == null) return track;
  return setAnimationKeyframeTangents(track, keyIndex, {
    [side]: tangent,
    [`${side}_mode`]: 'free',
    [weightField]: weight,
    broken: key.broken === true,
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
    in_tangent_mode: 'free',
    out_tangent_mode: 'free',
    broken: false,
  });
}

export function animationCurveTangentHandle(
  track: AnimationTrack,
  keyIndex: number,
  side: 'in_tangent' | 'out_tangent',
  channel: number,
  viewport: AnimationCurveViewport,
  handleTime?: number,
): AnimationCurvePoint | null {
  const key = track.keyframes[keyIndex];
  const values = curveNumericChannels(key?.value ?? null);
  const slope = animationCurveTangentChannel(track, keyIndex, side, channel);
  if (!key || !values || slope == null || values[channel] == null) return null;
  const direction = side === 'in_tangent' ? -1 : 1;
  const neighbour = track.keyframes[keyIndex + direction];
  const segmentSpan = neighbour ? Math.abs(neighbour.time - key.time) : 0;
  const resolvedHandleTime = handleTime ?? segmentSpan * (animationKeyTangentWeight(key, side) ?? 1 / 3);
  const safeHandleTime = Math.max(Number.EPSILON, Math.min(segmentSpan || Number.POSITIVE_INFINITY, resolvedHandleTime));
  const time = key.time + direction * safeHandleTime;
  const value = values[channel] + direction * slope * safeHandleTime;
  return animationCurvePoint(viewport, time, value);
}

export function animationCurveTangentWeightFromPoint(
  track: AnimationTrack,
  keyIndex: number,
  side: 'in_tangent' | 'out_tangent',
  pointerTime: number,
): number | null {
  const key = track.keyframes[keyIndex];
  const neighbourIndex = side === 'in_tangent' ? keyIndex - 1 : keyIndex + 1;
  const neighbour = track.keyframes[neighbourIndex];
  if (!key || !neighbour || !Number.isFinite(pointerTime)) return null;
  const span = Math.abs(neighbour.time - key.time);
  if (!(span > Number.EPSILON)) return null;
  const direction = side === 'in_tangent' ? -1 : 1;
  return Math.max(0, Math.min(1, direction * (pointerTime - key.time) / span));
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
