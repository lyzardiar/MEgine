import type {
  TimelineActivationClip,
  TimelineAnimationClip,
  TimelineAsset,
  TimelineAudioClip,
  TimelineCameraClip,
  TimelineParticleClip,
  TimelineSignal,
} from './timelineAsset.ts';

export type SequencerClipRange = { start: number; duration: number };
export type SequencerTrimEdge = 'start' | 'end';

export type SequencerClipboardItem =
  | { type: 'signal'; sourceTrackId: string; item: TimelineSignal }
  | { type: 'activation'; sourceTrackId: string; item: TimelineActivationClip }
  | { type: 'audio'; sourceTrackId: string; item: TimelineAudioClip }
  | { type: 'animation'; sourceTrackId: string; item: TimelineAnimationClip }
  | { type: 'particle'; sourceTrackId: string; item: TimelineParticleClip }
  | { type: 'camera'; sourceTrackId: string; item: TimelineCameraClip };

export type SequencerClipboardGroup = {
  type: 'group';
  anchorTime: number;
  primary: number;
  items: SequencerClipboardItem[];
};

export type SequencerClipboard = SequencerClipboardItem | SequencerClipboardGroup;

export type SequencerPasteResult =
  | { ok: true; asset: TimelineAsset; trackIndex: number; itemIndex: number }
  | { ok: false; error: string };

export type SequencerClipboardPasteResult =
  | {
    ok: true;
    asset: TimelineAsset;
    selections: SequencerItemSelection[];
    primary: SequencerItemSelection;
  }
  | { ok: false; error: string };

export type SequencerTrackMoveResult =
  | { ok: true; asset: TimelineAsset; trackIndex: number }
  | { ok: false; error: string };

export type SequencerItemSelection = { track: number; marker: number };
export type SequencerSelectionMode = 'single' | 'toggle' | 'range';
export type SequencerMarqueeSelectionMode = 'replace' | 'add' | 'toggle';
export type SequencerItemSelectionResult = {
  primary: SequencerItemSelection | null;
  items: SequencerItemSelection[];
};
export type SequencerDeleteResult =
  | { ok: true; asset: TimelineAsset }
  | { ok: false; error: string };
export type SequencerMoveResult =
  | { ok: true; asset: TimelineAsset; delta: number }
  | { ok: false; error: string };
export type SequencerSnapEdge = SequencerTrimEdge | 'both';
export type SequencerSnapResult = { delta: number; guideTime: number | null };
export type SequencerCopyResult =
  | { ok: true; clipboard: SequencerClipboard }
  | { ok: false; error: string };

export const SEQUENCER_MIN_ZOOM = 1;
export const SEQUENCER_MAX_ZOOM = 32;

export function selectSequencerItem(
  current: readonly SequencerItemSelection[],
  anchor: SequencerItemSelection | null,
  clicked: SequencerItemSelection,
  mode: SequencerSelectionMode,
): SequencerItemSelectionResult {
  if (mode === 'single') return { primary: clicked, items: [{ ...clicked }] };
  if (mode === 'range') {
    const from = anchor?.track === clicked.track ? anchor.marker : clicked.marker;
    const first = Math.min(from, clicked.marker);
    const last = Math.max(from, clicked.marker);
    return {
      primary: clicked,
      items: Array.from(
        { length: last - first + 1 },
        (_, offset) => ({ track: clicked.track, marker: first + offset }),
      ),
    };
  }
  const key = `${clicked.track}:${clicked.marker}`;
  const unique = new Map<string, SequencerItemSelection>(
    current.map((item) => [`${item.track}:${item.marker}`, { ...item }] as const),
  );
  if (unique.has(key)) unique.delete(key);
  else unique.set(key, { ...clicked });
  const items = [...unique.values()];
  return { primary: items[items.length - 1] ?? null, items };
}

export function combineSequencerMarqueeSelection(
  current: readonly SequencerItemSelection[],
  hits: readonly SequencerItemSelection[],
  mode: SequencerMarqueeSelectionMode,
): SequencerItemSelection[] {
  const normalizedHits = new Map<string, SequencerItemSelection>();
  for (const hit of hits) {
    if (!Number.isInteger(hit.track) || hit.track < 0 || !Number.isInteger(hit.marker) || hit.marker < 0) continue;
    normalizedHits.set(`${hit.track}:${hit.marker}`, { ...hit });
  }
  if (mode === 'replace') return [...normalizedHits.values()];

  const combined = new Map<string, SequencerItemSelection>();
  for (const item of current) {
    if (!Number.isInteger(item.track) || item.track < 0 || !Number.isInteger(item.marker) || item.marker < 0) continue;
    combined.set(`${item.track}:${item.marker}`, { ...item });
  }
  for (const [key, hit] of normalizedHits) {
    if (mode === 'toggle' && combined.has(key)) combined.delete(key);
    else combined.set(key, hit);
  }
  return [...combined.values()];
}

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

export function snapSequencerItemsDelta(
  asset: TimelineAsset,
  selections: readonly SequencerItemSelection[],
  requestedDelta: number,
  playheadTime: number,
  thresholdSeconds: number,
  edge: SequencerSnapEdge = 'both',
): SequencerSnapResult {
  const baseDelta = snap(Number.isFinite(requestedDelta) ? requestedDelta : 0, asset.frame_rate);
  const threshold = Number.isFinite(thresholdSeconds) ? Math.max(0, thresholdSeconds) : 0;
  if (threshold <= 0) return { delta: baseDelta, guideTime: null };

  const selected = new Set<string>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.track) || !Number.isInteger(selection.marker)) continue;
    selected.add(`${selection.track}:${selection.marker}`);
  }
  const movingEdges: number[] = [];
  const candidates = new Set<number>();
  if (Number.isFinite(playheadTime)) candidates.add(snap(clamp(playheadTime, 0, asset.duration), asset.frame_rate));
  candidates.add(0);
  candidates.add(snap(asset.duration, asset.frame_rate));

  asset.tracks.forEach((track, trackIndex) => {
    if (track.type === 'signal') {
      track.markers.forEach((marker, markerIndex) => {
        const time = snap(marker.time, asset.frame_rate);
        if (selected.has(`${trackIndex}:${markerIndex}`)) movingEdges.push(time);
        else candidates.add(time);
      });
      return;
    }
    track.clips.forEach((clip, markerIndex) => {
      const start = snap(clip.start, asset.frame_rate);
      const end = snap(clip.start + clip.duration, asset.frame_rate);
      if (selected.has(`${trackIndex}:${markerIndex}`)) {
        if (edge !== 'end') movingEdges.push(start);
        if (edge !== 'start') movingEdges.push(end);
      } else {
        candidates.add(start);
        candidates.add(end);
      }
    });
  });

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestCorrection = 0;
  let guideTime: number | null = null;
  const orderedCandidates = [...candidates].sort((left, right) => left - right);
  for (const movingEdge of movingEdges) {
    const movedTime = snap(movingEdge + baseDelta, asset.frame_rate);
    let low = 0;
    let high = orderedCandidates.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (orderedCandidates[middle] < movedTime) low = middle + 1;
      else high = middle;
    }
    for (const index of [low - 1, low]) {
      const candidate = orderedCandidates[index];
      if (candidate == null) continue;
      const correction = candidate - movedTime;
      const distance = Math.abs(correction);
      if (
        distance > threshold + 1e-9
        || distance > bestDistance + 1e-9
        || (Math.abs(distance - bestDistance) <= 1e-9 && guideTime != null && candidate >= guideTime)
      ) continue;
      bestDistance = distance;
      bestCorrection = correction;
      guideTime = candidate;
    }
  }
  return guideTime == null
    ? { delta: baseDelta, guideTime: null }
    : { delta: snap(baseDelta + bestCorrection, asset.frame_rate), guideTime };
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

export function trimSequencerCameraBlendIn(
  originalBlendIn: number,
  trimmedDuration: number,
  sourceOffsetDelta: number,
): number {
  const duration = Math.max(0, Number.isFinite(trimmedDuration) ? trimmedDuration : 0);
  const blend = Number.isFinite(originalBlendIn) ? originalBlendIn : 0;
  const offset = Number.isFinite(sourceOffsetDelta) ? sourceOffsetDelta : 0;
  return clamp(blend - offset, 0, duration);
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

export function deleteSequencerItems(
  asset: TimelineAsset,
  selections: readonly SequencerItemSelection[],
  ripple = false,
): SequencerDeleteResult {
  const unique = new Map<string, SequencerItemSelection>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.track) || !Number.isInteger(selection.marker)) continue;
    unique.set(`${selection.track}:${selection.marker}`, selection);
  }
  if (unique.size === 0) return { ok: false, error: 'No Timeline items are selected.' };

  const grouped = new Map<number, number[]>();
  for (const selection of unique.values()) {
    const track = asset.tracks[selection.track];
    if (!track) return { ok: false, error: 'A selected Timeline track no longer exists.' };
    if (track.locked) return { ok: false, error: `Track '${track.name}' is locked. Unlock it before deleting.` };
    const itemCount = track.type === 'signal' ? track.markers.length : track.clips.length;
    if (selection.marker < 0 || selection.marker >= itemCount) {
      return { ok: false, error: `A selected item on track '${track.name}' no longer exists.` };
    }
    const markers = grouped.get(selection.track) ?? [];
    markers.push(selection.marker);
    grouped.set(selection.track, markers);
  }
  if (ripple && [...grouped.keys()].every((trackIndex) => asset.tracks[trackIndex].type === 'signal')) {
    return { ok: false, error: 'Ripple Delete requires at least one selected clip.' };
  }

  const next = structuredClone(asset);
  for (const [trackIndex, markerIndexes] of grouped) {
    const track = next.tracks[trackIndex];
    const selected = new Set(markerIndexes);
    if (track.type === 'signal') {
      track.markers = track.markers.filter((_, index) => !selected.has(index));
      continue;
    }
    const removed = track.clips
      .filter((_, index) => selected.has(index))
      .map((clip) => ({ end: clip.start + clip.duration, duration: clip.duration }));
    for (const markerIndex of [...selected].sort((left, right) => right - left)) {
      track.clips.splice(markerIndex, 1);
    }
    if (ripple) {
      for (const clip of track.clips) {
        const shift = removed.reduce(
          (total, range) => total + (range.end <= clip.start + 1e-6 ? range.duration : 0),
          0,
        );
        clip.start = snap(Math.max(0, clip.start - shift), next.frame_rate);
      }
    }
  }
  return { ok: true, asset: next };
}

function sequencerItemTime(item: SequencerClipboardItem): number {
  return item.type === 'signal' ? item.item.time : item.item.start;
}

export function copySequencerItems(
  asset: TimelineAsset,
  selections: readonly SequencerItemSelection[],
  primary: SequencerItemSelection | null = selections.at(-1) ?? null,
): SequencerCopyResult {
  const unique = new Map<string, SequencerItemSelection>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.track) || !Number.isInteger(selection.marker)) continue;
    unique.set(`${selection.track}:${selection.marker}`, selection);
  }
  if (unique.size === 0) return { ok: false, error: 'No Timeline items are selected.' };
  const entries: Array<{ selection: SequencerItemSelection; item: SequencerClipboardItem }> = [];
  for (const selection of unique.values()) {
    const item = copySequencerItem(asset, selection.track, selection.marker);
    if (!item) return { ok: false, error: 'A selected Timeline item no longer exists.' };
    entries.push({ selection: { ...selection }, item });
  }
  if (entries.length === 1) return { ok: true, clipboard: entries[0].item };
  const anchorTime = Math.min(...entries.map((entry) => sequencerItemTime(entry.item)));
  const primaryIndex = Math.max(0, entries.findIndex((entry) => (
    entry.selection.track === primary?.track && entry.selection.marker === primary?.marker
  )));
  return {
    ok: true,
    clipboard: {
      type: 'group',
      anchorTime,
      primary: primaryIndex,
      items: entries.map((entry) => entry.item),
    },
  };
}

export function moveSequencerItems(
  asset: TimelineAsset,
  selections: readonly SequencerItemSelection[],
  requestedDelta: number,
): SequencerMoveResult {
  const unique = new Map<string, SequencerItemSelection>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.track) || !Number.isInteger(selection.marker)) continue;
    unique.set(`${selection.track}:${selection.marker}`, selection);
  }
  if (unique.size === 0) return { ok: false, error: 'No Timeline items are selected.' };
  const selectedByTrack = new Map<number, Set<number>>();
  let minimumDelta = Number.NEGATIVE_INFINITY;
  let maximumDelta = Number.POSITIVE_INFINITY;
  for (const selection of unique.values()) {
    const track = asset.tracks[selection.track];
    if (!track) return { ok: false, error: 'A selected Timeline track no longer exists.' };
    if (track.locked) return { ok: false, error: `Track '${track.name}' is locked. Unlock it before moving.` };
    const count = track.type === 'signal' ? track.markers.length : track.clips.length;
    if (selection.marker < 0 || selection.marker >= count) {
      return { ok: false, error: `A selected item on track '${track.name}' no longer exists.` };
    }
    const indexes = selectedByTrack.get(selection.track) ?? new Set<number>();
    indexes.add(selection.marker);
    selectedByTrack.set(selection.track, indexes);
    if (track.type === 'signal') {
      const marker = track.markers[selection.marker];
      minimumDelta = Math.max(minimumDelta, -marker.time);
      maximumDelta = Math.min(maximumDelta, asset.duration - marker.time);
    } else {
      const clip = track.clips[selection.marker];
      minimumDelta = Math.max(minimumDelta, -clip.start);
      maximumDelta = Math.min(maximumDelta, asset.duration - clip.start - clip.duration);
    }
  }
  for (const [trackIndex, selected] of selectedByTrack) {
    const track = asset.tracks[trackIndex];
    if (track.type === 'signal') continue;
    for (const selectedIndex of selected) {
      const clip = track.clips[selectedIndex];
      const clipEnd = clip.start + clip.duration;
      for (let otherIndex = 0; otherIndex < track.clips.length; otherIndex += 1) {
        if (selected.has(otherIndex)) continue;
        const other = track.clips[otherIndex];
        const otherEnd = other.start + other.duration;
        if (otherEnd <= clip.start + 1e-6) {
          minimumDelta = Math.max(minimumDelta, otherEnd - clip.start);
        } else if (other.start >= clipEnd - 1e-6) {
          maximumDelta = Math.min(maximumDelta, other.start - clipEnd);
        } else {
          return { ok: false, error: `Track '${track.name}' already contains overlapping clips.` };
        }
      }
    }
  }
  const safeDelta = Number.isFinite(requestedDelta) ? requestedDelta : 0;
  const delta = snap(clamp(safeDelta, minimumDelta, maximumDelta), asset.frame_rate);
  const next = structuredClone(asset);
  for (const selection of unique.values()) {
    const track = next.tracks[selection.track];
    if (track.type === 'signal') track.markers[selection.marker].time = snap(track.markers[selection.marker].time + delta, next.frame_rate);
    else track.clips[selection.marker].start = snap(track.clips[selection.marker].start + delta, next.frame_rate);
  }
  return { ok: true, asset: next, delta };
}

export function copySequencerItem(
  asset: TimelineAsset,
  trackIndex: number,
  itemIndex: number,
): SequencerClipboardItem | null {
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
  if (track.type === 'particle') {
    const item = track.clips[itemIndex];
    if (!item) return null;
    return { type: 'particle', sourceTrackId: track.id, item: structuredClone(item) };
  }
  const item = track.clips[itemIndex];
  if (!item) return null;
  return { type: 'camera', sourceTrackId: track.id, item: structuredClone(item) };
}

export function resolveSequencerPasteTrack(
  asset: TimelineAsset,
  preferredTrackIndex: number | null,
  clipboard: SequencerClipboardItem,
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
  clipboard: SequencerClipboardItem,
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
  if (track.type === 'camera' && clipboard.type === 'camera') {
    const item = { ...structuredClone(clipboard.item), ...placement };
    track.clips.push(item);
    track.clips.sort((left, right) => left.start - right.start);
    return { ok: true, asset: next, trackIndex, itemIndex: track.clips.indexOf(item) };
  }
  return { ok: false, error: 'Timeline paste target is incompatible with the copied clip.' };
}

type GroupTarget = {
  entry: SequencerClipboardItem;
  targetTrack: number;
  relativeStart: number;
};

function resolveSequencerGroupTargets(
  asset: TimelineAsset,
  clipboard: SequencerClipboardGroup,
  preferredTrackIndex: number | null,
): GroupTarget[] | string {
  const sourceGroups = new Map<string, { type: SequencerClipboardItem['type']; indexes: number[] }>();
  for (let index = 0; index < clipboard.items.length; index += 1) {
    const item = clipboard.items[index];
    const existing = sourceGroups.get(item.sourceTrackId);
    if (existing && existing.type !== item.type) {
      return `Copied source track '${item.sourceTrackId}' contains incompatible item types.`;
    }
    const group = existing ?? { type: item.type, indexes: [] };
    group.indexes.push(index);
    sourceGroups.set(item.sourceTrackId, group);
  }
  const targetBySource = new Map<string, number>();
  const usedTargets = new Set<number>();
  for (const [sourceTrackId, source] of sourceGroups) {
    const exact = asset.tracks.findIndex((track, index) => (
      !usedTargets.has(index) && track.id === sourceTrackId && track.type === source.type && !track.locked
    ));
    if (exact >= 0) {
      targetBySource.set(sourceTrackId, exact);
      usedTargets.add(exact);
    }
  }
  const primaryItem = clipboard.items[clipboard.primary] ?? clipboard.items[0];
  if (primaryItem && !targetBySource.has(primaryItem.sourceTrackId) && preferredTrackIndex != null) {
    const preferred = asset.tracks[preferredTrackIndex];
    if (preferred && preferred.type === primaryItem.type && !preferred.locked && !usedTargets.has(preferredTrackIndex)) {
      targetBySource.set(primaryItem.sourceTrackId, preferredTrackIndex);
      usedTargets.add(preferredTrackIndex);
    }
  }
  for (const [sourceTrackId, source] of sourceGroups) {
    if (targetBySource.has(sourceTrackId)) continue;
    const fallback = asset.tracks.findIndex((track, index) => (
      !usedTargets.has(index) && track.type === source.type && !track.locked
    ));
    if (fallback < 0) return `Timeline has no separate unlocked ${source.type} track for copied track '${sourceTrackId}'.`;
    targetBySource.set(sourceTrackId, fallback);
    usedTargets.add(fallback);
  }
  return clipboard.items.map((entry) => ({
    entry,
    targetTrack: targetBySource.get(entry.sourceTrackId)!,
    relativeStart: sequencerItemTime(entry) - clipboard.anchorTime,
  }));
}

function groupInternalCollision(targets: readonly GroupTarget[]): string | null {
  for (let left = 0; left < targets.length; left += 1) {
    const first = targets[left];
    if (first.entry.type === 'signal') continue;
    for (let right = left + 1; right < targets.length; right += 1) {
      const second = targets[right];
      if (second.entry.type === 'signal' || first.targetTrack !== second.targetTrack) continue;
      const firstEnd = first.relativeStart + first.entry.item.duration;
      const secondEnd = second.relativeStart + second.entry.item.duration;
      if (first.relativeStart < secondEnd - 1e-6 && firstEnd > second.relativeStart + 1e-6) {
        return 'Copied clips overlap after their source tracks are mapped to the paste target.';
      }
    }
  }
  return null;
}

function nextGroupPasteCandidate(
  asset: TimelineAsset,
  targets: readonly GroupTarget[],
  candidate: number,
): number | null {
  let next = candidate;
  let collided = false;
  for (const target of targets) {
    if (target.entry.type === 'signal') continue;
    const plannedStart = candidate + target.relativeStart;
    const plannedEnd = plannedStart + target.entry.item.duration;
    const track = asset.tracks[target.targetTrack];
    if (track.type === 'signal') return null;
    for (const existing of track.clips) {
      const existingEnd = existing.start + existing.duration;
      if (plannedStart < existingEnd - 1e-6 && plannedEnd > existing.start + 1e-6) {
        collided = true;
        next = Math.max(next, existingEnd - target.relativeStart);
      }
    }
  }
  return collided ? next : null;
}

function findSequencerGroupPlacement(
  asset: TimelineAsset,
  targets: readonly GroupTarget[],
  requestedTime: number,
): number | null {
  const spanEnd = Math.max(0, ...targets.map((target) => (
    target.entry.type === 'signal'
      ? target.relativeStart
      : target.relativeStart + target.entry.item.duration
  )));
  if (spanEnd > asset.duration + 1e-6) return null;
  const maximum = Math.max(0, asset.duration - spanEnd);
  const requested = clamp(snap(Number.isFinite(requestedTime) ? requestedTime : 0, asset.frame_rate), 0, maximum);
  const frame = 1 / finitePositive(asset.frame_rate, 60);
  const search = (start: number, end: number): number | null => {
    let candidate = start;
    let attempts = 0;
    while (candidate <= end + 1e-6 && attempts < 10000) {
      const conflict = nextGroupPasteCandidate(asset, targets, candidate);
      if (conflict == null) return snap(candidate, asset.frame_rate);
      candidate = snap(Math.max(candidate + frame, conflict), asset.frame_rate);
      attempts += 1;
    }
    return null;
  };
  return search(requested, maximum) ?? (requested > 0 ? search(0, Math.min(maximum, requested - frame)) : null);
}

function insertGroupItem(
  asset: TimelineAsset,
  target: GroupTarget,
  anchorTime: number,
): { item: TimelineSignal | TimelineActivationClip | TimelineAudioClip | TimelineAnimationClip | TimelineParticleClip | TimelineCameraClip } {
  const track = asset.tracks[target.targetTrack];
  if (track.type === 'signal' && target.entry.type === 'signal') {
    const item = { ...structuredClone(target.entry.item), time: snap(anchorTime + target.relativeStart, asset.frame_rate) };
    track.markers.push(item);
    return { item };
  }
  if (track.type === 'signal' || target.entry.type === 'signal' || track.type !== target.entry.type) {
    throw new Error('Timeline group paste target became incompatible.');
  }
  const item = {
    ...structuredClone(target.entry.item),
    start: snap(anchorTime + target.relativeStart, asset.frame_rate),
  };
  track.clips.push(item as never);
  return { item };
}

export function pasteSequencerClipboard(
  asset: TimelineAsset,
  preferredTrackIndex: number | null,
  requestedTime: number,
  clipboard: SequencerClipboard,
): SequencerClipboardPasteResult {
  if (clipboard.type !== 'group') {
    const pasted = pasteSequencerItem(asset, preferredTrackIndex, requestedTime, clipboard);
    if (!pasted.ok) return pasted;
    const selection = { track: pasted.trackIndex, marker: pasted.itemIndex };
    return { ok: true, asset: pasted.asset, selections: [selection], primary: selection };
  }
  if (clipboard.items.length === 0) return { ok: false, error: 'Copied Timeline group is empty.' };
  const targets = resolveSequencerGroupTargets(asset, clipboard, preferredTrackIndex);
  if (typeof targets === 'string') return { ok: false, error: targets };
  const collision = groupInternalCollision(targets);
  if (collision) return { ok: false, error: collision };
  const anchorTime = findSequencerGroupPlacement(asset, targets, requestedTime);
  if (anchorTime == null) return { ok: false, error: 'Timeline has no collision-free space for the copied group.' };
  const next = structuredClone(asset);
  const inserted = targets.map((target) => insertGroupItem(next, target, anchorTime));
  for (const track of next.tracks) {
    if (track.type === 'signal') track.markers.sort((left, right) => left.time - right.time);
    else track.clips.sort((left, right) => left.start - right.start);
  }
  const selections = targets.map((target, index) => {
    const track = next.tracks[target.targetTrack];
    const marker = track.type === 'signal'
      ? track.markers.indexOf(inserted[index].item as TimelineSignal)
      : track.clips.indexOf(inserted[index].item as never);
    return { track: target.targetTrack, marker };
  });
  return {
    ok: true,
    asset: next,
    selections,
    primary: selections[clipboard.primary] ?? selections[0],
  };
}
