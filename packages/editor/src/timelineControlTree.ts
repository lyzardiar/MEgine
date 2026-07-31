import {
  timelineControlSourceWindowIsValid,
  type TimelineControlClip,
  type TimelineControlExtrapolation,
  type TimelineTrack,
} from './timelineAsset.ts';

const F32_EPSILON = 1.1920928955078125e-7;

export type TimelineControlSourceSegment = {
  parentStart: number;
  parentEnd: number;
  childStart: number;
  childEnd: number;
  held: boolean;
  cycle: number;
};

export type TimelineControlSourceMap = {
  segments: TimelineControlSourceSegment[];
  truncated: boolean;
};

export type TimelineInlineTrackItem = {
  key: string;
  label: string;
  start: number;
  duration: number;
  marker: boolean;
};

function endSample(duration: number): number {
  const epsilon = Math.min(duration, Math.max(F32_EPSILON, duration * F32_EPSILON));
  return Math.max(0, duration - epsilon);
}

function rawTime(clip: TimelineControlClip, parentTime: number): number {
  return clip.clip_in + (parentTime - clip.start) * clip.speed;
}

function segmentLimit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(256, Math.floor(value)));
}

function sourceMapFromRawInterval(
  parentStart: number,
  parentEnd: number,
  sourceStart: number,
  sourceEnd: number,
  extrapolation: TimelineControlExtrapolation,
  childDuration: number,
  limit: number,
): TimelineControlSourceMap {
  if (parentEnd - parentStart <= F32_EPSILON || limit <= 0) {
    return { segments: [], truncated: false };
  }
  const sourceSpeed = (sourceEnd - sourceStart) / (parentEnd - parentStart);
  const sourceAt = (parentTime: number) => sourceStart
    + (parentTime - parentStart) * sourceSpeed;
  if (Math.abs(sourceSpeed) <= F32_EPSILON) {
    const sampled = extrapolation === 'loop'
      ? ((sourceStart % childDuration) + childDuration) % childDuration
      : extrapolation === 'hold' && sourceStart >= childDuration
        ? endSample(childDuration)
        : Math.max(0, Math.min(childDuration, sourceStart));
    return {
      segments: [{
        parentStart,
        parentEnd,
        childStart: sampled,
        childEnd: sampled,
        held: true,
        cycle: Math.floor(sourceStart / childDuration),
      }],
      truncated: false,
    };
  }

  const parentBreaks = [parentStart];
  let truncated = false;
  if (extrapolation === 'loop') {
    const lower = Math.min(sourceStart, sourceEnd);
    const upper = Math.max(sourceStart, sourceEnd);
    const firstBoundary = Math.floor(lower / childDuration) + 1;
    const lastBoundary = Math.ceil(upper / childDuration) - 1;
    const boundaryCount = Math.max(0, lastBoundary - firstBoundary + 1);
    truncated = boundaryCount + 1 > limit;
    const accepted = Math.min(boundaryCount, truncated ? limit : boundaryCount);
    for (let offset = 0; offset < accepted; offset += 1) {
      const cycle = sourceSpeed > 0
        ? firstBoundary + offset
        : lastBoundary - offset;
      const parent = parentStart + (cycle * childDuration - sourceStart) / sourceSpeed;
      if (parent > parentStart + F32_EPSILON && parent < parentEnd - F32_EPSILON) {
        parentBreaks.push(parent);
      }
    }
    if (!truncated) parentBreaks.push(parentEnd);
  } else if (extrapolation === 'hold') {
    parentBreaks.push(parentEnd);
    for (const boundary of [0, childDuration]) {
      const parent = parentStart + (boundary - sourceStart) / sourceSpeed;
      if (parent > parentStart + F32_EPSILON && parent < parentEnd - F32_EPSILON) {
        parentBreaks.push(parent);
      }
    }
  } else {
    parentBreaks.push(parentEnd);
  }
  parentBreaks.sort((left, right) => left - right);

  const segments: TimelineControlSourceSegment[] = [];
  for (let index = 1; index < parentBreaks.length && segments.length < limit; index += 1) {
    const segmentStart = parentBreaks[index - 1];
    const segmentEnd = parentBreaks[index];
    const rawStart = sourceAt(segmentStart);
    const rawEnd = sourceAt(segmentEnd);
    const rawMiddle = sourceAt((segmentStart + segmentEnd) * 0.5);
    if (extrapolation === 'loop') {
      const cycle = Math.floor(rawMiddle / childDuration);
      segments.push({
        parentStart: segmentStart,
        parentEnd: segmentEnd,
        childStart: Math.max(0, Math.min(childDuration, rawStart - cycle * childDuration)),
        childEnd: Math.max(0, Math.min(childDuration, rawEnd - cycle * childDuration)),
        held: false,
        cycle,
      });
      continue;
    }
    const held = rawMiddle <= 0 || rawMiddle >= childDuration;
    const sample = (value: number) => value >= childDuration && extrapolation === 'hold'
      ? endSample(childDuration)
      : Math.max(0, Math.min(childDuration, value));
    segments.push({
      parentStart: segmentStart,
      parentEnd: segmentEnd,
      childStart: sample(rawStart),
      childEnd: sample(rawEnd),
      held,
      cycle: 0,
    });
  }
  return { segments, truncated };
}

export function timelineControlSourceMap(
  clip: TimelineControlClip,
  childDuration: number,
  maxSegments = 256,
): TimelineControlSourceMap {
  const limit = segmentLimit(maxSegments);
  if (!Number.isFinite(childDuration) || childDuration <= 0 || limit <= 0) {
    return { segments: [], truncated: false };
  }
  if (!timelineControlSourceWindowIsValid(clip, childDuration)) {
    return { segments: [], truncated: false };
  }
  const parentStart = clip.start;
  const parentEnd = clip.start + clip.duration;
  const sourceStart = rawTime(clip, parentStart);
  const sourceEnd = rawTime(clip, parentEnd);
  return sourceMapFromRawInterval(
    parentStart,
    parentEnd,
    sourceStart,
    sourceEnd,
    clip.extrapolation,
    childDuration,
    limit,
  );
}

export function timelineComposeControlSourceMap(
  parentMap: TimelineControlSourceMap,
  clip: TimelineControlClip,
  childDuration: number,
  maxSegments = 256,
): TimelineControlSourceMap {
  const limit = segmentLimit(maxSegments);
  if (!Number.isFinite(childDuration) || childDuration <= 0 || limit <= 0
    || !timelineControlSourceWindowIsValid(clip, childDuration)) {
    return { segments: [], truncated: false };
  }
  const clipStart = clip.start;
  const clipEnd = clip.start + clip.duration;
  const segments: TimelineControlSourceSegment[] = [];
  let truncated = parentMap.truncated;
  for (const [parentIndex, parent] of parentMap.segments.entries()) {
    if (segments.length >= limit) {
      truncated = true;
      break;
    }
    const parentDelta = parent.childEnd - parent.childStart;
    let rootStart: number;
    let rootEnd: number;
    let timelineStart: number;
    let timelineEnd: number;
    if (Math.abs(parentDelta) <= F32_EPSILON) {
      if (parent.childStart < clipStart - F32_EPSILON
        || parent.childStart >= clipEnd - F32_EPSILON) continue;
      rootStart = parent.parentStart;
      rootEnd = parent.parentEnd;
      timelineStart = parent.childStart;
      timelineEnd = parent.childEnd;
    } else {
      const minimum = Math.min(parent.childStart, parent.childEnd);
      const maximum = Math.max(parent.childStart, parent.childEnd);
      const overlapStart = Math.max(clipStart, minimum);
      const overlapEnd = Math.min(clipEnd, maximum);
      if (overlapEnd - overlapStart <= F32_EPSILON) continue;
      const rootAt = (timelineTime: number) => parent.parentStart
        + (parent.parentEnd - parent.parentStart)
          * ((timelineTime - parent.childStart) / parentDelta);
      const rootA = rootAt(overlapStart);
      const rootB = rootAt(overlapEnd);
      rootStart = Math.min(rootA, rootB);
      rootEnd = Math.max(rootA, rootB);
      timelineStart = rootA <= rootB ? overlapStart : overlapEnd;
      timelineEnd = rootA <= rootB ? overlapEnd : overlapStart;
    }
    const rawStart = clip.clip_in + (timelineStart - clip.start) * clip.speed;
    const rawEnd = clip.clip_in + (timelineEnd - clip.start) * clip.speed;
    const nested = sourceMapFromRawInterval(
      rootStart,
      rootEnd,
      rawStart,
      rawEnd,
      clip.extrapolation,
      childDuration,
      limit - segments.length,
    );
    segments.push(...nested.segments);
    if (nested.truncated) truncated = true;
    if (segments.length >= limit && parentIndex < parentMap.segments.length - 1) {
      truncated = true;
    }
  }
  return {
    segments: segments.sort((left, right) => left.parentStart - right.parentStart),
    truncated,
  };
}

function clipLabel(track: Exclude<TimelineTrack, { type: 'signal' }>, index: number): string {
  if (track.type === 'activation') return track.clips[index].active ? 'Active' : 'Inactive';
  if (track.type === 'audio' || track.type === 'animation') {
    return track.clips[index].clip.split('/').at(-1) || track.name;
  }
  if (track.type === 'particle') return 'Particle';
  if (track.type === 'control') return track.clips[index].timeline.split('/').at(-1) || track.name;
  return track.clips[index].target || track.name;
}

export function timelineInlineTrackItems(
  track: TimelineTrack,
  sourceMap: TimelineControlSourceMap,
): TimelineInlineTrackItem[] {
  const output: TimelineInlineTrackItem[] = [];
  if (track.type === 'signal') {
    for (const [itemIndex, marker] of track.markers.entries()) {
      for (const [segmentIndex, segment] of sourceMap.segments.entries()) {
        if (segment.held || Math.abs(segment.childEnd - segment.childStart) <= F32_EPSILON) continue;
        const minimum = Math.min(segment.childStart, segment.childEnd);
        const maximum = Math.max(segment.childStart, segment.childEnd);
        if (marker.time < minimum - F32_EPSILON || marker.time > maximum + F32_EPSILON) continue;
        const progress = (marker.time - segment.childStart) / (segment.childEnd - segment.childStart);
        output.push({
          key: `${itemIndex}:${segmentIndex}`,
          label: marker.name,
          start: segment.parentStart + (segment.parentEnd - segment.parentStart) * progress,
          duration: 0,
          marker: true,
        });
      }
    }
    return output.sort((left, right) => left.start - right.start || left.key.localeCompare(right.key));
  }

  for (const [itemIndex, clip] of track.clips.entries()) {
    const itemStart = clip.start;
    const itemEnd = clip.start + clip.duration;
    for (const [segmentIndex, segment] of sourceMap.segments.entries()) {
      const delta = segment.childEnd - segment.childStart;
      if (Math.abs(delta) <= F32_EPSILON) {
        if (segment.childStart >= itemStart - F32_EPSILON
          && segment.childStart < itemEnd) {
          output.push({
            key: `${itemIndex}:${segmentIndex}`,
            label: clipLabel(track, itemIndex),
            start: segment.parentStart,
            duration: segment.parentEnd - segment.parentStart,
            marker: false,
          });
        }
        continue;
      }
      const childMinimum = Math.min(segment.childStart, segment.childEnd);
      const childMaximum = Math.max(segment.childStart, segment.childEnd);
      const overlapStart = Math.max(itemStart, childMinimum);
      const overlapEnd = Math.min(itemEnd, childMaximum);
      if (overlapEnd - overlapStart <= F32_EPSILON) continue;
      const rootAt = (childTime: number) => segment.parentStart
        + (segment.parentEnd - segment.parentStart)
          * ((childTime - segment.childStart) / delta);
      const parentA = rootAt(overlapStart);
      const parentB = rootAt(overlapEnd);
      output.push({
        key: `${itemIndex}:${segmentIndex}`,
        label: clipLabel(track, itemIndex),
        start: Math.min(parentA, parentB),
        duration: Math.abs(parentB - parentA),
        marker: false,
      });
    }
  }
  return output.sort((left, right) => left.start - right.start || left.key.localeCompare(right.key));
}
