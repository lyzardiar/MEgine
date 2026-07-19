import {
  loadProjectAudioBuffer,
  projectAudioContext,
  unlockProjectAudio,
} from './audioWaveform.ts';
import {
  timelineAudioSourceTime,
  type TimelineAudioPreviewItem,
} from './timelineAudioPreview.ts';

const CONTINUOUS_DRIFT_LIMIT = 0.1;
const SCRUB_DEBOUNCE_MS = 24;
const SCRUB_GRAIN_SECONDS = 0.12;
const SCRUB_FADE_SECONDS = 0.008;

export type TimelineAudioPreviewStatus = {
  mode: 'idle' | 'loading' | 'playing' | 'scrubbing';
  voices: number;
  diagnostics: string[];
};

export type TimelineAudioPreviewBackend = {
  context: () => AudioContext;
  load: (path: string) => Promise<AudioBuffer>;
  unlock: () => Promise<void>;
};

const DEFAULT_AUDIO_BACKEND: TimelineAudioPreviewBackend = {
  context: projectAudioContext,
  load: loadProjectAudioBuffer,
  unlock: unlockProjectAudio,
};

type Voice = {
  source: AudioBufferSourceNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
  signature: string;
  sourceTime: number;
  startedAt: number;
  duration: number;
  pitch: number;
  looped: boolean;
};

function finite(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function itemSignature(item: TimelineAudioPreviewItem): string {
  return [
    item.clip.trim().replaceAll('\\', '/').toLowerCase(),
    finite(item.clipStart, 0),
    finite(item.clipIn, 0),
    Math.max(0.05, Math.min(4, finite(item.pitch, 1))),
    item.looped ? 1 : 0,
  ].join('\0');
}

function wrappedDistance(left: number, right: number, duration: number): number {
  const direct = Math.abs(left - right);
  return Math.min(direct, Math.max(0, duration - direct));
}

function connectVoice(
  context: AudioContext,
  source: AudioBufferSourceNode,
  gain: GainNode,
  pan: number,
): StereoPannerNode | null {
  const panner = typeof context.createStereoPanner === 'function'
    ? context.createStereoPanner()
    : null;
  source.connect(gain);
  if (panner) {
    panner.pan.value = Math.max(-1, Math.min(1, finite(pan, 0)));
    gain.connect(panner);
    panner.connect(context.destination);
  } else {
    gain.connect(context.destination);
  }
  return panner;
}

export class TimelineAudioPreviewController {
  private readonly onStatus: (status: TimelineAudioPreviewStatus) => void;
  private readonly backend: TimelineAudioPreviewBackend;
  private desired = new Map<string, TimelineAudioPreviewItem>();
  private voices = new Map<string, Voice>();
  private pending = new Map<string, Promise<void>>();
  private failedSignatures = new Map<string, string>();
  private exhausted = new Map<string, { signature: string; duration: number }>();
  private diagnostics = new Map<string, string>();
  private auditionSources = new Set<AudioBufferSourceNode>();
  private auditionTimer: ReturnType<typeof setTimeout> | null = null;
  private auditionLoadingGeneration: number | null = null;
  private auditionGeneration = 0;
  private lastAuditionRevision: number | null = null;
  private playing = false;
  private disposed = false;
  private lastStatus = '';

  constructor(
    onStatus: (status: TimelineAudioPreviewStatus) => void,
    backend: TimelineAudioPreviewBackend = DEFAULT_AUDIO_BACKEND,
  ) {
    this.onStatus = onStatus;
    this.backend = backend;
  }

  activate(): void {
    if (!this.disposed) return;
    this.disposed = false;
    this.playing = false;
    this.lastStatus = '';
    this.publishStatus();
  }

  async unlock(): Promise<void> {
    try {
      await this.backend.unlock();
      this.diagnostics.delete('__context');
    } catch (reason) {
      this.diagnostics.set('__context', `Timeline audio preview is unavailable: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
    this.publishStatus();
  }

  update(
    items: readonly TimelineAudioPreviewItem[],
    playing: boolean,
    auditionRevision: number,
  ): void {
    if (this.disposed) return;
    this.pruneInactiveState(items);
    if (this.lastAuditionRevision == null) this.lastAuditionRevision = auditionRevision;
    if (playing) {
      this.lastAuditionRevision = auditionRevision;
      this.playing = true;
      this.cancelAudition();
      this.desired = new Map(items.map((item) => [item.key, item]));
      for (const key of [...this.voices.keys()]) {
        if (!this.desired.has(key)) this.stopVoice(key);
      }
      for (const item of items) this.synchronizeVoice(item);
      this.publishStatus();
      return;
    }

    this.playing = false;
    this.desired.clear();
    this.stopContinuousVoices();
    if (auditionRevision !== this.lastAuditionRevision) {
      this.lastAuditionRevision = auditionRevision;
      this.scheduleAudition(items);
    } else {
      this.publishStatus();
    }
  }

  invalidate(): void {
    this.playing = false;
    this.failedSignatures.clear();
    this.exhausted.clear();
    this.diagnostics.clear();
    this.desired.clear();
    this.stopContinuousVoices();
    this.cancelAudition();
    this.publishStatus();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.invalidate();
  }

  private synchronizeVoice(item: TimelineAudioPreviewItem): void {
    const signature = itemSignature(item);
    if (item.muted) {
      this.stopVoice(item.key);
      return;
    }
    const exhausted = this.exhausted.get(item.key);
    if (exhausted?.signature === signature
      && !item.looped
      && item.sourceTime >= exhausted.duration) {
      this.stopVoice(item.key);
      return;
    }
    if (exhausted) this.exhausted.delete(item.key);
    const voice = this.voices.get(item.key);
    if (!voice || voice.signature !== signature) {
      this.stopVoice(item.key);
      this.ensureVoice(item, signature);
      return;
    }
    const context = this.backend.context();
    const expected = timelineAudioSourceTime(voice.duration, item.sourceTime, item.looped);
    if (expected == null) {
      this.exhausted.set(item.key, { signature, duration: voice.duration });
      this.stopVoice(item.key);
      return;
    }
    const actual = timelineAudioSourceTime(
      voice.duration,
      voice.sourceTime + Math.max(0, context.currentTime - voice.startedAt) * voice.pitch,
      voice.looped,
    );
    const drift = actual == null
      ? Number.POSITIVE_INFINITY
      : item.looped
        ? wrappedDistance(actual, expected, voice.duration)
        : Math.abs(actual - expected);
    if (drift > CONTINUOUS_DRIFT_LIMIT) {
      this.stopVoice(item.key);
      this.ensureVoice(item, signature);
      return;
    }
    const now = context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(Math.max(0, finite(item.volume, 0)), now, 0.008);
    if (voice.panner) voice.panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, finite(item.pan, 0))), now, 0.008);
  }

  private ensureVoice(item: TimelineAudioPreviewItem, signature: string): void {
    if (this.pending.has(item.key) || this.failedSignatures.get(item.key) === signature) return;
    const loading = (async () => {
      try {
        const buffer = await this.backend.load(item.clip);
        if (this.disposed || !this.playing) return;
        const latest = this.desired.get(item.key);
        if (!latest || latest.muted || itemSignature(latest) !== signature) return;
        const offset = timelineAudioSourceTime(buffer.duration, latest.sourceTime, latest.looped);
        if (offset == null) {
          this.exhausted.set(item.key, { signature, duration: buffer.duration });
          return;
        }
        const context = this.backend.context();
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.loop = latest.looped;
        source.playbackRate.value = Math.max(0.05, Math.min(4, finite(latest.pitch, 1)));
        gain.gain.value = Math.max(0, finite(latest.volume, 0));
        const panner = connectVoice(context, source, gain, latest.pan);
        const voice: Voice = {
          source,
          gain,
          panner,
          signature,
          sourceTime: offset,
          startedAt: context.currentTime,
          duration: buffer.duration,
          pitch: source.playbackRate.value,
          looped: latest.looped,
        };
        this.voices.set(item.key, voice);
        source.onended = () => {
          if (this.voices.get(item.key)?.source !== source) return;
          this.voices.delete(item.key);
          if (!latest.looped) this.exhausted.set(item.key, { signature, duration: buffer.duration });
          this.publishStatus();
        };
        source.start(context.currentTime, offset);
        this.failedSignatures.delete(item.key);
        this.diagnostics.delete(item.key);
      } catch (reason) {
        const latest = this.desired.get(item.key);
        if (this.playing && latest && itemSignature(latest) === signature) {
          this.failedSignatures.set(item.key, signature);
          this.diagnostics.set(item.key, `Audio track '${item.label}' clip '${item.clip}' failed to preview: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      } finally {
        this.pending.delete(item.key);
        this.publishStatus();
      }
    })();
    this.pending.set(item.key, loading);
    this.publishStatus();
  }

  private scheduleAudition(items: readonly TimelineAudioPreviewItem[]): void {
    this.cancelAudition();
    const generation = ++this.auditionGeneration;
    this.auditionTimer = setTimeout(() => {
      this.auditionTimer = null;
      void this.playAudition(items, generation);
    }, SCRUB_DEBOUNCE_MS);
    this.publishStatus();
  }

  private async playAudition(
    items: readonly TimelineAudioPreviewItem[],
    generation: number,
  ): Promise<void> {
    this.auditionLoadingGeneration = generation;
    this.publishStatus();
    await Promise.all(items.filter((item) => !item.muted).map(async (item) => {
      const signature = itemSignature(item);
      try {
        const buffer = await this.backend.load(item.clip);
        if (this.disposed || generation !== this.auditionGeneration || this.playing) return;
        const offset = timelineAudioSourceTime(buffer.duration, item.sourceTime, item.looped);
        if (offset == null) return;
        const context = this.backend.context();
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.loop = item.looped;
        source.playbackRate.value = Math.max(0.05, Math.min(4, finite(item.pitch, 1)));
        const now = context.currentTime;
        const level = Math.max(0, finite(item.volume, 0));
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(level, now + SCRUB_FADE_SECONDS);
        gain.gain.setValueAtTime(level, now + SCRUB_GRAIN_SECONDS - SCRUB_FADE_SECONDS);
        gain.gain.linearRampToValueAtTime(0, now + SCRUB_GRAIN_SECONDS);
        connectVoice(context, source, gain, item.pan);
        this.auditionSources.add(source);
        source.onended = () => {
          this.auditionSources.delete(source);
          this.publishStatus();
        };
        source.start(now, offset);
        source.stop(now + SCRUB_GRAIN_SECONDS);
        this.failedSignatures.delete(item.key);
        this.diagnostics.delete(item.key);
      } catch (reason) {
        if (!this.disposed && generation === this.auditionGeneration && !this.playing) {
          this.failedSignatures.set(item.key, signature);
          this.diagnostics.set(item.key, `Audio track '${item.label}' clip '${item.clip}' failed to preview: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
    }));
    if (this.auditionLoadingGeneration === generation) this.auditionLoadingGeneration = null;
    this.publishStatus();
  }

  private stopVoice(key: string): void {
    const voice = this.voices.get(key);
    if (!voice) return;
    this.voices.delete(key);
    voice.source.onended = null;
    try { voice.source.stop(); } catch { /* already stopped */ }
    voice.source.disconnect();
    voice.gain.disconnect();
    voice.panner?.disconnect();
  }

  private pruneInactiveState(items: readonly TimelineAudioPreviewItem[]): void {
    const active = new Set(items.filter((item) => !item.muted).map((item) => item.key));
    for (const key of [...this.diagnostics.keys()]) {
      if (key !== '__context' && !active.has(key)) this.diagnostics.delete(key);
    }
    for (const key of [...this.failedSignatures.keys()]) {
      if (!active.has(key)) this.failedSignatures.delete(key);
    }
    for (const key of [...this.exhausted.keys()]) {
      if (!active.has(key)) this.exhausted.delete(key);
    }
  }

  private stopContinuousVoices(): void {
    for (const key of [...this.voices.keys()]) this.stopVoice(key);
  }

  private cancelAudition(): void {
    this.auditionGeneration += 1;
    this.auditionLoadingGeneration = null;
    if (this.auditionTimer != null) clearTimeout(this.auditionTimer);
    this.auditionTimer = null;
    for (const source of this.auditionSources) {
      source.onended = null;
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    }
    this.auditionSources.clear();
  }

  private publishStatus(): void {
    if (this.disposed) return;
    const relevantPending = [...this.pending.keys()].some((key) => this.desired.has(key));
    const mode: TimelineAudioPreviewStatus['mode'] = this.auditionTimer
      || this.auditionLoadingGeneration != null
      || this.auditionSources.size
      ? 'scrubbing'
      : this.playing && this.voices.size
        ? 'playing'
        : relevantPending
          ? 'loading'
          : 'idle';
    const status: TimelineAudioPreviewStatus = {
      mode,
      voices: mode === 'scrubbing' ? this.auditionSources.size : this.voices.size,
      diagnostics: [...this.diagnostics.values()],
    };
    const serialized = JSON.stringify(status);
    if (serialized === this.lastStatus) return;
    this.lastStatus = serialized;
    this.onStatus(status);
  }
}
