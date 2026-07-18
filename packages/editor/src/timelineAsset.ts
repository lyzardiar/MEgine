export type TimelineSignal = {
  time: number;
  name: string;
  payload?: unknown;
};

export type TimelineActivationClip = {
  start: number;
  duration: number;
  active: boolean;
};

export type TimelineAudioClip = {
  start: number;
  duration: number;
  clip: string;
  clip_in: number;
  volume: number;
  pitch: number;
  looped: boolean;
};

export type TimelineAnimationClip = {
  start: number;
  duration: number;
  clip: string;
  clip_in: number;
  speed: number;
};

export type TimelineSignalTrack = {
  type: 'signal';
  id: string;
  name: string;
  muted: boolean;
  locked: boolean;
  markers: TimelineSignal[];
};

export type TimelineActivationTrack = {
  type: 'activation';
  id: string;
  name: string;
  muted: boolean;
  locked: boolean;
  target: string;
  clips: TimelineActivationClip[];
};

export type TimelineAudioTrack = {
  type: 'audio';
  id: string;
  name: string;
  muted: boolean;
  locked: boolean;
  target: string;
  clips: TimelineAudioClip[];
};

export type TimelineAnimationTrack = {
  type: 'animation';
  id: string;
  name: string;
  muted: boolean;
  locked: boolean;
  target: string;
  clips: TimelineAnimationClip[];
};

export type TimelineTrack = TimelineSignalTrack | TimelineActivationTrack | TimelineAudioTrack | TimelineAnimationTrack;

export type TimelineAsset = {
  version: 1;
  name: string;
  duration: number;
  frame_rate: number;
  tracks: TimelineTrack[];
};

function object(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finite(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function activationTarget(value: unknown): string {
  return String(value ?? '').trim().replaceAll('\\', '/');
}

function audioAssetPath(value: unknown): string {
  const normalized = String(value ?? '').trim().replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (segments[0]?.toLowerCase() === 'assets') segments[0] = 'Assets';
  return segments.join('/');
}

function audioAssetIsPortable(path: string): boolean {
  return path.toLowerCase().startsWith('assets/')
    && targetIsPortable(path)
    && /\.(?:wav|ogg|mp3|flac)$/i.test(path);
}

function animationAssetIsPortable(path: string): boolean {
  return path.toLowerCase().startsWith('assets/')
    && targetIsPortable(path)
    && /\.manim$/i.test(path);
}

function trackLabel(type: TimelineTrack['type']): string {
  return type === 'signal' ? 'Signal' : type === 'activation' ? 'Activation' : type === 'audio' ? 'Audio' : 'Animation';
}

function targetIsPortable(target: string): boolean {
  return target.length > 0
    && !target.startsWith('/')
    && target.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function createTimelineAsset(name = 'New Timeline'): TimelineAsset {
  return {
    version: 1,
    name: name.trim() || 'New Timeline',
    duration: 5,
    frame_rate: 60,
    tracks: [{
      type: 'signal',
      id: 'signals',
      name: 'Signals',
      muted: false,
      locked: false,
      markers: [],
    }],
  };
}

export function normalizeTimelineAsset(value: unknown): TimelineAsset {
  const raw = object(value);
  const duration = Math.max(0.001, finite(raw.duration, 5));
  const usedIds = new Set<string>();
  const tracks: TimelineTrack[] = [];
  for (const [index, candidate] of (Array.isArray(raw.tracks) ? raw.tracks : []).entries()) {
    const track = object(candidate);
    const type = String(track.type ?? 'signal');
    if (type !== 'signal' && type !== 'activation' && type !== 'audio' && type !== 'animation') continue;
    const baseId = String(track.id ?? `${type}-${index + 1}`).trim() || `${type}-${index + 1}`;
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) id = `${baseId}-${++suffix}`;
    usedIds.add(id);
    const name = String(track.name ?? '').trim()
      || `${trackLabel(type)} Track ${index + 1}`;
    if (type === 'signal') {
      const markers = (Array.isArray(track.markers) ? track.markers : [])
        .map((markerValue) => {
          const marker = object(markerValue);
          return {
            time: Math.max(0, Math.min(duration, finite(marker.time, 0))),
            name: String(marker.name ?? '').trim(),
            ...(Object.hasOwn(marker, 'payload') ? { payload: structuredClone(marker.payload) } : {}),
          } satisfies TimelineSignal;
        })
        .sort((left, right) => left.time - right.time || left.name.localeCompare(right.name));
      tracks.push({ type, id, name, muted: Boolean(track.muted), locked: Boolean(track.locked), markers });
    } else if (type === 'activation') {
      const clips = (Array.isArray(track.clips) ? track.clips : [])
        .map((clipValue) => {
          const clip = object(clipValue);
          const start = Math.max(0, Math.min(duration, finite(clip.start, 0)));
          return {
            start,
            duration: Math.max(0.001, Math.min(duration - start, finite(clip.duration, 1))),
            active: clip.active !== false,
          } satisfies TimelineActivationClip;
        })
        .sort((left, right) => left.start - right.start);
      tracks.push({
        type,
        id,
        name,
        muted: Boolean(track.muted),
        locked: Boolean(track.locked),
        target: activationTarget(track.target),
        clips,
      });
    } else if (type === 'audio') {
      const clips = (Array.isArray(track.clips) ? track.clips : [])
        .map((clipValue) => {
          const clip = object(clipValue);
          const start = Math.max(0, Math.min(duration, finite(clip.start, 0)));
          return {
            start,
            duration: Math.max(0.001, Math.min(duration - start, finite(clip.duration, 1))),
            clip: audioAssetPath(clip.clip),
            clip_in: Math.max(0, finite(clip.clip_in, 0)),
            volume: Math.max(0, Math.min(4, finite(clip.volume, 1))),
            pitch: Math.max(0.05, Math.min(4, finite(clip.pitch, 1))),
            looped: Boolean(clip.looped),
          } satisfies TimelineAudioClip;
        })
        .sort((left, right) => left.start - right.start);
      tracks.push({
        type,
        id,
        name,
        muted: Boolean(track.muted),
        locked: Boolean(track.locked),
        target: activationTarget(track.target),
        clips,
      });
    } else {
      const clips = (Array.isArray(track.clips) ? track.clips : [])
        .map((clipValue) => {
          const clip = object(clipValue);
          const start = Math.max(0, Math.min(duration, finite(clip.start, 0)));
          return {
            start,
            duration: Math.max(0.001, Math.min(duration - start, finite(clip.duration, 1))),
            clip: audioAssetPath(clip.clip),
            clip_in: Math.max(0, finite(clip.clip_in, 0)),
            speed: Math.max(-4, Math.min(4, finite(clip.speed, 1))),
          } satisfies TimelineAnimationClip;
        })
        .sort((left, right) => left.start - right.start);
      tracks.push({
        type,
        id,
        name,
        muted: Boolean(track.muted),
        locked: Boolean(track.locked),
        target: activationTarget(track.target),
        clips,
      });
    }
  }
  return {
    version: 1,
    name: String(raw.name ?? '').trim() || 'Timeline',
    duration,
    frame_rate: Math.max(1, Math.min(240, finite(raw.frame_rate, 60))),
    tracks,
  };
}

export function validateTimelineAsset(asset: TimelineAsset): void {
  if (asset.version !== 1) throw new Error('Timeline version must be 1');
  if (!asset.name.trim()) throw new Error('Timeline name cannot be empty');
  if (!Number.isFinite(asset.duration) || asset.duration <= 0) throw new Error('Timeline duration must be positive');
  if (!Number.isFinite(asset.frame_rate) || asset.frame_rate <= 0 || asset.frame_rate > 240) throw new Error('Timeline frame rate must be between 0 and 240');
  const ids = new Set<string>();
  const activationTargets = new Set<string>();
  const audioTargets = new Set<string>();
  const animationTargets = new Set<string>();
  for (const track of asset.tracks) {
    if (!track.id.trim() || ids.has(track.id)) throw new Error('Timeline track IDs must be non-empty and unique');
    ids.add(track.id);
    if (!track.name.trim()) throw new Error(`Timeline track ${track.id} must have a name`);
    if (track.type === 'signal') {
      for (const marker of track.markers) {
        if (!marker.name.trim()) throw new Error(`Signal track ${track.name} contains an unnamed signal`);
        if (!Number.isFinite(marker.time) || marker.time < 0 || marker.time > asset.duration) {
          throw new Error(`Signal ${marker.name} is outside the Timeline duration`);
        }
      }
      continue;
    }
    const target = activationTarget(track.target);
    if (!targetIsPortable(target)) throw new Error(`${trackLabel(track.type)} track ${track.name} requires a descendant target path without '.' or '..'`);
    const targets = track.type === 'activation' ? activationTargets : track.type === 'audio' ? audioTargets : animationTargets;
    if (targets.has(target)) throw new Error(`${trackLabel(track.type)} target ${target} is controlled by more than one track`);
    targets.add(target);
    if (track.type === 'audio') {
      for (const clip of track.clips) {
        if (!audioAssetIsPortable(audioAssetPath(clip.clip))
          || !Number.isFinite(clip.clip_in) || clip.clip_in < 0
          || !Number.isFinite(clip.volume) || clip.volume < 0 || clip.volume > 4
          || !Number.isFinite(clip.pitch) || clip.pitch < 0.05 || clip.pitch > 4) {
          throw new Error(`Audio track ${track.name} contains invalid clip settings`);
        }
      }
    }
    if (track.type === 'animation') {
      for (const clip of track.clips) {
        if (!animationAssetIsPortable(audioAssetPath(clip.clip))
          || !Number.isFinite(clip.clip_in) || clip.clip_in < 0
          || !Number.isFinite(clip.speed) || clip.speed < -4 || clip.speed > 4) {
          throw new Error(`Animation track ${track.name} contains invalid clip settings`);
        }
      }
    }
    const sorted = [...track.clips].sort((left, right) => left.start - right.start);
    for (const [index, clip] of sorted.entries()) {
      if (!Number.isFinite(clip.start) || !Number.isFinite(clip.duration)
        || clip.start < 0 || clip.duration <= 0 || clip.start + clip.duration > asset.duration) {
        throw new Error(`${trackLabel(track.type)} track ${track.name} contains a clip outside the Timeline duration`);
      }
      if (index > 0 && sorted[index - 1].start + sorted[index - 1].duration > clip.start) {
        throw new Error(`${trackLabel(track.type)} track ${track.name} contains overlapping clips`);
      }
    }
  }
}

export function parseTimelineAsset(text: string): TimelineAsset {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (parsed.version !== 1) throw new Error(`Unsupported Timeline version: ${String(parsed.version ?? '(missing)')}`);
  if (typeof parsed.duration !== 'number' || !Number.isFinite(parsed.duration) || parsed.duration <= 0) {
    throw new Error('Timeline duration must be positive');
  }
  const parsedDuration = parsed.duration;
  if (parsed.frame_rate != null
    && (typeof parsed.frame_rate !== 'number' || !Number.isFinite(parsed.frame_rate) || parsed.frame_rate <= 0 || parsed.frame_rate > 240)) {
    throw new Error('Timeline frame rate must be between 0 and 240');
  }
  if (!Array.isArray(parsed.tracks)) throw new Error('Timeline tracks must be an array');
  const ids = new Set<string>();
  const activationTargets = new Set<string>();
  const audioTargets = new Set<string>();
  const animationTargets = new Set<string>();
  for (const trackValue of parsed.tracks) {
    const track = object(trackValue);
    if (track.type !== 'signal' && track.type !== 'activation' && track.type !== 'audio' && track.type !== 'animation') throw new Error(`Unsupported Timeline track type: ${String(track.type)}`);
    if (typeof track.id !== 'string' || !track.id.trim() || ids.has(track.id.trim())) {
      throw new Error('Timeline track IDs must be non-empty strings and unique');
    }
    ids.add(track.id.trim());
    if (typeof track.name !== 'string' || !track.name.trim()) throw new Error(`Timeline track ${track.id} must have a name`);
    if (track.muted != null && typeof track.muted !== 'boolean') throw new Error(`Timeline track ${track.id} muted must be boolean`);
    if (track.locked != null && typeof track.locked !== 'boolean') throw new Error(`Timeline track ${track.id} locked must be boolean`);
    if (track.type === 'signal') {
      if (track.markers != null && !Array.isArray(track.markers)) throw new Error(`Signal track ${track.id} markers must be an array`);
      for (const markerValue of Array.isArray(track.markers) ? track.markers : []) {
        const marker = object(markerValue);
        if (typeof marker.name !== 'string' || !marker.name.trim()
          || typeof marker.time !== 'number' || !Number.isFinite(marker.time)
          || marker.time < 0 || marker.time > parsedDuration) {
          throw new Error(`Signal track ${track.id} contains an invalid or out-of-range signal`);
        }
      }
      continue;
    }
    const label = track.type === 'activation' ? 'Activation' : track.type === 'audio' ? 'Audio' : 'Animation';
    if (typeof track.target !== 'string' || !targetIsPortable(activationTarget(track.target))) throw new Error(`${label} track ${track.id} requires a descendant target path without '.' or '..'`);
    const target = activationTarget(track.target);
    const targets = track.type === 'activation' ? activationTargets : track.type === 'audio' ? audioTargets : animationTargets;
    if (targets.has(target)) throw new Error(`${label} target ${target} is controlled by more than one track`);
    targets.add(target);
    if (track.clips != null && !Array.isArray(track.clips)) throw new Error(`${label} track ${track.id} clips must be an array`);
    const clips = (Array.isArray(track.clips) ? track.clips : []).map((clipValue) => {
      const clip = object(clipValue);
      if (typeof clip.start !== 'number' || !Number.isFinite(clip.start)
        || typeof clip.duration !== 'number' || !Number.isFinite(clip.duration)
        || track.type === 'activation' && typeof clip.active !== 'boolean'
        || track.type === 'audio' && (typeof clip.clip !== 'string' || !audioAssetIsPortable(audioAssetPath(clip.clip))
          || clip.clip_in != null && (typeof clip.clip_in !== 'number' || !Number.isFinite(clip.clip_in) || clip.clip_in < 0)
          || clip.volume != null && (typeof clip.volume !== 'number' || !Number.isFinite(clip.volume) || clip.volume < 0 || clip.volume > 4)
          || clip.pitch != null && (typeof clip.pitch !== 'number' || !Number.isFinite(clip.pitch) || clip.pitch < 0.05 || clip.pitch > 4)
          || clip.looped != null && typeof clip.looped !== 'boolean')
        || track.type === 'animation' && (typeof clip.clip !== 'string' || !animationAssetIsPortable(audioAssetPath(clip.clip))
          || clip.clip_in != null && (typeof clip.clip_in !== 'number' || !Number.isFinite(clip.clip_in) || clip.clip_in < 0)
          || clip.speed != null && (typeof clip.speed !== 'number' || !Number.isFinite(clip.speed) || clip.speed < -4 || clip.speed > 4))
        || clip.start < 0 || clip.duration <= 0
        || clip.start + clip.duration > parsedDuration) {
        throw new Error(`${label} track ${track.id} contains an invalid or out-of-range clip`);
      }
      return { start: clip.start, duration: clip.duration };
    }).sort((left, right) => left.start - right.start);
    if (clips.some((clip, index) => index > 0 && clips[index - 1].start + clips[index - 1].duration > clip.start)) {
      throw new Error(`${label} track ${track.id} contains overlapping clips`);
    }
  }
  const asset = normalizeTimelineAsset(parsed);
  validateTimelineAsset(asset);
  return asset;
}

export function serializeTimelineAsset(asset: TimelineAsset): string {
  validateTimelineAsset(asset);
  const normalized = normalizeTimelineAsset(asset);
  validateTimelineAsset(normalized);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}

export function snapTimelineAssetTime(time: number, asset: TimelineAsset): number {
  const rate = Math.max(1, asset.frame_rate);
  const snapped = Number((Math.round(time * rate) / rate).toFixed(9));
  return Math.max(0, Math.min(asset.duration, snapped));
}
