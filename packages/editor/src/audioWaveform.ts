import { normalizeProjectAssetPath, readProjectAssetBytes } from './projectAssets.ts';

export type AudioWaveformPeak = { min: number; max: number };
export type AudioWaveformData = {
  duration: number;
  peaks: AudioWaveformPeak[];
};

type WaveformListener = () => void;

const cache = new Map<string, Promise<AudioWaveformData>>();
const listeners = new Set<WaveformListener>();
let revision = 0;
let decoderContext: AudioContext | null = null;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function buildAudioWaveform(
  channels: readonly ArrayLike<number>[],
  duration: number,
  requestedBuckets = 2_048,
): AudioWaveformData {
  const sampleCount = channels.reduce((length, channel) => Math.max(length, channel.length), 0);
  const bucketCount = Math.max(1, Math.min(sampleCount || 1, Math.trunc(finite(requestedBuckets, 2_048))));
  const peaks = Array.from({ length: bucketCount }, (_, bucket): AudioWaveformPeak => {
    const start = Math.floor(bucket / bucketCount * sampleCount);
    const end = Math.max(start + 1, Math.ceil((bucket + 1) / bucketCount * sampleCount));
    let minimum = 0;
    let maximum = 0;
    for (const channel of channels) {
      const channelEnd = Math.min(end, channel.length);
      for (let index = start; index < channelEnd; index += 1) {
        const sample = finite(Number(channel[index]), 0);
        minimum = Math.min(minimum, sample);
        maximum = Math.max(maximum, sample);
      }
    }
    return { min: minimum, max: maximum };
  });
  return { duration: Math.max(0, finite(duration, 0)), peaks };
}

function aggregateRange(
  waveform: AudioWaveformData,
  start: number,
  end: number,
): AudioWaveformPeak {
  if (waveform.duration <= 0 || waveform.peaks.length === 0 || end <= start) return { min: 0, max: 0 };
  const first = Math.max(0, Math.min(
    waveform.peaks.length - 1,
    Math.floor(start / waveform.duration * waveform.peaks.length),
  ));
  const last = Math.max(first, Math.min(
    waveform.peaks.length - 1,
    Math.ceil(end / waveform.duration * waveform.peaks.length) - 1,
  ));
  let minimum = 0;
  let maximum = 0;
  for (let index = first; index <= last; index += 1) {
    minimum = Math.min(minimum, waveform.peaks[index].min);
    maximum = Math.max(maximum, waveform.peaks[index].max);
  }
  return { min: minimum, max: maximum };
}

function mergePeaks(left: AudioWaveformPeak, right: AudioWaveformPeak): AudioWaveformPeak {
  return { min: Math.min(left.min, right.min), max: Math.max(left.max, right.max) };
}

function sampleSourceRange(
  waveform: AudioWaveformData,
  start: number,
  end: number,
  looped: boolean,
): AudioWaveformPeak {
  const sourceDuration = waveform.duration;
  if (sourceDuration <= 0 || end <= 0 || (!looped && start >= sourceDuration)) return { min: 0, max: 0 };
  if (!looped) return aggregateRange(waveform, Math.max(0, start), Math.min(sourceDuration, end));
  if (end - start >= sourceDuration) return aggregateRange(waveform, 0, sourceDuration);
  const wrappedStart = ((start % sourceDuration) + sourceDuration) % sourceDuration;
  const wrappedEnd = wrappedStart + (end - start);
  if (wrappedEnd <= sourceDuration) return aggregateRange(waveform, wrappedStart, wrappedEnd);
  return mergePeaks(
    aggregateRange(waveform, wrappedStart, sourceDuration),
    aggregateRange(waveform, 0, wrappedEnd - sourceDuration),
  );
}

export function sampleAudioWaveform(
  waveform: AudioWaveformData,
  clipIn: number,
  pitch: number,
  clipDuration: number,
  looped: boolean,
  requestedColumns = 96,
): AudioWaveformPeak[] {
  const columns = Math.max(1, Math.min(512, Math.trunc(finite(requestedColumns, 96))));
  const duration = Math.max(0, finite(clipDuration, 0));
  const rate = Math.max(0.0001, finite(pitch, 1));
  const offset = Math.max(0, finite(clipIn, 0));
  return Array.from({ length: columns }, (_, index) => {
    const timelineStart = index / columns * duration;
    const timelineEnd = (index + 1) / columns * duration;
    return sampleSourceRange(
      waveform,
      offset + timelineStart * rate,
      offset + timelineEnd * rate,
      looped,
    );
  });
}

async function decodeAudioWaveform(path: string): Promise<AudioWaveformData> {
  if (typeof AudioContext === 'undefined') throw new Error('Web Audio decoding is unavailable');
  decoderContext ??= new AudioContext();
  const bytes = await readProjectAssetBytes(path);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const buffer = await decoderContext.decodeAudioData(copy.buffer);
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel),
  );
  return buildAudioWaveform(channels, buffer.duration);
}

export function loadAudioWaveform(path: string): Promise<AudioWaveformData> {
  const normalized = normalizeProjectAssetPath(path);
  const key = normalized.toLowerCase();
  const existing = cache.get(key);
  if (existing) return existing;
  const loading = decodeAudioWaveform(normalized);
  cache.set(key, loading);
  return loading;
}

export function clearAudioWaveforms(path?: string): void {
  if (path) cache.delete(normalizeProjectAssetPath(path).toLowerCase());
  else cache.clear();
  revision += 1;
  for (const listener of listeners) listener();
}

export function subscribeAudioWaveforms(listener: WaveformListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function audioWaveformRevision(): number {
  return revision;
}
