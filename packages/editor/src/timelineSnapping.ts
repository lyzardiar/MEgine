import { snapAnimationTime, type AnimationClip } from './animationClip.ts';
import {
  normalizeTimelineKeySelection,
  type TimelineKeyRef,
} from './timelineKeyEditing.ts';

export type TimelineMagneticSnapResult = {
  delta: number;
  guideTime: number | null;
};

export type TimelineEventMagneticSnapResult = {
  time: number;
  guideTime: number | null;
};

function safeFrameRate(clip: AnimationClip): number {
  return Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
}

function snapSignedDelta(delta: number, frameRate: number): number {
  return Math.round((Number.isFinite(delta) ? delta : 0) * frameRate) / frameRate;
}

function keyToken(ref: TimelineKeyRef): string {
  return `${ref.track}:${ref.key}`;
}

function timelineSnapCandidates(
  clip: AnimationClip,
  playheadTime: number,
  excludedKeys: ReadonlySet<string>,
  excludedEvents: ReadonlySet<number>,
): number[] {
  const candidates = new Set<number>();
  const add = (time: number) => {
    if (Number.isFinite(time)) candidates.add(snapAnimationTime(time, clip.frame_rate, clip.duration));
  };
  add(0);
  add(clip.duration);
  add(playheadTime);
  clip.tracks.forEach((track, trackIndex) => {
    track.keyframes.forEach((keyframe, keyIndex) => {
      if (!excludedKeys.has(keyToken({ track: trackIndex, key: keyIndex }))) add(keyframe.time);
    });
  });
  clip.events.forEach((event, eventIndex) => {
    if (!excludedEvents.has(eventIndex)) add(event.time);
  });
  return [...candidates].sort((left, right) => left - right);
}

function snapMovingTimesDelta(
  clip: AnimationClip,
  movingTimes: readonly number[],
  requestedDelta: number,
  candidates: readonly number[],
  thresholdSeconds: number,
): TimelineMagneticSnapResult {
  const frameRate = safeFrameRate(clip);
  const delta = snapSignedDelta(requestedDelta, frameRate);
  const threshold = Number.isFinite(thresholdSeconds) ? Math.max(0, thresholdSeconds) : 0;
  if (movingTimes.length === 0 || candidates.length === 0 || !(threshold > 0)) {
    return { delta, guideTime: null };
  }

  let distance = Number.POSITIVE_INFINITY;
  let correction = 0;
  let guideTime: number | null = null;
  for (const movingTime of movingTimes) {
    const movedTime = snapAnimationTime(movingTime + delta, frameRate, clip.duration);
    for (const candidate of candidates) {
      const candidateCorrection = candidate - movedTime;
      const candidateDistance = Math.abs(candidateCorrection);
      if (
        candidateDistance > threshold + 1e-9
        || candidateDistance > distance + 1e-9
        || (Math.abs(candidateDistance - distance) <= 1e-9 && guideTime != null && candidate >= guideTime)
      ) continue;
      distance = candidateDistance;
      correction = candidateCorrection;
      guideTime = candidate;
    }
  }
  return guideTime == null
    ? { delta, guideTime: null }
    : { delta: delta + correction, guideTime };
}

export function snapTimelineKeySelectionDelta(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  requestedDelta: number,
  playheadTime: number,
  thresholdSeconds: number,
): TimelineMagneticSnapResult {
  const refs = normalizeTimelineKeySelection(clip, selection);
  const selected = new Set(refs.map(keyToken));
  const movingTimes = refs.map((ref) => clip.tracks[ref.track].keyframes[ref.key].time);
  return snapMovingTimesDelta(
    clip,
    movingTimes,
    requestedDelta,
    timelineSnapCandidates(clip, playheadTime, selected, new Set()),
    thresholdSeconds,
  );
}

export function snapTimelineEventTime(
  clip: AnimationClip,
  eventIndex: number,
  requestedTime: number,
  playheadTime: number,
  thresholdSeconds: number,
): TimelineEventMagneticSnapResult {
  const current = clip.events[eventIndex];
  const baseTime = snapAnimationTime(requestedTime, clip.frame_rate, clip.duration);
  if (!current) return { time: baseTime, guideTime: null };
  const threshold = Number.isFinite(thresholdSeconds) ? Math.max(0, thresholdSeconds) : 0;
  if (!(threshold > 0)) return { time: baseTime, guideTime: null };
  let distance = Number.POSITIVE_INFINITY;
  let guideTime: number | null = null;
  for (const candidate of timelineSnapCandidates(clip, playheadTime, new Set(), new Set([eventIndex]))) {
    const candidateDistance = Math.abs(candidate - baseTime);
    if (
      candidateDistance > threshold + 1e-9
      || candidateDistance > distance + 1e-9
      || (Math.abs(candidateDistance - distance) <= 1e-9 && guideTime != null && candidate >= guideTime)
    ) continue;
    distance = candidateDistance;
    guideTime = candidate;
  }
  return guideTime == null
    ? { time: baseTime, guideTime: null }
    : { time: guideTime, guideTime };
}
