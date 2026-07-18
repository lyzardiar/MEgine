import type {
  TimelineActivationClip,
  TimelineAnimationClip,
  TimelineAsset,
  TimelineAudioClip,
  TimelineParticleClip,
  TimelineSignal,
} from './timelineAsset.ts';

export type SequencerClipRange = { start: number; duration: number };
export type SequencerTrimEdge = 'start' | 'end';

export type SequencerClipboard =
  | { type: 'signal'; sourceTrackId: string; item: TimelineSignal }
  | { type: 'activation'; sourceTrackId: string; item: TimelineActivationClip }
  | { type: 'audio'; sourceTrackId: string; item: TimelineAudioClip }
  | { type: 'animation'; sourceTrackId: string; item: TimelineAnimationClip }
  | { type: 'particle'; sourceTrackId: string; item: TimelineParticleClip };

export type SequencerPasteResult =
  | { ok: true; asset: TimelineAsset; trackIndex: number; itemIndex: number }
  | { ok: false; error: string };

export type SequencerTrackMoveResult =
  | { ok: true; asset: TimelineAsset; trackIndex: number }
  | { ok: false; error: string };

export const SEQUENCER_MIN_ZOOM = 1;
export const SEQUENCER_MAX_ZOOM = 32;

export function clampSequencerZoom(value: number): number {
  if (!Number.isFinite(value)) return SEQUENCER_MIN_ZOOM;
  return Math.max(SEQUENCER_MIN_ZOOM, Math.min(SEQUENCER_MAX_ZOOM, value));
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function snap(value: number, frameRate: number): number {
  const fps = finitePositive(frameRate, 60);
  return Number((Math.round(value * fps) / fps).toFixed(9));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function neighbors(
  clips: readonly SequencerClipRange[],
  index: number,
): { previousEnd: number; nextStart: number } {
  const ordered = clips
    .map((clip, originalIndex) => ({ clip, originalIndex }))
    .sort((left, right) => left.clip.start - right.clip.start || left.originalIndex - right.originalIndex);
  const position = ordered.findIndex((entry) => entry.originalIndex === index);
  return {
    previousEnd: position > 0
      ? ordered[position - 1].clip.start + ordered[position - 1].clip.duration
      : 0,
    nextStart: position >= 0 && position < ordered.length - 1
      ? ordered[position + 1].clip.start
      : Number.POSITIVE_INFINITY,
  };
}

export function moveSequencerClip(
  clips: readonly SequencerClipRange[],
  index: number,
  delta: number,
  timelineDuration: number,
  frameRate: number,
): SequencerClipRange {
  const clip = clips[index];
  if (!clip) return { start: 0, duration: 0 };
  const timelineEnd = finitePositive(timelineDuration, clip.start + clip.duration);
  const { previousEnd, nextStart } = neighbors(clips, index);
  const maximum = Math.max(
    previousEnd,
    Math.min(timelineEnd - clip.duration, nextStart - clip.duration),
  );
  return {
    start: clamp(snap(clip.start + (Number.isFinite(delta) ? delta : 0), frameRate), previousEnd, maximum),
    duration: clip.duration,
  };
}

export function trimSequencerClip(
  clips: readonly SequencerClipRange[],
  index: number,
  edge: SequencerTrimEdge,
  delta: number,
  timelineDuration: number,
  frameRate: number,
  source?: { offset: number; rate: number },
): SequencerClipRange & { sourceOffsetDelta: number } {
  const clip = clips[index];
  if (!clip) return { start: 0, duration: 0, sourceOffsetDelta: 0 };
  const frame = 1 / finitePositive(frameRate, 60);
  const timelineEnd = finitePositive(timelineDuration, clip.start + clip.duration);
  const { previousEnd, nextStart } = neighbors(clips, index);
  const clipEnd = clip.start + clip.duration;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  if (edge === 'start') {
    let minimum = previousEnd;
    let maximum = clipEnd - frame;
    if (source && Number.isFinite(source.offset) && source.offset >= 0 && Number.isFinite(source.rate)) {
      if (source.rate > 0) minimum = Math.max(minimum, clip.start - source.offset / source.rate);
      if (source.rate < 0) maximum = Math.min(maximum, clip.start - source.offset / source.rate);
    }
    const start = clamp(snap(clip.start + safeDelta, frameRate), minimum, maximum);
    return {
      start,
      duration: clipEnd - start,
      sourceOffsetDelta: start - clip.start,
    };
  }
  const end = clamp(
    snap(clipEnd + safeDelta, frameRate),
    clip.start + frame,
    Math.min(timelineEnd, nextStart),
  );
  return {
    start: clip.start,
    duration: end - clip.start,
    sourceOffsetDelta: 0,
  };
}

export function findSequencerClipPlacement(
  clips: readonly SequencerClipRange[],
  requestedTime: number,
  requestedDuration: number,
  timelineDuration: number,
  frameRate: number,
): SequencerClipRange | null {
  const end = finitePositive(timelineDuration, 1);
  const frame = 1 / finitePositive(frameRate, 60);
  const duration = clamp(snap(finitePositive(requestedDuration, frame), frameRate), frame, end);
  const ordered = [...clips].sort((left, right) => left.start - right.start);
  let candidate = clamp(snap(Number.isFinite(requestedTime) ? requestedTime : 0, frameRate), 0, end - duration);
  for (const clip of ordered) {
    if (candidate + duration <= clip.start) return { start: candidate, duration };
    if (candidate < clip.start + clip.duration) candidate = snap(clip.start + clip.duration, frameRate);
  }
  if (candidate + duration <= end) return { start: candidate, duration };

  candidate = 0;
  for (const clip of ordered) {
    if (candidate + duration <= clip.start) return { start: candidate, duration };
    candidate = Math.max(candidate, snap(clip.start + clip.duration, frameRate));
  }
  return candidate + duration <= end ? { start: candidate, duration } : null;
}

export type SequencerTick = { time: number; position: number };

export function sequencerTicks(
  duration: number,
  laneWidth: number,
  minimumSpacing = 84,
): SequencerTick[] {
  const safeDuration = finitePositive(duration, 1);
  const safeWidth = finitePositive(laneWidth, minimumSpacing);
  const targetIntervals = Math.max(1, Math.floor(safeWidth / finitePositive(minimumSpacing, 84)));
  const roughStep = safeDuration / targetIntervals;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = multiplier * magnitude;
  const ticks: SequencerTick[] = [];
  const count = Math.floor(safeDuration / step + 1e-7);
  for (let index = 0; index <= count; index += 1) {
    const time = index * step;
    ticks.push({ time, position: time / safeDuration });
  }
  const lastTime = ticks.at(-1)?.time ?? 0;
  if (Math.abs(lastTime - safeDuration) > Math.max(1, safeDuration) * 1e-9) {
    ticks.push({ time: safeDuration, position: 1 });
  } else if (ticks.length > 0) {
    ticks[ticks.length - 1] = { time: safeDuration, position: 1 };
  }
  return ticks;
}

export function lockedSequencerContentEnd(asset: TimelineAsset): number {
  let end = 0;
  for (const track of asset.tracks) {
    if (!track.locked) continue;
    if (track.type === 'signal') {
      for (const marker of track.markers) end = Math.max(end, marker.time);
    } else {
      for (const clip of track.clips) end = Math.max(end, clip.start + clip.duration);
    }
  }
  return end;
}

export function moveSequencerTrack(
  asset: TimelineAsset,
  trackIndex: number,
  direction: -1 | 1,
): SequencerTrackMoveResult {
  const track = asset.tracks[trackIndex];
  if (!track) return { ok: false, error: 'Timeline track no longer exists.' };
  if (track.locked) return { ok: false, error: `Track '${track.name}' is locked. Unlock it before reordering.` };
  const nextIndex = trackIndex + direction;
  if (nextIndex < 0 || nextIndex >= asset.tracks.length) {
    return { ok: false, error: `Track '${track.name}' is already at the ${direction < 0 ? 'top' : 'bottom'}.` };
  }
  const next = structuredClone(asset);
  const [moved] = next.tracks.splice(trackIndex, 1);
  next.tracks.splice(nextIndex, 0, moved);
  return { ok: true, asset: next, trackIndex: nextIndex };
}

export function copySequencerItem(
  asset: TimelineAsset,
  trackIndex: number,
  itemIndex: number,
): SequencerClipboard | null {
  const track = asset.tracks[trackIndex];
  if (!track) return null;
  if (track.type === 'signal') {
    const item = track.markers[itemIndex];
    return item ? { type: 'signal', sourceTrackId: track.id, item: structuredClone(item) } : null;
  }
  if (track.type === 'activation') {
    const item = track.clips[itemIndex];
    if (!item) return null;
    return { type: 'activation', sourceTrackId: track.id, item: structuredClone(item) };
  }
  if (track.type === 'audio') {
    const item = track.clips[itemIndex];
    if (!item) return null;
    return { type: 'audio', sourceTrackId: track.id, item: structuredClone(item) };
  }
  if (track.type === 'animation') {
    const item = track.clips[itemIndex];
    if (!item) return null;
    return { type: 'animation', sourceTrackId: track.id, item: structuredClone(item) };
  }
  const item = track.clips[itemIndex];
  if (!item) return null;
  return { type: 'particle', sourceTrackId: track.id, item: structuredClone(item) };
}

export function resolveSequencerPasteTrack(
  asset: TimelineAsset,
  preferredTrackIndex: number | null,
  clipboard: SequencerClipboard,
): number {
  const preferred = preferredTrackIndex == null ? null : asset.tracks[preferredTrackIndex];
  if (preferred?.type === clipboard.type && !preferred.locked) return preferredTrackIndex!;
  const source = asset.tracks.findIndex(
    (track) => track.id === clipboard.sourceTrackId && track.type === clipboard.type && !track.locked,
  );
  if (source >= 0) return source;
  return asset.tracks.findIndex((track) => track.type === clipboard.type && !track.locked);
}

export function pasteSequencerItem(
  asset: TimelineAsset,
  preferredTrackIndex: number | null,
  requestedTime: number,
  clipboard: SequencerClipboard,
): SequencerPasteResult {
  const trackIndex = resolveSequencerPasteTrack(asset, preferredTrackIndex, clipboard);
  if (trackIndex < 0) {
    return { ok: false, error: `Timeline has no unlocked ${clipboard.type} track for this item.` };
  }
  const next = structuredClone(asset);
  const track = next.tracks[trackIndex];
  if (track.type !== clipboard.type || track.locked) return { ok: false, error: 'Timeline paste target is no longer editable.' };
  if (track.type === 'signal' && clipboard.type === 'signal') {
    const item = structuredClone(clipboard.item);
    item.time = clamp(snap(Number.isFinite(requestedTime) ? requestedTime : 0, next.frame_rate), 0, next.duration);
    track.markers.push(item);
    track.markers.sort((left, right) => left.time - right.time);
    return { ok: true, asset: next, trackIndex, itemIndex: track.markers.indexOf(item) };
  }
  if (track.type === 'signal' || clipboard.type === 'signal') {
    return { ok: false, error: 'Signal items cannot be pasted into clip tracks.' };
  }
  const placement = findSequencerClipPlacement(
    track.clips,
    requestedTime,
    clipboard.item.duration,
    next.duration,
    next.frame_rate,
  );
  if (!placement) return { ok: false, error: `${clipboard.type} track has no free space for this clip.` };
  if (track.type === 'activation' && clipboard.type === 'activation') {
    const item = { ...structuredClone(clipboard.item), ...placement };
    track.clips.push(item);
    track.clips.sort((left, right) => left.start - right.start);
    return { ok: true, asset: next, trackIndex, itemIndex: track.clips.indexOf(item) };
  }
  if (track.type === 'audio' && clipboard.type === 'audio') {
    const item = { ...structuredClone(clipboard.item), ...placement };
    track.clips.push(item);
    track.clips.sort((left, right) => left.start - right.start);
    return { ok: true, asset: next, trackIndex, itemIndex: track.clips.indexOf(item) };
  }
  if (track.type === 'animation' && clipboard.type === 'animation') {
    const item = { ...structuredClone(clipboard.item), ...placement };
    track.clips.push(item);
    track.clips.sort((left, right) => left.start - right.start);
    return { ok: true, asset: next, trackIndex, itemIndex: track.clips.indexOf(item) };
  }
  if (track.type === 'particle' && clipboard.type === 'particle') {
    const item = { ...structuredClone(clipboard.item), ...placement };
    track.clips.push(item);
    track.clips.sort((left, right) => left.start - right.start);
    return { ok: true, asset: next, trackIndex, itemIndex: track.clips.indexOf(item) };
  }
  return { ok: false, error: 'Timeline paste target is incompatible with the copied clip.' };
}
