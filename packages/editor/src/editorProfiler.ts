export const EDITOR_PROFILER_SAMPLE_INTERVAL_MS = 250;
export const EDITOR_PROFILER_SAMPLE_LIMIT = 480;

export type EditorProfilerSource = 'scene' | 'game';

export type ViewportProfilerFrame = {
  source: EditorProfilerSource;
  timestamp: number;
  frameIntervalMs: number;
  paintMs: number;
  entities: number;
  drawItems: number;
  uiPrimitives: number;
  uiBatches: number;
  particles: number;
  spineSkeletons: number;
  viewportPixels: number;
};

export type EditorProfilerSample = Omit<ViewportProfilerFrame, 'frameIntervalMs' | 'paintMs'> & {
  sampleCount: number;
  frameMs: number;
  frameMaxMs: number;
  paintMs: number;
  paintMaxMs: number;
};

type ProfilerBucket = {
  source: EditorProfilerSource;
  startedAt: number;
  sampleCount: number;
  frameCount: number;
  frameTotalMs: number;
  frameMaxMs: number;
  paintTotalMs: number;
  paintMaxMs: number;
  latest: ViewportProfilerFrame;
};

export type EditorProfilerSummary = {
  latest: EditorProfilerSample | null;
  samples: number;
  averageFrameMs: number;
  p95FrameMs: number;
  peakFrameMs: number;
  averagePaintMs: number;
  p95PaintMs: number;
  peakPaintMs: number;
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteCount(value: number): number {
  return Math.max(0, Math.trunc(finiteNonNegative(value)));
}

function normalizeFrame(frame: ViewportProfilerFrame): ViewportProfilerFrame | null {
  if (frame.source !== 'scene' && frame.source !== 'game') return null;
  if (!Number.isFinite(frame.timestamp)) return null;
  return {
    source: frame.source,
    timestamp: frame.timestamp,
    frameIntervalMs: finiteNonNegative(frame.frameIntervalMs),
    paintMs: finiteNonNegative(frame.paintMs),
    entities: finiteCount(frame.entities),
    drawItems: finiteCount(frame.drawItems),
    uiPrimitives: finiteCount(frame.uiPrimitives),
    uiBatches: finiteCount(frame.uiBatches),
    particles: finiteCount(frame.particles),
    spineSkeletons: finiteCount(frame.spineSkeletons),
    viewportPixels: finiteCount(frame.viewportPixels),
  };
}

export function createEditorProfilerSampler(
  intervalMs = EDITOR_PROFILER_SAMPLE_INTERVAL_MS,
): (frame: ViewportProfilerFrame) => EditorProfilerSample | null {
  const buckets = new Map<EditorProfilerSource, ProfilerBucket>();
  const interval = Math.max(16, finiteNonNegative(intervalMs));
  return (input) => {
    const frame = normalizeFrame(input);
    if (!frame) return null;
    let bucket = buckets.get(frame.source);
    if (!bucket || frame.timestamp < bucket.startedAt
      || (frame.frameIntervalMs === 0 && bucket.sampleCount > 0)) {
      bucket = {
        source: frame.source,
        startedAt: frame.timestamp,
        sampleCount: 0,
        frameCount: 0,
        frameTotalMs: 0,
        frameMaxMs: 0,
        paintTotalMs: 0,
        paintMaxMs: 0,
        latest: frame,
      };
      buckets.set(frame.source, bucket);
    }
    bucket.sampleCount += 1;
    bucket.latest = frame;
    if (frame.frameIntervalMs > 0) {
      bucket.frameCount += 1;
      bucket.frameTotalMs += frame.frameIntervalMs;
      bucket.frameMaxMs = Math.max(bucket.frameMaxMs, frame.frameIntervalMs);
    }
    bucket.paintTotalMs += frame.paintMs;
    bucket.paintMaxMs = Math.max(bucket.paintMaxMs, frame.paintMs);
    if (frame.timestamp - bucket.startedAt < interval) return null;

    const sample: EditorProfilerSample = {
      source: bucket.source,
      timestamp: frame.timestamp,
      sampleCount: bucket.sampleCount,
      frameMs: bucket.frameCount > 0 ? bucket.frameTotalMs / bucket.frameCount : 0,
      frameMaxMs: bucket.frameMaxMs,
      paintMs: bucket.sampleCount > 0 ? bucket.paintTotalMs / bucket.sampleCount : 0,
      paintMaxMs: bucket.paintMaxMs,
      entities: frame.entities,
      drawItems: frame.drawItems,
      uiPrimitives: frame.uiPrimitives,
      uiBatches: frame.uiBatches,
      particles: frame.particles,
      spineSkeletons: frame.spineSkeletons,
      viewportPixels: frame.viewportPixels,
    };
    buckets.set(frame.source, {
      source: frame.source,
      startedAt: frame.timestamp,
      sampleCount: 0,
      frameCount: 0,
      frameTotalMs: 0,
      frameMaxMs: 0,
      paintTotalMs: 0,
      paintMaxMs: 0,
      latest: frame,
    });
    return sample;
  };
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[Math.max(0, index)];
}

export function summarizeEditorProfilerSamples(
  samples: readonly EditorProfilerSample[],
): EditorProfilerSummary {
  if (!samples.length) {
    return {
      latest: null,
      samples: 0,
      averageFrameMs: 0,
      p95FrameMs: 0,
      peakFrameMs: 0,
      averagePaintMs: 0,
      p95PaintMs: 0,
      peakPaintMs: 0,
    };
  }
  const frameValues = samples.map((sample) => sample.frameMs);
  const paintValues = samples.map((sample) => sample.paintMs);
  return {
    latest: samples[samples.length - 1],
    samples: samples.length,
    averageFrameMs: frameValues.reduce((sum, value) => sum + value, 0) / frameValues.length,
    p95FrameMs: percentile(frameValues, 0.95),
    peakFrameMs: Math.max(...samples.map((sample) => sample.frameMaxMs)),
    averagePaintMs: paintValues.reduce((sum, value) => sum + value, 0) / paintValues.length,
    p95PaintMs: percentile(paintValues, 0.95),
    peakPaintMs: Math.max(...samples.map((sample) => sample.paintMaxMs)),
  };
}

type ProfilerChannelMessage =
  | { type: 'sample'; sample: EditorProfilerSample }
  | { type: 'clear' };

const CHANNEL_NAME = 'mengine.editor.profiler.v1';
const samples: EditorProfilerSample[] = [];
const listeners = new Set<() => void>();
const sampler = createEditorProfilerSampler();
let channel: BroadcastChannel | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function appendSample(sample: EditorProfilerSample, broadcast: boolean): void {
  samples.push(sample);
  const sourceCount = samples.reduce(
    (count, candidate) => count + Number(candidate.source === sample.source),
    0,
  );
  if (sourceCount > EDITOR_PROFILER_SAMPLE_LIMIT) {
    const oldest = samples.findIndex((candidate) => candidate.source === sample.source);
    if (oldest >= 0) samples.splice(oldest, 1);
  }
  notify();
  if (broadcast) profilerChannel()?.postMessage({ type: 'sample', sample } satisfies ProfilerChannelMessage);
}

function profilerChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.addEventListener('message', (event: MessageEvent<ProfilerChannelMessage>) => {
    const message = event.data;
    if (message?.type === 'clear') {
      samples.length = 0;
      notify();
      return;
    }
    if (message?.type !== 'sample') return;
    const raw = (message as { sample?: unknown }).sample;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const candidate = raw as Partial<EditorProfilerSample>;
    const numeric = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);
    const normalizedFrame = normalizeFrame({
      source: candidate.source as EditorProfilerSource,
      timestamp: numeric(candidate.timestamp),
      frameIntervalMs: numeric(candidate.frameMs),
      paintMs: numeric(candidate.paintMs),
      entities: numeric(candidate.entities),
      drawItems: numeric(candidate.drawItems),
      uiPrimitives: numeric(candidate.uiPrimitives),
      uiBatches: numeric(candidate.uiBatches),
      particles: numeric(candidate.particles),
      spineSkeletons: numeric(candidate.spineSkeletons),
      viewportPixels: numeric(candidate.viewportPixels),
    });
    if (!normalizedFrame) return;
    appendSample({
      source: normalizedFrame.source,
      timestamp: normalizedFrame.timestamp,
      sampleCount: finiteCount(numeric(candidate.sampleCount)),
      frameMs: finiteNonNegative(numeric(candidate.frameMs)),
      frameMaxMs: finiteNonNegative(numeric(candidate.frameMaxMs)),
      paintMs: finiteNonNegative(numeric(candidate.paintMs)),
      paintMaxMs: finiteNonNegative(numeric(candidate.paintMaxMs)),
      entities: normalizedFrame.entities,
      drawItems: normalizedFrame.drawItems,
      uiPrimitives: normalizedFrame.uiPrimitives,
      uiBatches: normalizedFrame.uiBatches,
      particles: normalizedFrame.particles,
      spineSkeletons: normalizedFrame.spineSkeletons,
      viewportPixels: normalizedFrame.viewportPixels,
    }, false);
  });
  return channel;
}

export function recordViewportProfilerFrame(frame: ViewportProfilerFrame): void {
  const sample = sampler(frame);
  if (sample) appendSample(sample, true);
}

export function readEditorProfilerSamples(
  source?: EditorProfilerSource,
): EditorProfilerSample[] {
  return samples.filter((sample) => !source || sample.source === source).map((sample) => ({ ...sample }));
}

export function clearEditorProfilerSamples(): void {
  samples.length = 0;
  notify();
  profilerChannel()?.postMessage({ type: 'clear' } satisfies ProfilerChannelMessage);
}

export function subscribeEditorProfiler(listener: () => void): () => void {
  listeners.add(listener);
  profilerChannel();
  return () => listeners.delete(listener);
}
