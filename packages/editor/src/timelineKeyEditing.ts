import {
  pasteAnimationKeyframe,
  snapAnimationTime,
  type AnimationClip,
  type AnimationKeyframe,
  type AnimationTangent,
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

export type TimelineKeyCollisionPolicy = 'overwrite' | 'protect';

export type TimelineKeyCollision = {
  track: number;
  key: number;
  frame: number;
};

type TimelineKeyCollisionResult = {
  collisions: TimelineKeyCollision[];
};

export type TimelineKeySelectionFrameRange = {
  count: number;
  startFrame: number;
  endFrame: number;
  spanFrames: number;
};

export type TimelineKeyRetimeResult = TimelineKeyEditResult & TimelineKeyCollisionResult & (
  | {
      ok: true;
      startFrame: number;
      endFrame: number;
    }
  | {
      ok: false;
      error: string;
    }
);

export type TimelineKeyTransformResult = TimelineKeyEditResult & TimelineKeyCollisionResult & (
  | { ok: true }
  | { ok: false; error: string }
);

export type TimelineKeyBatchCapabilities = {
  canAlign: boolean;
  canDistribute: boolean;
  canReverse: boolean;
};

type TimelineKeyFrameEdit = {
  ref: TimelineKeyRef;
  keyframe: AnimationKeyframe;
  targetFrame: number;
};

export type TimelineKeyMovePreview = TimelineKeyCollisionResult & {
  appliedDelta: number;
};

export type TimelineKeyMoveResult = TimelineKeyEditResult & TimelineKeyCollisionResult & {
  appliedDelta: number;
  requestedDelta: number;
  blocked: boolean;
  error?: string;
};

export type TimelineKeyPasteResult = TimelineKeyEditResult & TimelineKeyCollisionResult & {
  skipped: number;
  blocked: boolean;
  error?: string;
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

export function timelineKeySelectionFrameRange(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
): TimelineKeySelectionFrameRange | null {
  const refs = normalizeTimelineKeySelection(clip, selection);
  if (refs.length === 0) return null;
  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const frames = refs.map((ref) => Math.round(
    clip.tracks[ref.track].keyframes[ref.key].time * frameRate,
  ));
  const startFrame = Math.min(...frames);
  const endFrame = Math.max(...frames);
  return {
    count: refs.length,
    startFrame,
    endFrame,
    spanFrames: endFrame - startFrame,
  };
}

function timelineKeyFrameCollisions(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  targets: readonly { track: number; targetFrame: number }[],
): TimelineKeyCollision[] {
  const selected = new Set(normalizeTimelineKeySelection(clip, selection).map(refToken));
  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const collisions = new Map<string, TimelineKeyCollision>();
  for (const target of targets) {
    const track = clip.tracks[target.track];
    if (!track) continue;
    const key = track.keyframes.findIndex((candidate, index) => (
      !selected.has(refToken({ track: target.track, key: index }))
      && Math.round(candidate.time * frameRate) === target.targetFrame
    ));
    if (key < 0) continue;
    const collision = { track: target.track, key, frame: target.targetFrame };
    collisions.set(`${collision.track}:${collision.frame}`, collision);
  }
  return [...collisions.values()].sort((left, right) => left.track - right.track || left.frame - right.frame);
}

function applyTimelineKeyFrameEdits(
  clip: AnimationClip,
  refs: readonly TimelineKeyRef[],
  edits: readonly TimelineKeyFrameEdit[],
  collisionPolicy: TimelineKeyCollisionPolicy = 'overwrite',
): TimelineKeyTransformResult {
  if (refs.length === 0 || edits.length !== refs.length) {
    return { ok: false, clip, selection: [...refs], collisions: [], error: 'No animation keys are selected.' };
  }
  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const occupiedByTrack = new Map<number, Set<number>>();
  for (const edit of edits) {
    const occupied = occupiedByTrack.get(edit.ref.track) ?? new Set<number>();
    if (occupied.has(edit.targetFrame)) {
      return {
        ok: false,
        clip,
        selection: [...refs],
        collisions: [],
        error: 'The requested key transformation collapses selected keys onto the same frame of one track.',
      };
    }
    occupied.add(edit.targetFrame);
    occupiedByTrack.set(edit.ref.track, occupied);
  }

  const collisions = timelineKeyFrameCollisions(clip, refs, edits.map((edit) => ({
    track: edit.ref.track,
    targetFrame: edit.targetFrame,
  })));
  if (collisionPolicy === 'protect' && collisions.length > 0) {
    return {
      ok: false,
      clip,
      selection: [...refs],
      collisions,
      error: `${collisions.length} existing key${collisions.length === 1 ? '' : 's'} protected from overwrite.`,
    };
  }

  const tracks = [...clip.tracks];
  const movedTimes = new Map<string, { track: number; time: number }>();
  for (const [trackIndex] of occupiedByTrack) {
    const trackEdits = edits
      .filter((edit) => edit.ref.track === trackIndex)
      .sort((left, right) => left.targetFrame - right.targetFrame || left.ref.key - right.ref.key);
    const selectedIndices = new Set(trackEdits.map((edit) => edit.ref.key));
    let track = {
      ...tracks[trackIndex],
      keyframes: tracks[trackIndex].keyframes.filter((_keyframe, key) => !selectedIndices.has(key)),
    };
    for (const edit of trackEdits) {
      const authored = pasteAnimationKeyframe(
        track,
        edit.keyframe,
        edit.targetFrame / frameRate,
        frameRate,
        clip.duration,
      );
      track = authored.track;
      movedTimes.set(refToken(edit.ref), {
        track: trackIndex,
        time: track.keyframes[authored.keyIndex].time,
      });
    }
    tracks[trackIndex] = track;
  }

  const next = { ...clip, tracks };
  const nextSelection = refs.flatMap((ref) => {
    const moved = movedTimes.get(refToken(ref));
    if (!moved) return [];
    const { track, time } = moved;
    const key = next.tracks[track].keyframes.findIndex((candidate) => (
      Math.abs(candidate.time - time) < 0.25 / frameRate
    ));
    return key < 0 ? [] : [{ track, key }];
  });
  return {
    ok: true,
    clip: next,
    selection: normalizeTimelineKeySelection(next, nextSelection),
    collisions,
  };
}

function negateAnimationTangent(tangent: AnimationTangent): AnimationTangent {
  return Array.isArray(tangent) ? tangent.map((value) => -value) : -tangent;
}

function reverseAnimationKeyframe(keyframe: AnimationKeyframe): AnimationKeyframe {
  const reversed = structuredClone(keyframe);
  if (keyframe.out_tangent === undefined) delete reversed.in_tangent;
  else reversed.in_tangent = negateAnimationTangent(keyframe.out_tangent);
  if (keyframe.in_tangent === undefined) delete reversed.out_tangent;
  else reversed.out_tangent = negateAnimationTangent(keyframe.in_tangent);
  if (keyframe.out_tangent_mode === undefined) delete reversed.in_tangent_mode;
  else reversed.in_tangent_mode = keyframe.out_tangent_mode;
  if (keyframe.in_tangent_mode === undefined) delete reversed.out_tangent_mode;
  else reversed.out_tangent_mode = keyframe.in_tangent_mode;
  return reversed;
}

export function timelineKeyBatchCapabilities(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
): TimelineKeyBatchCapabilities {
  const refs = normalizeTimelineKeySelection(clip, selection);
  const counts = new Map<number, number>();
  for (const ref of refs) counts.set(ref.track, (counts.get(ref.track) ?? 0) + 1);
  const range = timelineKeySelectionFrameRange(clip, refs);
  return {
    canAlign: refs.length > 1 && [...counts.values()].every((count) => count === 1),
    canDistribute: [...counts.values()].some((count) => count >= 3),
    canReverse: refs.length > 1 && Boolean(range && range.spanFrames > 0),
  };
}

export function retimeTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  requestedStartFrame: number,
  requestedEndFrame: number,
  collisionPolicy: TimelineKeyCollisionPolicy = 'overwrite',
): TimelineKeyRetimeResult {
  const refs = normalizeTimelineKeySelection(clip, selection);
  const range = timelineKeySelectionFrameRange(clip, refs);
  if (!range) {
    return { ok: false, clip, selection: refs, collisions: [], error: 'No animation keys are selected.' };
  }
  if (!Number.isFinite(requestedStartFrame) || !Number.isFinite(requestedEndFrame)) {
    return { ok: false, clip, selection: refs, collisions: [], error: 'Animation key frames must be finite numbers.' };
  }

  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const durationFrames = Math.max(0, Math.round(clip.duration * frameRate));
  const startFrame = Math.max(0, Math.min(durationFrames, Math.round(requestedStartFrame)));
  const endFrame = refs.length === 1
    ? startFrame
    : Math.max(0, Math.min(durationFrames, Math.round(requestedEndFrame)));
  if (endFrame < startFrame) {
    return {
      ok: false,
      clip,
      selection: refs,
      collisions: [],
      error: 'The selection end frame cannot be before its start frame.',
    };
  }

  const scale = range.spanFrames > 0
    ? (endFrame - startFrame) / range.spanFrames
    : 0;
  const edits = refs.map((ref) => {
    const keyframe = structuredClone(clip.tracks[ref.track].keyframes[ref.key]);
    const sourceFrame = Math.round(keyframe.time * frameRate);
    const targetFrame = range.spanFrames > 0
      ? Math.round(startFrame + (sourceFrame - range.startFrame) * scale)
      : startFrame;
    return { ref, keyframe, targetFrame };
  });

  const transformed = applyTimelineKeyFrameEdits(clip, refs, edits, collisionPolicy);
  if (!transformed.ok) return transformed;
  return {
    ok: true,
    clip: transformed.clip,
    selection: transformed.selection,
    collisions: transformed.collisions,
    startFrame,
    endFrame,
  };
}

export function reverseTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  collisionPolicy: TimelineKeyCollisionPolicy = 'overwrite',
): TimelineKeyTransformResult {
  const refs = normalizeTimelineKeySelection(clip, selection);
  const range = timelineKeySelectionFrameRange(clip, refs);
  if (!range || refs.length < 2 || range.spanFrames === 0) {
    return { ok: false, clip, selection: refs, collisions: [], error: 'Select keys across at least two different frames to reverse them.' };
  }
  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const edits = refs.map((ref) => {
    const keyframe = clip.tracks[ref.track].keyframes[ref.key];
    const sourceFrame = Math.round(keyframe.time * frameRate);
    return {
      ref,
      keyframe: reverseAnimationKeyframe(keyframe),
      targetFrame: range.startFrame + range.endFrame - sourceFrame,
    };
  });
  return applyTimelineKeyFrameEdits(clip, refs, edits, collisionPolicy);
}

export function alignTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  requestedFrame: number,
  collisionPolicy: TimelineKeyCollisionPolicy = 'overwrite',
): TimelineKeyTransformResult {
  const refs = normalizeTimelineKeySelection(clip, selection);
  if (refs.length < 2 || !Number.isFinite(requestedFrame)) {
    return { ok: false, clip, selection: refs, collisions: [], error: 'Select at least two keys and provide a valid alignment frame.' };
  }
  const tracks = new Set<number>();
  for (const ref of refs) {
    if (tracks.has(ref.track)) {
      return { ok: false, clip, selection: refs, collisions: [], error: 'Time alignment supports one selected key per track to avoid destructive collisions.' };
    }
    tracks.add(ref.track);
  }
  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const durationFrames = Math.max(0, Math.round(clip.duration * frameRate));
  const targetFrame = Math.max(0, Math.min(durationFrames, Math.round(requestedFrame)));
  return applyTimelineKeyFrameEdits(clip, refs, refs.map((ref) => ({
    ref,
    keyframe: structuredClone(clip.tracks[ref.track].keyframes[ref.key]),
    targetFrame,
  })), collisionPolicy);
}

export function distributeTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  collisionPolicy: TimelineKeyCollisionPolicy = 'overwrite',
): TimelineKeyTransformResult {
  const refs = normalizeTimelineKeySelection(clip, selection);
  const grouped = new Map<number, TimelineKeyRef[]>();
  for (const ref of refs) {
    const entries = grouped.get(ref.track) ?? [];
    entries.push(ref);
    grouped.set(ref.track, entries);
  }
  if (![...grouped.values()].some((entries) => entries.length >= 3)) {
    return { ok: false, clip, selection: refs, collisions: [], error: 'Select at least three keys on one track to distribute them.' };
  }

  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const targetFrames = new Map<string, number>();
  const distributedRefs: TimelineKeyRef[] = [];
  for (const entries of grouped.values()) {
    const ordered = [...entries].sort((left, right) => (
      clip.tracks[left.track].keyframes[left.key].time - clip.tracks[right.track].keyframes[right.key].time
    ));
    if (ordered.length < 3) continue;
    const startFrame = Math.round(clip.tracks[ordered[0].track].keyframes[ordered[0].key].time * frameRate);
    const endRef = ordered[ordered.length - 1];
    const endFrame = Math.round(clip.tracks[endRef.track].keyframes[endRef.key].time * frameRate);
    for (const [index, ref] of ordered.entries()) {
      targetFrames.set(refToken(ref), Math.round(startFrame + (endFrame - startFrame) * index / (ordered.length - 1)));
      distributedRefs.push(ref);
    }
  }
  const transformed = applyTimelineKeyFrameEdits(clip, distributedRefs, distributedRefs.map((ref) => ({
    ref,
    keyframe: structuredClone(clip.tracks[ref.track].keyframes[ref.key]),
    targetFrame: targetFrames.get(refToken(ref))!,
  })), collisionPolicy);
  if (!transformed.ok) return transformed;
  const remapped = new Map(distributedRefs.map((ref, index) => (
    [refToken(ref), transformed.selection[index]] as const
  )));
  return {
    ok: true,
    clip: transformed.clip,
    collisions: transformed.collisions,
    selection: normalizeTimelineKeySelection(
      transformed.clip,
      refs.map((ref) => remapped.get(refToken(ref)) ?? ref),
    ),
  };
}

export function timelineKeyNudgeFrames(
  key: string,
  altKey: boolean,
  shiftKey: boolean,
): number {
  if (!altKey || (key !== 'ArrowLeft' && key !== 'ArrowRight')) return 0;
  const magnitude = shiftKey ? 10 : 1;
  return key === 'ArrowLeft' ? -magnitude : magnitude;
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
  collisionPolicy: TimelineKeyCollisionPolicy = 'overwrite',
): TimelineKeyPasteResult {
  const valid = clipboard.filter((item) => (
    Number.isFinite(item.offset)
    && item.offset >= 0
    && item.target.length > 0
    && item.component.length > 0
    && item.property.length > 0
  ));
  if (valid.length === 0) return {
    clip,
    selection: [],
    skipped: clipboard.length,
    collisions: [],
    blocked: false,
  };

  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const anchor = snapAnimationTime(time, frameRate);
  const matched = valid.flatMap((item) => {
    const track = clip.tracks.findIndex((candidate) => (
      candidate.target === item.target
      && candidate.component === item.component
      && candidate.property === item.property
    ));
    return track < 0 ? [] : [{ item, track }];
  });
  if (matched.length === 0) return {
    clip,
    selection: [],
    skipped: valid.length,
    collisions: [],
    blocked: false,
  };

  const duration = Math.max(
    clip.duration,
    ...matched.map(({ item }) => anchor + item.offset),
  );
  const targets = matched.map(({ item, track }) => ({
    track,
    targetFrame: Math.round(snapAnimationTime(
      anchor + item.offset,
      frameRate,
      duration,
    ) * frameRate),
  }));
  const collisions = timelineKeyFrameCollisions(clip, [], targets);
  const skipped = valid.length - matched.length + (clipboard.length - valid.length);
  if (collisionPolicy === 'protect' && collisions.length > 0) {
    return {
      clip,
      selection: [],
      skipped,
      collisions,
      blocked: true,
      error: `${collisions.length} existing key${collisions.length === 1 ? '' : 's'} protected from paste overwrite.`,
    };
  }
  const tracks = [...clip.tracks];
  const pastedTimes: Array<{ track: number; time: number }> = [];
  for (const { item, track } of matched) {
    const keyTime = snapAnimationTime(anchor + item.offset, frameRate, duration);
    const edit = pasteAnimationKeyframe(
      tracks[track],
      item.keyframe,
      keyTime,
      frameRate,
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
    skipped,
    collisions,
    blocked: false,
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

export function previewTimelineKeySelectionMove(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  delta: number,
): TimelineKeyMovePreview {
  const refs = normalizeTimelineKeySelection(clip, selection);
  const appliedDelta = clampTimelineKeyDelta(clip, refs, delta);
  if (refs.length === 0 || appliedDelta === 0) {
    return { appliedDelta, collisions: [] };
  }
  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const deltaFrames = Math.round(appliedDelta * frameRate);
  const targets = refs.map((ref) => ({
    track: ref.track,
    targetFrame: Math.round(clip.tracks[ref.track].keyframes[ref.key].time * frameRate) + deltaFrames,
  }));
  return {
    appliedDelta,
    collisions: timelineKeyFrameCollisions(clip, refs, targets),
  };
}

export function moveTimelineKeySelection(
  clip: AnimationClip,
  selection: readonly TimelineKeyRef[],
  delta: number,
  collisionPolicy: TimelineKeyCollisionPolicy = 'overwrite',
): TimelineKeyMoveResult {
  const refs = normalizeTimelineKeySelection(clip, selection);
  const preview = previewTimelineKeySelectionMove(clip, refs, delta);
  if (refs.length === 0 || preview.appliedDelta === 0) {
    return {
      clip,
      selection: refs,
      appliedDelta: preview.appliedDelta,
      requestedDelta: preview.appliedDelta,
      collisions: preview.collisions,
      blocked: false,
    };
  }

  const frameRate = Number.isFinite(clip.frame_rate) && clip.frame_rate > 0 ? clip.frame_rate : 60;
  const deltaFrames = Math.round(preview.appliedDelta * frameRate);
  const transformed = applyTimelineKeyFrameEdits(clip, refs, refs.map((ref) => ({
    ref,
    keyframe: structuredClone(clip.tracks[ref.track].keyframes[ref.key]),
    targetFrame: Math.round(clip.tracks[ref.track].keyframes[ref.key].time * frameRate) + deltaFrames,
  })), collisionPolicy);
  if (!transformed.ok) {
    return {
      clip,
      selection: refs,
      appliedDelta: 0,
      requestedDelta: preview.appliedDelta,
      collisions: transformed.collisions,
      blocked: true,
      error: transformed.error,
    };
  }
  return {
    clip: transformed.clip,
    selection: transformed.selection,
    appliedDelta: preview.appliedDelta,
    requestedDelta: preview.appliedDelta,
    collisions: transformed.collisions,
    blocked: false,
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
