import {
  assignTimelineTrackGroup,
  timelineAnimationClipLayoutIsValid,
  timelineGroupForTrack,
  timelineTrackIsLocked,
  type TimelineActivationClip,
  type TimelineAnimationClip,
  type TimelineAsset,
  type TimelineAudioClip,
  type TimelineCameraClip,
  type TimelineControlClip,
  type TimelineParticleClip,
  type TimelineSignal,
} from './timelineAsset.ts';

export type SequencerClipRange = { start: number; duration: number };
export type SequencerTrimEdge = 'start' | 'end';

export type SequencerClipboardItem =
  | { type: 'signal'; sourceTrackId: string; item: TimelineSignal }
  | { type: 'activation'; sourceTrackId: string; item: TimelineActivationClip }
  | { type: 'audio'; sourceTrackId: string; item: TimelineAudioClip }
  | { type: 'animation'; sourceTrackId: string; item: TimelineAnimationClip }
  | { type: 'particle'; sourceTrackId: string; item: TimelineParticleClip }
  | { type: 'camera'; sourceTrackId: string; item: TimelineCameraClip }
  | { type: 'control'; sourceTrackId: string; item: TimelineControlClip };

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

export type SequencerTrackDropTarget =
  | { kind: 'track'; trackId: string; edge: 'before' | 'after' }
  | { kind: 'group'; groupId: string }
  | { kind: 'root' };

export type SequencerTrackPlacementResult =
  | { ok: true; asset: TimelineAsset; trackIndex: number; changed: boolean }
  | { ok: false; error: string };

export type SequencerTracksPlacementResult =
  | { ok: true; asset: TimelineAsset; trackIndexes: number[]; changed: boolean }
  | { ok: false; error: string };

export type SequencerGroupDropTarget =
  | { kind: 'track'; trackId: string; edge: 'before' | 'after' }
  | { kind: 'group'; groupId: string; edge: 'before' | 'after' }
  | { kind: 'root' };

export type SequencerGroupPlacementResult =
  | { ok: true; asset: TimelineAsset; groupIndex: number; changed: boolean }
  | { ok: false; error: string };

export type SequencerItemSelection = { track: number; marker: number };
export type SequencerSelectionMode = 'single' | 'toggle' | 'range';
export type SequencerTrackHeaderSelectionMode = 'single' | 'toggle' | 'range' | 'add-range';
export type SequencerTrackHeaderSelectionResult = {
  trackIds: string[];
  primaryId: string | null;
  anchorId: string | null;
};

export function sequencerStructuralMoveDirection(
  key: string,
  altKey: boolean,
  modified: boolean,
): -1 | 1 | null {
  if (modified || !altKey) return null;
  if (key === 'ArrowUp') return -1;
  if (key === 'ArrowDown') return 1;
  return null;
}
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

export type SequencerTimeRange = {
  start: number;
  end: number;
};

export type SequencerPreviewRange = SequencerTimeRange;
export type SequencerPreviewRangeEdge = 'start' | 'end';
export type SequencerPreviewAdvance = {
  time: number;
  playing: boolean;
};

function growAnimationCrossfades(clips: TimelineAnimationClip[]): boolean {
  const ordered = [...clips].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    const overlap = previous.start + previous.duration - current.start;
    if (overlap > 0) current.blend_in = Math.min(current.duration, Math.max(current.blend_in, overlap));
  }
  return timelineAnimationClipLayoutIsValid(ordered);
}

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

export function selectSequencerTrackHeaders(
  orderedTrackIds: readonly string[],
  visibleTrackIds: readonly string[],
  currentTrackIds: readonly string[],
  clickedTrackId: string,
  anchorTrackId: string | null,
  mode: SequencerTrackHeaderSelectionMode,
): SequencerTrackHeaderSelectionResult {
  const ordered = [...new Set(orderedTrackIds)];
  if (!ordered.includes(clickedTrackId)) {
    return { trackIds: [], primaryId: null, anchorId: null };
  }
  const visible = [...new Set(visibleTrackIds)].filter((trackId) => ordered.includes(trackId));
  const current = new Set(currentTrackIds.filter((trackId) => ordered.includes(trackId)));
  const anchorIndex = anchorTrackId == null ? -1 : visible.indexOf(anchorTrackId);
  const clickedIndex = visible.indexOf(clickedTrackId);
  let selected: Set<string>;
  if ((mode === 'range' || mode === 'add-range') && anchorIndex >= 0 && clickedIndex >= 0) {
    const start = Math.min(anchorIndex, clickedIndex);
    const end = Math.max(anchorIndex, clickedIndex);
    const range = visible.slice(start, end + 1);
    selected = mode === 'add-range' ? new Set([...current, ...range]) : new Set(range);
  } else if (mode === 'toggle') {
    selected = current;
    if (selected.has(clickedTrackId)) selected.delete(clickedTrackId);
    else selected.add(clickedTrackId);
  } else {
    selected = new Set([clickedTrackId]);
  }
  const trackIds = ordered.filter((trackId) => selected.has(trackId));
  const primaryId = selected.has(clickedTrackId) ? clickedTrackId : trackIds.at(-1) ?? null;
  return {
    trackIds,
    primaryId,
    anchorId: (mode === 'range' || mode === 'add-range') && anchorIndex >= 0
      ? anchorTrackId
      : primaryId,
  };
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

export function expandSequencerRippleSelection(
  asset: TimelineAsset,
  selections: readonly SequencerItemSelection[],
): SequencerItemSelection[] {
  const starts = new Map<number, number>();
  for (const selection of selections) {
    if (!Number.isInteger(selection.track) || !Number.isInteger(selection.marker)) continue;
    const track = asset.tracks[selection.track];
    if (!track) continue;
    const item = track.type === 'signal'
      ? track.markers[selection.marker]
      : track.clips[selection.marker];
    if (!item) continue;
    const time = track.type === 'signal'
      ? (item as TimelineSignal).time
      : (item as SequencerClipRange).start;
    starts.set(selection.track, Math.min(starts.get(selection.track) ?? Number.POSITIVE_INFINITY, time));
  }
  const expanded: SequencerItemSelection[] = [];
  for (const [trackIndex, start] of starts) {
    const track = asset.tracks[trackIndex];
    const items = track.type === 'signal' ? track.markers : track.clips;
    items.forEach((item, marker) => {
      const time = track.type === 'signal'
        ? (item as TimelineSignal).time
        : (item as SequencerClipRange).start;
      if (time >= start - 1e-6) expanded.push({ track: trackIndex, marker });
    });
  }
  return expanded.sort((left, right) => left.track - right.track || left.marker - right.marker);
}

export function clampSequencerZoom(value: number): number {
  if (!Number.isFinite(value)) return SEQUENCER_MIN_ZOOM;
  return Math.max(SEQUENCER_MIN_ZOOM, Math.min(SEQUENCER_MAX_ZOOM, value));
}

export function sequencerZoomToSlider(value: number): number {
  const zoom = clampSequencerZoom(value);
  return Math.log(zoom / SEQUENCER_MIN_ZOOM)
    / Math.log(SEQUENCER_MAX_ZOOM / SEQUENCER_MIN_ZOOM) * 100;
}

export function sequencerSliderToZoom(value: number): number {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)) / 100;
  return clampSequencerZoom(
    SEQUENCER_MIN_ZOOM
      * Math.pow(SEQUENCER_MAX_ZOOM / SEQUENCER_MIN_ZOOM, normalized),
  );
}

export function sequencerSelectionTimeRange(
  asset: TimelineAsset,
  selections: readonly SequencerItemSelection[],
): SequencerTimeRange | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const selection of selections) {
    if (!Number.isInteger(selection.track) || !Number.isInteger(selection.marker)) continue;
    const track = asset.tracks[selection.track];
    if (!track) continue;
    if (track.type === 'signal') {
      const marker = track.markers[selection.marker];
      if (!marker) continue;
      start = Math.min(start, marker.time);
      end = Math.max(end, marker.time);
      continue;
    }
    const clip = track.clips[selection.marker];
    if (!clip) continue;
    start = Math.min(start, clip.start);
    end = Math.max(end, clip.start + clip.duration);
  }
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : null;
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

export function sequencerShiftWheelDelta(deltaX: number, deltaY: number): number {
  const horizontal = Number.isFinite(deltaX) ? deltaX : 0;
  const vertical = Number.isFinite(deltaY) ? deltaY : 0;
  return Math.abs(horizontal) > Math.abs(vertical) ? horizontal : vertical;
}

export function sequencerPanScrollLeft(
  startScrollLeft: number,
  startClientX: number,
  currentClientX: number,
  scrollWidth: number,
  clientWidth: number,
): number {
  const origin = Number.isFinite(startScrollLeft) ? Math.max(0, startScrollLeft) : 0;
  const start = Number.isFinite(startClientX) ? startClientX : 0;
  const current = Number.isFinite(currentClientX) ? currentClientX : start;
  const content = Number.isFinite(scrollWidth) ? Math.max(0, scrollWidth) : 0;
  const viewport = Number.isFinite(clientWidth) ? Math.max(0, clientWidth) : 0;
  return clamp(origin - (current - start), 0, Math.max(0, content - viewport));
}

export function sequencerRevealScrollLeft(
  currentScrollLeft: number,
  targetOffset: number,
  contentWidth: number,
  viewportWidth: number,
  requestedMargin = 12,
): number {
  const content = finitePositive(contentWidth, 1);
  const viewport = finitePositive(viewportWidth, content);
  const maximum = Math.max(0, content - viewport);
  const current = clamp(Number.isFinite(currentScrollLeft) ? currentScrollLeft : 0, 0, maximum);
  const target = clamp(Number.isFinite(targetOffset) ? targetOffset : 0, 0, content);
  const margin = clamp(Number.isFinite(requestedMargin) ? requestedMargin : 0, 0, viewport / 2);
  if (target < current + margin) return clamp(target - margin, 0, maximum);
  if (target > current + viewport - margin) return clamp(target - viewport + margin, 0, maximum);
  return current;
}

export function normalizeSequencerPreviewRange(
  range: SequencerPreviewRange,
  duration: number,
  frameRate: number,
): SequencerPreviewRange {
  const endLimit = finitePositive(duration, 1);
  const rate = finitePositive(frameRate, 60);
  const minimumLength = Math.min(endLimit, 1 / rate);
  const maximumStart = Math.max(0, Math.floor((endLimit - minimumLength) * rate + 1e-9) / rate);
  const start = clamp(snap(Number.isFinite(range.start) ? range.start : 0, rate), 0, maximumStart);
  const minimumEnd = Math.min(endLimit, start + minimumLength);
  const end = clamp(snap(Number.isFinite(range.end) ? range.end : endLimit, rate), minimumEnd, endLimit);
  return { start, end };
}

export function resizeSequencerPreviewRange(
  range: SequencerPreviewRange,
  edge: SequencerPreviewRangeEdge,
  requestedTime: number,
  duration: number,
  frameRate: number,
): SequencerPreviewRange {
  const endLimit = finitePositive(duration, 1);
  const rate = finitePositive(frameRate, 60);
  const minimumLength = Math.min(endLimit, 1 / rate);
  const normalized = normalizeSequencerPreviewRange(range, endLimit, rate);
  const fallback = edge === 'start' ? normalized.start : normalized.end;
  const requested = Number.isFinite(requestedTime) ? requestedTime : fallback;
  if (edge === 'start') {
    const lastFrameBeforeEnd = Math.floor((normalized.end - minimumLength) * rate + 1e-9) / rate;
    const maximumStart = Math.max(0, Number(lastFrameBeforeEnd.toFixed(9)));
    return {
      start: clamp(snap(requested, rate), 0, maximumStart),
      end: normalized.end,
    };
  }
  const minimumEnd = Math.min(endLimit, snap(normalized.start + minimumLength, rate));
  return {
    start: normalized.start,
    end: clamp(snap(requested, rate), minimumEnd, endLimit),
  };
}

export function advanceSequencerPreviewTime(
  currentTime: number,
  deltaSeconds: number,
  range: SequencerPreviewRange,
  loop: boolean,
): SequencerPreviewAdvance {
  const start = Number.isFinite(range.start) ? Math.max(0, range.start) : 0;
  const end = Number.isFinite(range.end) ? Math.max(start, range.end) : start;
  const duration = end - start;
  if (duration <= 0) return { time: start, playing: false };
  const current = Number.isFinite(currentTime) ? clamp(currentTime, start, end) : start;
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const next = current + delta;
  if (next < end) return { time: next, playing: true };
  if (!loop) return { time: end, playing: false };
  return { time: start + ((next - start) % duration), playing: true };
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

export function trimSequencerAnimationClip(
  clips: readonly TimelineAnimationClip[],
  index: number,
  edge: SequencerTrimEdge,
  delta: number,
  timelineDuration: number,
  frameRate: number,
): (SequencerClipRange & { sourceOffsetDelta: number; blendIn: number }) {
  const clip = clips[index];
  if (!clip) return { start: 0, duration: 0, sourceOffsetDelta: 0, blendIn: 0 };
  const frame = 1 / finitePositive(frameRate, 60);
  const timelineEnd = finitePositive(timelineDuration, clip.start + clip.duration);
  const clipEnd = clip.start + clip.duration;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  if (edge === 'start') {
    const previous = clips[index - 1];
    const twoBefore = clips[index - 2];
    const next = clips[index + 1];
    const minimum = Math.max(
      0,
      previous ? previous.start + frame : 0,
      twoBefore ? twoBefore.start + twoBefore.duration : 0,
      clip.speed > 0 ? clip.start - clip.clip_in / clip.speed : 0,
      clip.speed < 0 ? Number.NEGATIVE_INFINITY : 0,
    );
    const maximum = Math.min(
      clipEnd - frame,
      next ? next.start - frame : Number.POSITIVE_INFINITY,
      clip.speed < 0 ? clip.start - clip.clip_in / clip.speed : Number.POSITIVE_INFINITY,
    );
    const start = clamp(snap(clip.start + safeDelta, frameRate), minimum, maximum);
    const duration = clipEnd - start;
    return {
      start,
      duration,
      sourceOffsetDelta: start - clip.start,
      blendIn: clamp(clip.blend_in - (start - clip.start), 0, duration),
    };
  }
  const next = clips[index + 1];
  const twoAfter = clips[index + 2];
  const previous = clips[index - 1];
  const maximum = Math.min(
    timelineEnd,
    next ? next.start + next.blend_in : Number.POSITIVE_INFINITY,
    twoAfter ? twoAfter.start : Number.POSITIVE_INFINITY,
  );
  const minimum = Math.max(
    clip.start + frame,
    previous ? previous.start + previous.duration : clip.start + frame,
  );
  const end = clamp(snap(clipEnd + safeDelta, frameRate), minimum, maximum);
  return {
    start: clip.start,
    duration: end - clip.start,
    sourceOffsetDelta: 0,
    blendIn: Math.min(clip.blend_in, end - clip.start),
  };
}

export function resizeSequencerAnimationBlend(
  clips: readonly TimelineAnimationClip[],
  index: number,
  requestedBlendIn: number,
  frameRate: number,
): number {
  const clip = clips[index];
  if (!clip) return 0;
  const previous = clips[index - 1];
  const required = previous
    ? Math.max(0, previous.start + previous.duration - clip.start)
    : 0;
  const requested = Number.isFinite(requestedBlendIn) ? requestedBlendIn : clip.blend_in;
  return clamp(snap(requested, frameRate), required, clip.duration);
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
    if (!timelineTrackIsLocked(asset, track)) continue;
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
  if (timelineTrackIsLocked(asset, track)) return { ok: false, error: `Track '${track.name}' is locked. Unlock it before reordering.` };
  const nextIndex = trackIndex + direction;
  if (nextIndex < 0 || nextIndex >= asset.tracks.length) {
    return { ok: false, error: `Track '${track.name}' is already at the ${direction < 0 ? 'top' : 'bottom'}.` };
  }
  const placed = placeSequencerTracks(asset, [track.id], {
    kind: 'track',
    trackId: asset.tracks[nextIndex].id,
    edge: direction < 0 ? 'before' : 'after',
  });
  return placed.ok
    ? { ok: true, asset: placed.asset, trackIndex: placed.trackIndexes[0] }
    : placed;
}

export function placeSequencerTracks(
  asset: TimelineAsset,
  trackIds: readonly string[],
  target: SequencerTrackDropTarget,
): SequencerTracksPlacementResult {
  const requestedIds = new Set(trackIds);
  if (requestedIds.size === 0) return { ok: false, error: 'No Timeline tracks are selected.' };
  const movedTracks = asset.tracks.filter((track) => requestedIds.has(track.id));
  if (movedTracks.length !== requestedIds.size) {
    return { ok: false, error: 'A selected Timeline track no longer exists.' };
  }
  for (const track of movedTracks) {
    if (timelineTrackIsLocked(asset, track)) {
      return { ok: false, error: `Track '${track.name}' is locked. Unlock it before moving.` };
    }
  }

  let destinationGroupId: string | null = null;
  if (target.kind === 'track') {
    if (requestedIds.has(target.trackId)) {
      return {
        ok: true,
        asset: structuredClone(asset),
        trackIndexes: movedTracks.map((track) => asset.tracks.findIndex((candidate) => candidate.id === track.id)),
        changed: false,
      };
    }
    const targetTrack = asset.tracks.find((track) => track.id === target.trackId);
    if (!targetTrack) return { ok: false, error: 'Timeline drop target no longer exists.' };
    destinationGroupId = timelineGroupForTrack(asset, targetTrack.id)?.id ?? null;
  } else if (target.kind === 'group') {
    const group = asset.groups.find((candidate) => candidate.id === target.groupId);
    if (!group) return { ok: false, error: 'Timeline drop group no longer exists.' };
    destinationGroupId = group.id;
  }

  const destinationGroup = destinationGroupId == null
    ? null
    : asset.groups.find((group) => group.id === destinationGroupId) ?? null;
  if (
    destinationGroup
    && movedTracks.every((track) => timelineGroupForTrack(asset, track.id)?.id === destinationGroup.id)
    && destinationGroup.track_ids.every((trackId) => requestedIds.has(trackId))
  ) {
    return {
      ok: true,
      asset: structuredClone(asset),
      trackIndexes: movedTracks.map((track) => asset.tracks.findIndex((candidate) => candidate.id === track.id)),
      changed: false,
    };
  }
  if (destinationGroup?.locked) {
    return { ok: false, error: `Timeline group '${destinationGroup.name}' is locked.` };
  }

  const next = structuredClone(asset);
  const remainingTracks = next.tracks.filter((track) => !requestedIds.has(track.id));
  let insertionIndex = remainingTracks.length;
  if (target.kind === 'track') {
    const targetIndex = remainingTracks.findIndex((track) => track.id === target.trackId);
    if (targetIndex < 0) return { ok: false, error: 'Timeline drop target no longer exists.' };
    insertionIndex = targetIndex + (target.edge === 'after' ? 1 : 0);
  } else if (target.kind === 'group') {
    const memberIds = new Set(
      next.groups.find((group) => group.id === target.groupId)?.track_ids ?? [],
    );
    for (let index = 0; index < remainingTracks.length; index += 1) {
      if (memberIds.has(remainingTracks[index].id)) insertionIndex = index + 1;
    }
  }
  remainingTracks.splice(insertionIndex, 0, ...movedTracks);
  next.tracks = remainingTracks;

  try {
    for (const moved of movedTracks) {
      next.groups = assignTimelineTrackGroup(next.groups, moved.id, destinationGroupId);
    }
  } catch (reason) {
    return { ok: false, error: reason instanceof Error ? reason.message : String(reason) };
  }
  const rank = new Map(next.tracks.map((track, index) => [track.id, index]));
  next.groups = next.groups.map((group) => ({
    ...group,
    track_ids: [...new Set(group.track_ids)]
      .filter((id) => rank.has(id))
      .sort((left, right) => rank.get(left)! - rank.get(right)!),
  }));
  return {
    ok: true,
    asset: next,
    trackIndexes: movedTracks.map((track) => next.tracks.findIndex((candidate) => candidate.id === track.id)),
    changed: JSON.stringify(next) !== JSON.stringify(asset),
  };
}

export function placeSequencerTrack(
  asset: TimelineAsset,
  trackId: string,
  target: SequencerTrackDropTarget,
): SequencerTrackPlacementResult {
  const placed = placeSequencerTracks(asset, [trackId], target);
  return placed.ok
    ? { ok: true, asset: placed.asset, trackIndex: placed.trackIndexes[0], changed: placed.changed }
    : placed;
}

export function moveSequencerTracks(
  asset: TimelineAsset,
  trackIds: readonly string[],
  direction: -1 | 1,
): SequencerTracksPlacementResult {
  const selectedIds = new Set(trackIds);
  if (selectedIds.size === 0) return { ok: false, error: 'No Timeline tracks are selected.' };
  const selectedIndexes = asset.tracks
    .map((track, index) => selectedIds.has(track.id) ? index : -1)
    .filter((index) => index >= 0);
  if (selectedIndexes.length !== selectedIds.size) {
    return { ok: false, error: 'A selected Timeline track no longer exists.' };
  }
  const boundary = direction < 0 ? Math.min(...selectedIndexes) : Math.max(...selectedIndexes);
  let targetIndex = boundary + direction;
  while (targetIndex >= 0 && targetIndex < asset.tracks.length && selectedIds.has(asset.tracks[targetIndex].id)) {
    targetIndex += direction;
  }
  const targetTrack = asset.tracks[targetIndex];
  if (!targetTrack) {
    return { ok: false, error: `Selected Timeline tracks are already at the ${direction < 0 ? 'top' : 'bottom'}.` };
  }
  return placeSequencerTracks(asset, trackIds, {
    kind: 'track',
    trackId: targetTrack.id,
    edge: direction < 0 ? 'before' : 'after',
  });
}

function sequencerGroupBlocks(asset: TimelineAsset): Array<
  { kind: 'group'; groupId: string } | { kind: 'track'; trackId: string }
> {
  const emittedGroups = new Set<string>();
  const blocks: Array<{ kind: 'group'; groupId: string } | { kind: 'track'; trackId: string }> = [];
  for (const track of asset.tracks) {
    const group = timelineGroupForTrack(asset, track.id);
    if (!group) {
      blocks.push({ kind: 'track', trackId: track.id });
    } else if (!emittedGroups.has(group.id)) {
      emittedGroups.add(group.id);
      blocks.push({ kind: 'group', groupId: group.id });
    }
  }
  for (const group of asset.groups) {
    if (!emittedGroups.has(group.id)) blocks.push({ kind: 'group', groupId: group.id });
  }
  return blocks;
}

export function placeSequencerGroup(
  asset: TimelineAsset,
  groupId: string,
  target: SequencerGroupDropTarget,
): SequencerGroupPlacementResult {
  const sourceGroupIndex = asset.groups.findIndex((group) => group.id === groupId);
  const sourceGroup = asset.groups[sourceGroupIndex];
  if (!sourceGroup) return { ok: false, error: 'Timeline group no longer exists.' };
  if (sourceGroup.locked) {
    return { ok: false, error: `Timeline group '${sourceGroup.name}' is locked.` };
  }

  let targetGroupId: string | null = null;
  let targetTrackId: string | null = null;
  let targetEdge: 'before' | 'after' = 'after';
  if (target.kind === 'group') {
    if (target.groupId === groupId) {
      return { ok: true, asset: structuredClone(asset), groupIndex: sourceGroupIndex, changed: false };
    }
    if (!asset.groups.some((group) => group.id === target.groupId)) {
      return { ok: false, error: 'Timeline drop group no longer exists.' };
    }
    targetGroupId = target.groupId;
    targetEdge = target.edge;
  } else if (target.kind === 'track') {
    const targetTrack = asset.tracks.find((track) => track.id === target.trackId);
    if (!targetTrack) return { ok: false, error: 'Timeline drop target no longer exists.' };
    const owner = timelineGroupForTrack(asset, targetTrack.id);
    if (owner?.id === groupId) {
      return { ok: true, asset: structuredClone(asset), groupIndex: sourceGroupIndex, changed: false };
    }
    if (owner) targetGroupId = owner.id;
    else targetTrackId = targetTrack.id;
    targetEdge = target.edge;
  }

  const sourceMemberIds = new Set(sourceGroup.track_ids);
  const movedTracks = asset.tracks.filter((track) => sourceMemberIds.has(track.id));
  const targetGroup = targetGroupId == null
    ? null
    : asset.groups.find((group) => group.id === targetGroupId) ?? null;
  const targetMemberCount = targetGroup
    ? asset.tracks.filter((track) => targetGroup.track_ids.includes(track.id)).length
    : 0;
  if (movedTracks.length === 0 && target.kind !== 'root' && (!targetGroup || targetMemberCount > 0)) {
    return { ok: false, error: 'An empty Timeline group can only be reordered with another empty group.' };
  }
  if (movedTracks.length > 0 && targetGroup && targetMemberCount === 0 && targetEdge === 'after') {
    return { ok: false, error: 'A group containing tracks cannot be placed after an empty Timeline group.' };
  }

  const next = structuredClone(asset);
  const movingIds = new Set(movedTracks.map((track) => track.id));
  const remainingTracks = next.tracks.filter((track) => !movingIds.has(track.id));
  let insertionIndex = remainingTracks.length;
  if (targetTrackId) {
    const index = remainingTracks.findIndex((track) => track.id === targetTrackId);
    if (index < 0) return { ok: false, error: 'Timeline drop target no longer exists.' };
    insertionIndex = index + (targetEdge === 'after' ? 1 : 0);
  } else if (targetGroup) {
    const targetIds = new Set(targetGroup.track_ids);
    const indexes = remainingTracks
      .map((track, index) => targetIds.has(track.id) ? index : -1)
      .filter((index) => index >= 0);
    if (indexes.length > 0) {
      insertionIndex = targetEdge === 'before'
        ? Math.min(...indexes)
        : Math.max(...indexes) + 1;
    }
  }
  remainingTracks.splice(insertionIndex, 0, ...movedTracks);
  next.tracks = remainingTracks;

  const [movedGroup] = next.groups.splice(sourceGroupIndex, 1);
  let groupIndex = Math.min(sourceGroupIndex, next.groups.length);
  if (target.kind === 'root') {
    groupIndex = next.groups.length;
  } else if (targetGroupId) {
    const index = next.groups.findIndex((group) => group.id === targetGroupId);
    if (index < 0) return { ok: false, error: 'Timeline drop group no longer exists.' };
    groupIndex = index + (targetEdge === 'after' ? 1 : 0);
  }
  next.groups.splice(groupIndex, 0, movedGroup);

  const rank = new Map(next.tracks.map((track, index) => [track.id, index]));
  next.groups = next.groups.map((group) => ({
    ...group,
    track_ids: [...new Set(group.track_ids)]
      .filter((id) => rank.has(id))
      .sort((left, right) => rank.get(left)! - rank.get(right)!),
  }));
  const ownerByTrackId = new Map<string, string>();
  for (const group of next.groups) {
    for (const trackId of group.track_ids) ownerByTrackId.set(trackId, group.id);
  }
  const orderedNonEmptyGroupIds: string[] = [];
  const emittedGroupIds = new Set<string>();
  for (const track of next.tracks) {
    const ownerId = ownerByTrackId.get(track.id);
    if (ownerId && !emittedGroupIds.has(ownerId)) {
      emittedGroupIds.add(ownerId);
      orderedNonEmptyGroupIds.push(ownerId);
    }
  }
  const groupById = new Map(next.groups.map((group) => [group.id, group]));
  next.groups = [
    ...orderedNonEmptyGroupIds.map((id) => groupById.get(id)!),
    ...next.groups.filter((group) => !emittedGroupIds.has(group.id)),
  ];
  groupIndex = next.groups.findIndex((group) => group.id === groupId);
  return {
    ok: true,
    asset: next,
    groupIndex,
    changed: JSON.stringify(next) !== JSON.stringify(asset),
  };
}

export function moveSequencerGroup(
  asset: TimelineAsset,
  groupId: string,
  direction: -1 | 1,
): SequencerGroupPlacementResult {
  const source = asset.groups.find((group) => group.id === groupId);
  if (!source) return { ok: false, error: 'Timeline group no longer exists.' };
  if (source.locked) return { ok: false, error: `Timeline group '${source.name}' is locked.` };
  const blocks = sequencerGroupBlocks(asset);
  const sourceIndex = blocks.findIndex((block) => block.kind === 'group' && block.groupId === groupId);
  const target = blocks[sourceIndex + direction];
  if (sourceIndex < 0 || !target) {
    return { ok: false, error: `Timeline group '${source.name}' is already at the ${direction < 0 ? 'top' : 'bottom'}.` };
  }
  return placeSequencerGroup(asset, groupId, target.kind === 'group'
    ? { kind: 'group', groupId: target.groupId, edge: direction < 0 ? 'before' : 'after' }
    : { kind: 'track', trackId: target.trackId, edge: direction < 0 ? 'before' : 'after' });
}

export function deleteSequencerTracks(
  asset: TimelineAsset,
  trackIds: readonly string[],
): SequencerDeleteResult {
  const selectedIds = new Set(trackIds);
  if (selectedIds.size === 0) return { ok: false, error: 'No Timeline tracks are selected.' };
  const tracks = asset.tracks.filter((track) => selectedIds.has(track.id));
  if (tracks.length !== selectedIds.size) {
    return { ok: false, error: 'A selected Timeline track no longer exists.' };
  }
  for (const track of tracks) {
    if (timelineTrackIsLocked(asset, track)) {
      return { ok: false, error: `Track '${track.name}' is locked. Unlock it before deleting.` };
    }
  }
  const next = structuredClone(asset);
  next.tracks = next.tracks.filter((track) => !selectedIds.has(track.id));
  next.groups = next.groups.map((group) => ({
    ...group,
    track_ids: group.track_ids.filter((trackId) => !selectedIds.has(trackId)),
  }));
  return { ok: true, asset: next };
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
    if (timelineTrackIsLocked(asset, track)) return { ok: false, error: `Track '${track.name}' is locked. Unlock it before deleting.` };
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
    if (timelineTrackIsLocked(asset, track)) return { ok: false, error: `Track '${track.name}' is locked. Unlock it before moving.` };
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
    if (track.type === 'animation' && !timelineAnimationClipLayoutIsValid(track.clips)) {
      return { ok: false, error: `Track '${track.name}' already contains an invalid animation crossfade.` };
    }
    const frame = 1 / finitePositive(asset.frame_rate, 60);
    for (const selectedIndex of selected) {
      const clip = track.clips[selectedIndex];
      const clipEnd = clip.start + clip.duration;
      for (let otherIndex = 0; otherIndex < track.clips.length; otherIndex += 1) {
        if (selected.has(otherIndex)) continue;
        const other = track.clips[otherIndex];
        const otherEnd = other.start + other.duration;
        if (other.start < clip.start - 1e-6) {
          const allowedOverlap = track.type === 'animation' ? clip.duration : 0;
          minimumDelta = Math.max(
            minimumDelta,
            otherEnd - clip.start - allowedOverlap,
            other.start + frame - clip.start,
          );
        } else if (other.start > clip.start + 1e-6) {
          const allowedOverlap = track.type === 'animation' ? other.duration : 0;
          maximumDelta = Math.min(
            maximumDelta,
            other.start + allowedOverlap - clipEnd,
            other.start - frame - clip.start,
          );
        } else {
          return { ok: false, error: `Track '${track.name}' already contains overlapping clips.` };
        }
      }
    }
  }
  const safeDelta = Number.isFinite(requestedDelta) ? requestedDelta : 0;
  let delta = snap(clamp(safeDelta, minimumDelta, maximumDelta), asset.frame_rate);
  const animationMoveIsValid = (candidate: number) => {
    for (const [trackIndex, selected] of selectedByTrack) {
      const track = asset.tracks[trackIndex];
      if (track.type !== 'animation') continue;
      const clips = track.clips.map((clip, index) => (
        selected.has(index) ? { ...clip, start: clip.start + candidate } : clip
      ));
      if (!growAnimationCrossfades(clips)) return false;
    }
    return true;
  };
  if (!animationMoveIsValid(delta)) {
    let valid = 0;
    let invalid = delta;
    for (let iteration = 0; iteration < 48; iteration += 1) {
      const middle = (valid + invalid) / 2;
      if (animationMoveIsValid(middle)) valid = middle;
      else invalid = middle;
    }
    const frame = 1 / finitePositive(asset.frame_rate, 60);
    delta = snap(valid, asset.frame_rate);
    if (!animationMoveIsValid(delta)) delta = snap(delta + (delta > 0 ? -frame : frame), asset.frame_rate);
    if (!animationMoveIsValid(delta)) delta = 0;
  }
  const next = structuredClone(asset);
  for (const selection of unique.values()) {
    const track = next.tracks[selection.track];
    if (track.type === 'signal') track.markers[selection.marker].time = snap(track.markers[selection.marker].time + delta, next.frame_rate);
    else track.clips[selection.marker].start = snap(track.clips[selection.marker].start + delta, next.frame_rate);
  }
  for (const trackIndex of selectedByTrack.keys()) {
    const track = next.tracks[trackIndex];
    if (track.type === 'animation' && !growAnimationCrossfades(track.clips)) {
      return { ok: false, error: `Track '${track.name}' cannot form a valid two-clip crossfade at that position.` };
    }
  }
  return { ok: true, asset: next, delta };
}

/**
 * Moves the selected item and every item at or after it on each affected track.
 * Positive deltas insert time and extend the Timeline when necessary; negative
 * deltas close time but stop at the previous unshifted clip boundary.
 */
export function rippleMoveSequencerItems(
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

  const selectedByTrack = new Map<number, number[]>();
  for (const selection of unique.values()) {
    const track = asset.tracks[selection.track];
    if (!track) return { ok: false, error: 'A selected Timeline track no longer exists.' };
    if (timelineTrackIsLocked(asset, track)) {
      return { ok: false, error: `Track '${track.name}' is locked. Unlock it before ripple moving.` };
    }
    const count = track.type === 'signal' ? track.markers.length : track.clips.length;
    if (selection.marker < 0 || selection.marker >= count) {
      return { ok: false, error: `A selected item on track '${track.name}' no longer exists.` };
    }
    const indexes = selectedByTrack.get(selection.track) ?? [];
    indexes.push(selection.marker);
    selectedByTrack.set(selection.track, indexes);
  }

  let minimumDelta = Number.NEGATIVE_INFINITY;
  const rippleStarts = new Map<number, number>();
  for (const [trackIndex, selectedIndexes] of selectedByTrack) {
    const track = asset.tracks[trackIndex];
    const rippleStart = track.type === 'signal'
      ? Math.min(...selectedIndexes.map((index) => track.markers[index].time))
      : Math.min(...selectedIndexes.map((index) => track.clips[index].start));
    rippleStarts.set(trackIndex, rippleStart);
    minimumDelta = Math.max(minimumDelta, -rippleStart);
    if (track.type === 'signal') continue;
    const ordered = [...track.clips].sort((left, right) => left.start - right.start);
    const firstShifted = ordered.findIndex((clip) => clip.start >= rippleStart - 1e-6);
    const previous = firstShifted > 0 ? ordered[firstShifted - 1] : null;
    const twoBefore = firstShifted > 1 ? ordered[firstShifted - 2] : null;
    const incoming = firstShifted >= 0 ? ordered[firstShifted] : null;
    const previousEnd = previous ? previous.start + previous.duration : 0;
    if (track.type !== 'animation' && previousEnd > rippleStart + 1e-6) {
      return { ok: false, error: `Track '${track.name}' already contains overlapping clips.` };
    }
    if (track.type === 'animation' && incoming) {
      const frame = 1 / finitePositive(asset.frame_rate, 60);
      minimumDelta = Math.max(
        minimumDelta,
        previous
          ? previousEnd - rippleStart - incoming.duration
          : -rippleStart,
        previous ? previous.start + frame - rippleStart : -rippleStart,
        twoBefore ? twoBefore.start + twoBefore.duration - rippleStart : -rippleStart,
      );
    } else {
      minimumDelta = Math.max(minimumDelta, previousEnd - rippleStart);
    }
  }

  const safeDelta = Number.isFinite(requestedDelta) ? requestedDelta : 0;
  const delta = snap(Math.max(safeDelta, minimumDelta), asset.frame_rate);
  const next = structuredClone(asset);
  let contentEnd = next.duration;
  for (const [trackIndex, rippleStart] of rippleStarts) {
    const track = next.tracks[trackIndex];
    if (track.type === 'signal') {
      for (const marker of track.markers) {
        if (marker.time >= rippleStart - 1e-6) marker.time = snap(marker.time + delta, next.frame_rate);
        contentEnd = Math.max(contentEnd, marker.time);
      }
      continue;
    }
    for (const clip of track.clips) {
      if (clip.start >= rippleStart - 1e-6) clip.start = snap(clip.start + delta, next.frame_rate);
      contentEnd = Math.max(contentEnd, clip.start + clip.duration);
    }
    if (track.type === 'animation' && !growAnimationCrossfades(track.clips)) {
      return { ok: false, error: `Track '${track.name}' cannot form a valid two-clip crossfade at that position.` };
    }
  }
  next.duration = Math.max(next.duration, contentEnd);
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
  if (track.type === 'control') {
    const item = track.clips[itemIndex];
    if (!item) return null;
    return { type: 'control', sourceTrackId: track.id, item: structuredClone(item) };
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
  if (preferred?.type === clipboard.type && !timelineTrackIsLocked(asset, preferred)) return preferredTrackIndex!;
  const source = asset.tracks.findIndex(
    (track) => track.id === clipboard.sourceTrackId && track.type === clipboard.type && !timelineTrackIsLocked(asset, track),
  );
  if (source >= 0) return source;
  return asset.tracks.findIndex((track) => track.type === clipboard.type && !timelineTrackIsLocked(asset, track));
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
  if (track.type !== clipboard.type || timelineTrackIsLocked(next, track)) return { ok: false, error: 'Timeline paste target is no longer editable.' };
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
  if (track.type === 'control' && clipboard.type === 'control') {
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
      !usedTargets.has(index) && track.id === sourceTrackId && track.type === source.type && !timelineTrackIsLocked(asset, track)
    ));
    if (exact >= 0) {
      targetBySource.set(sourceTrackId, exact);
      usedTargets.add(exact);
    }
  }
  const primaryItem = clipboard.items[clipboard.primary] ?? clipboard.items[0];
  if (primaryItem && !targetBySource.has(primaryItem.sourceTrackId) && preferredTrackIndex != null) {
    const preferred = asset.tracks[preferredTrackIndex];
    if (preferred && preferred.type === primaryItem.type && !timelineTrackIsLocked(asset, preferred) && !usedTargets.has(preferredTrackIndex)) {
      targetBySource.set(primaryItem.sourceTrackId, preferredTrackIndex);
      usedTargets.add(preferredTrackIndex);
    }
  }
  for (const [sourceTrackId, source] of sourceGroups) {
    if (targetBySource.has(sourceTrackId)) continue;
    const fallback = asset.tracks.findIndex((track, index) => (
      !usedTargets.has(index) && track.type === source.type && !timelineTrackIsLocked(asset, track)
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
  for (const trackIndex of new Set(targets.map((target) => target.targetTrack))) {
    const animationClips: TimelineAnimationClip[] = [];
    for (const target of targets) {
      if (target.targetTrack === trackIndex && target.entry.type === 'animation') {
        animationClips.push({ ...target.entry.item, start: target.relativeStart });
      }
    }
    if (animationClips.length > 0 && !timelineAnimationClipLayoutIsValid(animationClips)) {
      return 'Copied Animation clips contain an invalid crossfade after their source tracks are mapped to the paste target.';
    }
  }
  for (let left = 0; left < targets.length; left += 1) {
    const first = targets[left];
    if (first.entry.type === 'signal' || first.entry.type === 'animation') continue;
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
  const checkedAnimationTracks = new Set<number>();
  for (const target of targets) {
    if (target.entry.type === 'signal') continue;
    const plannedStart = candidate + target.relativeStart;
    const plannedEnd = plannedStart + target.entry.item.duration;
    const track = asset.tracks[target.targetTrack];
    if (track.type === 'signal') return null;
    if (target.entry.type === 'animation' && track.type === 'animation') {
      if (checkedAnimationTracks.has(target.targetTrack)) continue;
      checkedAnimationTracks.add(target.targetTrack);
      const planned = targets.flatMap((entry) => (
        entry.targetTrack === target.targetTrack && entry.entry.type === 'animation'
          ? [{ ...entry.entry.item, start: candidate + entry.relativeStart }]
          : []
      ));
      if (timelineAnimationClipLayoutIsValid([...track.clips, ...planned])) continue;
      for (const item of targets) {
        if (item.targetTrack !== target.targetTrack || item.entry.type !== 'animation') continue;
        const start = candidate + item.relativeStart;
        const end = start + item.entry.item.duration;
        for (const existing of track.clips) {
          const existingEnd = existing.start + existing.duration;
          if (start < existingEnd - 1e-6 && end > existing.start + 1e-6) {
            collided = true;
            next = Math.max(next, existingEnd - item.relativeStart);
          }
        }
      }
      continue;
    }
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
): { item: TimelineSignal | TimelineActivationClip | TimelineAudioClip | TimelineAnimationClip | TimelineParticleClip | TimelineCameraClip | TimelineControlClip } {
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
