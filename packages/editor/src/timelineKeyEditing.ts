import {
  pasteAnimationKeyframe,
  snapAnimationTime,
  type AnimationClip,
  type AnimationKeyframe,
} from './animationClip.ts';

export type TimelineKeyRef = {
  track: number;
  key: number;
};

export type TimelineKeyClipboardItem = {
  target: string;
  component: string;
  property: string;
  offset: number;
  keyframe: AnimationKeyframe;
};

export type TimelineKeyEditResult = {
  clip: AnimationClip;
  selection: TimelineKeyRef[];
};

function refToken(ref: TimelineKeyRef): string {
  return `${ref.track}:${ref.key}`;
}

function sameRef(left: TimelineKeyRef, right: TimelineKeyRef): boolean {
  return left.track === right.track && left.key === right.key;
}

export function normalizeTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
): TimelineKeyRef[] {
  const seen = new Set<string>();
  return selection
    .filter((ref) => (
      Number.isInteger(ref.track)
      && Number.isInteger(ref.key)
      && clip.tracks[ref.track]?.keyframes[ref.key] != null
      && !seen.has(refToken(ref))
      && Boolean(seen.add(refToken(ref)))
    ))
    .map((ref) => ({ ...ref }));
}

export function mergeTimelineKeySelection(
  clip: AnimationClip,
  base: readonly TimelineKeyRef[],
  added: readonly TimelineKeyRef[],
): TimelineKeyRef[] {
  return normalizeTimelineKeySelection(clip, [...base, ...added]);
}

export function toggleTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  ref: TimelineKeyRef,
): TimelineKeyRef[] {
  const current = normalizeTimelineKeySelection(clip, selection);
  return current.some((candidate) => sameRef(candidate, ref))
    ? current.filter((candidate) => !sameRef(candidate, ref))
    : normalizeTimelineKeySelection(clip, [...current, ref]);
}

export function timelineKeyRangeSelection(
  clip: AnimationClip,
  anchor: TimelineKeyRef,
  target: TimelineKeyRef,
): TimelineKeyRef[] {
  if (anchor.track !== target.track || !clip.tracks[target.track]) {
    return normalizeTimelineKeySelection(clip, [target]);
  }
  const from = Math.min(anchor.key, target.key);
  const to = Math.max(anchor.key, target.key);
  return normalizeTimelineKeySelection(
    clip,
    Array.from({ length: to - from + 1 }, (_unused, offset) => ({
      track: target.track,
      key: from + offset,
    })),
  );
}

export function timelineKeysInRange(
  clip: AnimationClip,
  trackStart: number,
  trackEnd: number,
  timeStart: number,
  timeEnd: number,
): TimelineKeyRef[] {
  const firstTrack = Math.max(0, Math.min(trackStart, trackEnd));
  const lastTrack = Math.min(clip.tracks.length - 1, Math.max(trackStart, trackEnd));
  const firstTime = Math.min(timeStart, timeEnd);
  const lastTime = Math.max(timeStart, timeEnd);
  const selection: TimelineKeyRef[] = [];
  for (let track = firstTrack; track <= lastTrack; track += 1) {
    clip.tracks[track]?.keyframes.forEach((keyframe, key) => {
      if (keyframe.time >= firstTime && keyframe.time <= lastTime) {
        selection.push({ track, key });
      }
    });
  }
  return selection;
}

export function copyTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
): TimelineKeyClipboardItem[] {
  const refs = normalizeTimelineKeySelection(clip, selection);
  if (refs.length === 0) return [];
  const anchor = Math.min(...refs.map((ref) => clip.tracks[ref.track].keyframes[ref.key].time));
  return refs.map((ref) => {
    const track = clip.tracks[ref.track];
    const keyframe = track.keyframes[ref.key];
    return {
      target: track.target,
      component: track.component,
      property: track.property,
      offset: keyframe.time - anchor,
      keyframe: structuredClone(keyframe),
    };
  });
}

export function pasteTimelineKeySelection(
  clip: AnimationClip,
  clipboard: readonly TimelineKeyClipboardItem[],
  time: number,
): TimelineKeyEditResult & { skipped: number } {
  const valid = clipboard.filter((item) => (
    Number.isFinite(item.offset)
    && item.offset >= 0
    && item.target.length > 0
    && item.component.length > 0
    && item.property.length > 0
  ));
  if (valid.length === 0) return { clip, selection: [], skipped: clipboard.length };

  const anchor = snapAnimationTime(time, clip.frame_rate);
  const matched = valid.flatMap((item) => {
    const track = clip.tracks.findIndex((candidate) => (
      candidate.target === item.target
      && candidate.component === item.component
      && candidate.property === item.property
    ));
    return track < 0 ? [] : [{ item, track }];
  });
  if (matched.length === 0) return { clip, selection: [], skipped: valid.length };

  const duration = Math.max(
    clip.duration,
    ...matched.map(({ item }) => anchor + item.offset),
  );
  const tracks = [...clip.tracks];
  const pastedTimes: Array<{ track: number; time: number }> = [];
  for (const { item, track } of matched) {
    const keyTime = snapAnimationTime(anchor + item.offset, clip.frame_rate, duration);
    const edit = pasteAnimationKeyframe(
      tracks[track],
      item.keyframe,
      keyTime,
      clip.frame_rate,
      duration,
    );
    tracks[track] = edit.track;
    pastedTimes.push({ track, time: edit.track.keyframes[edit.keyIndex].time });
  }
  const next = { ...clip, duration, tracks };
  const selection = pastedTimes.flatMap(({ track, time: pastedTime }) => {
    const key = next.tracks[track].keyframes.findIndex((candidate) => candidate.time === pastedTime);
    return key < 0 ? [] : [{ track, key }];
  });
  return {
    clip: next,
    selection: normalizeTimelineKeySelection(next, selection),
    skipped: valid.length - matched.length + (clipboard.length - valid.length),
  };
}

export function clampTimelineKeyDelta(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  delta: number,
): number {
  const refs = normalizeTimelineKeySelection(clip, selection);
  if (refs.length === 0 || !Number.isFinite(delta)) return 0;
  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const times = refs.map((ref) => clip.tracks[ref.track].keyframes[ref.key].time);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const requestedFrames = Math.round(delta * frameRate);
  const minFrames = Math.ceil((-minTime * frameRate) - 1e-7);
  const maxFrames = Math.floor(((clip.duration - maxTime) * frameRate) + 1e-7);
  const frames = Math.max(minFrames, Math.min(maxFrames, requestedFrames));
  return frames === 0 ? 0 : frames / frameRate;
}

export function moveTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  delta: number,
): TimelineKeyEditResult & { appliedDelta: number } {
  const refs = normalizeTimelineKeySelection(clip, selection);
  const appliedDelta = clampTimelineKeyDelta(clip, refs, delta);
  if (refs.length === 0 || appliedDelta === 0) {
    return { clip, selection: refs, appliedDelta };
  }

  const grouped = new Map<number, Array<{ key: number; keyframe: AnimationKeyframe }>>();
  for (const ref of refs) {
    const entries = grouped.get(ref.track) ?? [];
    entries.push({ key: ref.key, keyframe: structuredClone(clip.tracks[ref.track].keyframes[ref.key]) });
    grouped.set(ref.track, entries);
  }

  const tracks = [...clip.tracks];
  const movedTimes: Array<{ track: number; time: number }> = [];
  for (const [trackIndex, entries] of grouped) {
    const selectedIndices = new Set(entries.map((entry) => entry.key));
    let track = {
      ...tracks[trackIndex],
      keyframes: tracks[trackIndex].keyframes.filter((_keyframe, index) => !selectedIndices.has(index)),
    };
    for (const entry of entries.sort((left, right) => left.keyframe.time - right.keyframe.time)) {
      const edit = pasteAnimationKeyframe(
        track,
        entry.keyframe,
        entry.keyframe.time + appliedDelta,
        clip.frame_rate,
        clip.duration,
      );
      track = edit.track;
      movedTimes.push({ track: trackIndex, time: track.keyframes[edit.keyIndex].time });
    }
    tracks[trackIndex] = track;
  }

  const next = { ...clip, tracks };
  const nextSelection = movedTimes.flatMap(({ track, time: movedTime }) => {
    const key = next.tracks[track].keyframes.findIndex((candidate) => candidate.time === movedTime);
    return key < 0 ? [] : [{ track, key }];
  });
  return {
    clip: next,
    selection: normalizeTimelineKeySelection(next, nextSelection),
    appliedDelta,
  };
}

export function removeTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
): AnimationClip {
  const grouped = new Map<number, Set<number>>();
  for (const ref of normalizeTimelineKeySelection(clip, selection)) {
    const indices = grouped.get(ref.track) ?? new Set<number>();
    indices.add(ref.key);
    grouped.set(ref.track, indices);
  }
  if (grouped.size === 0) return clip;
  return {
    ...clip,
    tracks: clip.tracks.map((track, trackIndex) => {
      const removed = grouped.get(trackIndex);
      return removed
        ? { ...track, keyframes: track.keyframes.filter((_keyframe, key) => !removed.has(key)) }
        : track;
    }),
  };
}
