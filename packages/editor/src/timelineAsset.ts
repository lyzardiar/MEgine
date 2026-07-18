export type TimelineSignal = {
  time: number;
  name: string;
  payload?: unknown;
};

export type TimelineSignalTrack = {
  type: 'signal';
  id: string;
  name: string;
  muted: boolean;
  markers: TimelineSignal[];
};

export type TimelineTrack = TimelineSignalTrack;

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
    if (String(track.type ?? 'signal') !== 'signal') continue;
    const baseId = String(track.id ?? `signal-${index + 1}`).trim() || `signal-${index + 1}`;
    let id = baseId;
    let suffix = 1;
    while (usedIds.has(id)) id = `${baseId}-${++suffix}`;
    usedIds.add(id);
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
    tracks.push({
      type: 'signal',
      id,
      name: String(track.name ?? '').trim() || `Signal Track ${index + 1}`,
      muted: Boolean(track.muted),
      markers,
    });
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
  if (asset.version !== 1) throw new Error('Timeline 版本必须为 1');
  if (!asset.name.trim()) throw new Error('Timeline 名称不能为空');
  if (!Number.isFinite(asset.duration) || asset.duration <= 0) throw new Error('Timeline 时长必须大于 0');
  if (!Number.isFinite(asset.frame_rate) || asset.frame_rate <= 0) throw new Error('Timeline 帧率必须大于 0');
  const ids = new Set<string>();
  for (const track of asset.tracks) {
    if (track.type !== 'signal') throw new Error(`不支持的 Timeline 轨道类型：${String((track as { type?: unknown }).type)}`);
    if (!track.id.trim() || ids.has(track.id)) throw new Error('轨道 ID 必须非空且唯一');
    ids.add(track.id);
    if (!track.name.trim()) throw new Error(`轨道 ${track.id} 名称不能为空`);
    for (const marker of track.markers) {
      if (!marker.name.trim()) throw new Error(`轨道 ${track.name} 包含未命名信号`);
      if (!Number.isFinite(marker.time) || marker.time < 0 || marker.time > asset.duration) {
        throw new Error(`信号 ${marker.name} 超出 Timeline 时长`);
      }
    }
  }
}

export function parseTimelineAsset(text: string): TimelineAsset {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (parsed.version !== 1) throw new Error(`不支持的 Timeline 版本：${String(parsed.version ?? '(missing)')}`);
  if (typeof parsed.duration !== 'number' || !Number.isFinite(parsed.duration) || parsed.duration <= 0) {
    throw new Error('Timeline 时长必须大于 0');
  }
  if (parsed.frame_rate != null
    && (typeof parsed.frame_rate !== 'number' || !Number.isFinite(parsed.frame_rate) || parsed.frame_rate <= 0)) {
    throw new Error('Timeline 帧率必须大于 0');
  }
  if (!Array.isArray(parsed.tracks)) throw new Error('Timeline tracks 必须是数组');
  const ids = new Set<string>();
  for (const trackValue of parsed.tracks) {
    const track = object(trackValue);
    if (track.type !== 'signal') throw new Error(`不支持的 Timeline 轨道类型：${String(track.type)}`);
    const id = String(track.id ?? '').trim();
    if (!id || ids.has(id)) throw new Error('轨道 ID 必须非空且唯一');
    ids.add(id);
    if (!String(track.name ?? '').trim()) throw new Error(`轨道 ${id} 名称不能为空`);
    if (track.muted != null && typeof track.muted !== 'boolean') throw new Error(`轨道 ${id} muted 必须是布尔值`);
    if (track.markers != null && !Array.isArray(track.markers)) throw new Error(`轨道 ${id} markers 必须是数组`);
    for (const markerValue of Array.isArray(track.markers) ? track.markers : []) {
      const marker = object(markerValue);
      const markerTime = Number(marker.time);
      if (!String(marker.name ?? '').trim()) throw new Error(`轨道 ${id} 包含未命名信号`);
      if (!Number.isFinite(markerTime) || markerTime < 0 || markerTime > Number(parsed.duration)) {
        throw new Error(`轨道 ${id} 包含超出 Timeline 时长的信号`);
      }
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
