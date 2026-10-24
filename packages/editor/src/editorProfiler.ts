// Author: MiYu. Retain owned native frames without copying their resource snapshots again.
import type { PlayStepTiming } from './playStepTiming';
import type { SharedNativeViewportTransportProfile, NativeViewportWorldRequestProfile } from './nativeViewportTransport';
import { createEditorBroadcastChannel } from './editorInstance.ts';

export const EDITOR_PROFILER_SAMPLE_INTERVAL_MS = 250;
export const EDITOR_PROFILER_SAMPLE_LIMIT = 480;
export const EDITOR_PROFILER_BACKGROUND_UI_INTERVAL_MS = 1_000;

export function editorProfilerUiRefreshDelay(
  lastPublishedAt: number,
  now: number,
  focused: boolean,
  backgroundIntervalMs = EDITOR_PROFILER_BACKGROUND_UI_INTERVAL_MS,
): number {
  if (!Number.isFinite(lastPublishedAt) || !Number.isFinite(now) || now < lastPublishedAt) {
    return 0;
  }
  const interval = focused ? EDITOR_PROFILER_SAMPLE_INTERVAL_MS : Number.isFinite(backgroundIntervalMs)
    ? Math.max(0, backgroundIntervalMs)
    : EDITOR_PROFILER_BACKGROUND_UI_INTERVAL_MS;
  return Math.max(0, interval - (now - lastPublishedAt));
}

export type EditorProfilerSource = 'scene' | 'game';

export const VIEWPORT_PAINT_STAGE_LABELS = { request: 'World read and requests', world: 'World preparation', worldDraw: 'World composition', gizmos: 'Selection and gizmos', ui: 'UI layout and draw', composition: 'Final composition' } as const;
type ViewportPaintStage = keyof typeof VIEWPORT_PAINT_STAGE_LABELS;
const paintStageKeys = Object.keys(VIEWPORT_PAINT_STAGE_LABELS) as ViewportPaintStage[];
export type ViewportPaintStages = Partial<Record<ViewportPaintStage, number>>;
export type ViewportPaintStageSamples = Partial<Record<ViewportPaintStage, { averageMs: number; maxMs: number; sampleCount: number }>>;
type PaintStageTotals = Partial<Record<ViewportPaintStage, { totalMs: number; maxMs: number; sampleCount: number }>>;

function normalizePaintStages(value: unknown): ViewportPaintStages | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: ViewportPaintStages = {};
  for (const key of paintStageKeys) {
    const ms = (value as ViewportPaintStages)[key];
    if (typeof ms === 'number' && Number.isFinite(ms) && ms >= 0) result[key] = ms;
  }
  return Object.keys(result).length ? result : undefined;
}

function normalizePaintStageSamples(value: unknown): ViewportPaintStageSamples | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: ViewportPaintStageSamples = {};
  for (const key of paintStageKeys) {
    const stage = (value as ViewportPaintStageSamples)[key];
    if (stage && typeof stage.averageMs === 'number' && Number.isFinite(stage.averageMs) && stage.averageMs >= 0 && typeof stage.maxMs === 'number' && Number.isFinite(stage.maxMs) && stage.maxMs >= stage.averageMs && Number.isSafeInteger(stage.sampleCount) && stage.sampleCount > 0) result[key] = { averageMs: stage.averageMs, maxMs: stage.maxMs, sampleCount: stage.sampleCount };
  }
  return Object.keys(result).length ? result : undefined;
}

function accumulatePaintStage(totals: PaintStageTotals, key: ViewportPaintStage, ms: number, peak = ms, count = 1): void {
  const stage = totals[key] ??= { totalMs: 0, maxMs: 0, sampleCount: 0 };
  stage.totalMs += ms * count; stage.maxMs = Math.max(stage.maxMs, peak); stage.sampleCount += count;
}

function paintStageSamples(totals: PaintStageTotals): ViewportPaintStageSamples | undefined {
  const result: ViewportPaintStageSamples = {};
  for (const key of paintStageKeys) {
    const stage = totals[key];
    if (stage?.sampleCount) result[key] = { averageMs: Math.min(stage.maxMs, stage.totalMs / stage.sampleCount), maxMs: stage.maxMs, sampleCount: stage.sampleCount };
  }
  return Object.keys(result).length ? result : undefined;
}

export type NativeGpuTimingSettings = { game: boolean; scene: boolean; revision: number };

/** MiYu: delayed initial reads and other windows must not roll recording controls backward. */
export function newerNativeGpuTimings(current: NativeGpuTimingSettings | null, next: NativeGpuTimingSettings): NativeGpuTimingSettings {
  return !current || next.revision >= current.revision ? next : current;
}

export type NativeProfilerNode = {
  name: string;
  totalMs: number;
  selfMs: number;
  calls: number;
  children: NativeProfilerNode[];
};

export type NativeProfilerMemoryCategory = {
  name: string;
  domain: 'cpu' | 'gpu' | string;
  bytes: number;
  certainty: 'exact' | 'estimate' | 'lower-bound' | string;
  source: string;
};

export type NativeProfilerResource = {
  kind: string;
  asset: string;
  resolvedPath: string | null;
  loaded: boolean;
  sourceBytes: number | null;
  gpuBytesEstimate: number | null;
  dimensions: [number, number] | null;
  referencedBy: string[];
};

export type NativeProfilerCounts = {
  entities: number;
  renderObjects: number;
  cameraVisibleObjects?: number;
  shadowVisibleObjects?: number;
  submittedObjects?: number;
  billboardMeshes?: number;
  worldBundleBuilds?: number;
  worldBundleHits?: number;
  uiPrimitives: number;
  uiBatches: number;
  uiDrawCalls: number;
  materialPipelinesBuiltIn: number;
  materialPipelinesCustom: number;
  materialPipelinesResidentCustom: number;
  materialPipelinesRejected: number;
  materialPipelineEvictions: number;
  materialTexturesColor: number;
  materialTexturesData: number;
  materialTextureBindGroups: number;
  materialSamplers: number;
};

export type NativeViewportProfile = {
  schemaVersion: 1;
  renderSize?: [number, number];
  source: EditorProfilerSource;
  timestamp: number;
  totalMs: number;
  callTree: NativeProfilerNode;
  /** Hardware timestamps for main viewport passes; overlaps CPU work and GPU map wait. */
  gpu?: { timestampPeriodNs: number; totalPassMs: number; stages: NativeProfilerNode[] };
  gpuTimingSupported?: boolean;
  gpuTimingEnabled?: boolean;
  /** Full request, native rendering, binary transfer and Canvas upload wall time. */
  transportMs?: number;
  /** Game paint entry through world preparation, before invoking the native request. */
  frontendPrepareMs?: number;
  /** Game completion callback entry through ownership checks and Canvas upload. */
  frontendCompleteMs?: number;
  commandMs?: number;
  sharedTransport?: SharedNativeViewportTransportProfile;
  worldRequest?: NativeViewportWorldRequestProfile;
  deferredRevisionRetries?: number;
  simulationMs?: number;
  worldRevision?: number;
  worldSyncMs?: number;
  worldLockWaitMs?: number;
  workerQueueMs?: number;
  rendererLockWaitMs?: number;
  simulationRequestMs?: number;
  /** Latest completed simulation request; its revision can differ from the rendered worldRevision. */
  simulationTiming?: Readonly<PlayStepTiming>;
  resourceSampleAgeMs?: number;
  resourceSampling?: { ready: boolean; pending: boolean; delayed?: boolean; unavailable: boolean; metadataMs: number | null };
  uploadMs?: number;
  nativeTransport?: 'shared-buffer' | 'binary-ipc';
  presentIntervalMs?: number;
  updateMode?: 'live' | 'edit-change' | 'edit-poll';
  pollIntervalMs?: number;
  memory: NativeProfilerMemoryCategory[];
  residentMemoryEstimateBytes: number;
  resources: NativeProfilerResource[];
  resourcesTruncated: boolean;
  counts: NativeProfilerCounts;
};

export type NativeViewportProfilePayload = Omit<NativeViewportProfile, 'source' | 'timestamp'>;

/** MiYu: background metadata duration is not part of the frame's CPU call tree. */
export function nativeResourceSampleStatus(profile: Pick<NativeViewportProfile, 'resourceSampling' | 'resourceSampleAgeMs'>): string {
  const sampling = profile.resourceSampling;
  if (sampling && !sampling.ready) return sampling.unavailable ? 'Resource sampler unavailable' : sampling.delayed ? 'Resource metadata delayed; rendering continues' : 'Sampling resource metadata…';
  const age = profile.resourceSampleAgeMs;
  const status = age != null && Number.isFinite(age) ? `sample age ${age.toFixed(0)} ms` : 'sample age unavailable';
  return `${status}${sampling?.unavailable ? ' · sampler unavailable; retained sample' : sampling?.delayed ? ' · metadata delayed; retained sample' : sampling?.pending ? ' · updating' : ''}${sampling?.metadataMs != null && Number.isFinite(sampling.metadataMs) ? ` · metadata worker ${sampling.metadataMs.toFixed(2)} ms` : ''}`;
}

/** MiYu: non-overlapping command scopes; simulation and GPU timestamps run on separate clocks. */
export function nativeViewportRequestStages(profile: NativeViewportProfile): { name: string; ms: number | undefined }[] {
  const stages = [
    { name: 'Worker queue', ms: profile.workerQueueMs },
    { name: 'World lock wait', ms: profile.worldLockWaitMs },
    { name: 'World sync', ms: profile.worldSyncMs },
    { name: 'Renderer lock wait', ms: profile.rendererLockWaitMs },
    { name: 'Native render (includes GPU wait)', ms: profile.totalMs },
  ];
  const measured = stages.every(stage => stage.ms != null && Number.isFinite(stage.ms));
  stages.push({ name: 'Other command work', ms: measured && profile.commandMs != null ? Math.max(0, profile.commandMs - stages.reduce((sum, stage) => sum + (stage.ms ?? 0), 0)) : undefined });
  stages.push({ name: 'IPC, delivery and upload', ms: profile.transportMs != null && profile.commandMs != null ? Math.max(0, profile.transportMs - profile.commandMs) : undefined });
  return stages;
}

export type ViewportProfilerFrame = {
  source: EditorProfilerSource;
  timestamp: number;
  frameIntervalMs: number;
  paintMs: number;
  /** Disjoint CPU scopes for completed canvas paints; excludes skipped request-only wakeups and asynchronous native work. */
  paintStages?: ViewportPaintStages;
  entities: number;
  drawItems: number;
  uiPrimitives: number;
  uiBatches: number;
  particles: number;
  spineSkeletons: number;
  viewportPixels: number;
};

export type EditorProfilerSample = Omit<ViewportProfilerFrame, 'frameIntervalMs' | 'paintMs' | 'paintStages'> & {
  sampleCount: number;
  frameMs: number;
  frameMaxMs: number;
  paintMs: number;
  paintMaxMs: number;
  paintStages?: ViewportPaintStageSamples;
};

export type EditorProfilerFrame = {
  timestamp: number;
  sample: EditorProfilerSample | null;
  nativeProfile: NativeViewportProfile | null;
};

export type NativeProfilerMemoryNode = NativeProfilerMemoryCategory & {
  id: string;
  children: NativeProfilerMemoryNode[];
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
  paintStageTotals: PaintStageTotals;
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
  paintStages?: ViewportPaintStageSamples;
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
  const paintStages = normalizePaintStages(frame.paintStages);
  return {
    source: frame.source,
    timestamp: frame.timestamp,
    frameIntervalMs: finiteNonNegative(frame.frameIntervalMs),
    paintMs: finiteNonNegative(frame.paintMs),
    ...(paintStages ? { paintStages } : {}),
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
    if (!bucket || frame.timestamp < bucket.startedAt || frame.frameIntervalMs === 0) {
      bucket = {
        source: frame.source,
        startedAt: frame.timestamp,
        sampleCount: 0,
        frameCount: 0,
        frameTotalMs: 0,
        frameMaxMs: 0,
        paintTotalMs: 0,
        paintMaxMs: 0,
        paintStageTotals: {},
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
    for (const key of paintStageKeys) if (frame.paintStages?.[key] != null) accumulatePaintStage(bucket.paintStageTotals, key, frame.paintStages[key]!);
    if (frame.timestamp - bucket.startedAt < interval) return null;

    const sample: EditorProfilerSample = {
      source: bucket.source,
      timestamp: frame.timestamp,
      sampleCount: bucket.sampleCount,
      frameMs: bucket.frameCount > 0 ? bucket.frameTotalMs / bucket.frameCount : 0,
      frameMaxMs: bucket.frameMaxMs,
      paintMs: bucket.sampleCount > 0 ? bucket.paintTotalMs / bucket.sampleCount : 0,
      paintMaxMs: bucket.paintMaxMs,
      ...(Object.keys(bucket.paintStageTotals).length ? { paintStages: paintStageSamples(bucket.paintStageTotals) } : {}),
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
      paintStageTotals: {},
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
  const stageTotals: PaintStageTotals = {};
  for (const sample of samples) for (const key of paintStageKeys) {
    const stage = sample.paintStages?.[key];
    if (stage) accumulatePaintStage(stageTotals, key, stage.averageMs, stage.maxMs, stage.sampleCount);
  }
  return {
    latest: samples[samples.length - 1],
    samples: samples.length,
    averageFrameMs: frameValues.reduce((sum, value) => sum + value, 0) / frameValues.length,
    p95FrameMs: percentile(frameValues, 0.95),
    peakFrameMs: Math.max(...samples.map((sample) => sample.frameMaxMs)),
    averagePaintMs: paintValues.reduce((sum, value) => sum + value, 0) / paintValues.length,
    p95PaintMs: percentile(paintValues, 0.95),
    peakPaintMs: Math.max(...samples.map((sample) => sample.paintMaxMs)),
    ...(Object.keys(stageTotals).length ? { paintStages: paintStageSamples(stageTotals) } : {}),
  };
}

/** MiYu: bounded diagnostic responses carry timings without copying resource inventories or call trees. */
export function nativeViewportTimingSample(profile: NativeViewportProfile) {
  const { source, timestamp, worldRevision, updateMode, nativeTransport, totalMs, transportMs, frontendPrepareMs, frontendCompleteMs, commandMs, simulationMs, simulationRequestMs, worldSyncMs, worldLockWaitMs, workerQueueMs, rendererLockWaitMs, uploadMs, presentIntervalMs } = profile;
  return { source, timestamp, worldRevision, entityCount: profile.counts?.entities, worldBundleBuilds: profile.counts?.worldBundleBuilds, worldBundleHits: profile.counts?.worldBundleHits, deferredRevisionRetries: profile.deferredRevisionRetries, updateMode, nativeTransport, totalMs, transportMs, frontendPrepareMs, frontendCompleteMs, commandMs, simulationMs, simulationRequestMs, simulationTiming: profile.simulationTiming ? { ...profile.simulationTiming, native: profile.simulationTiming.native && { ...profile.simulationTiming.native } } : undefined, worldSyncMs, worldLockWaitMs, workerQueueMs, rendererLockWaitMs, uploadMs, presentIntervalMs, renderSize: profile.renderSize?.slice(), sharedTransport: profile.sharedTransport ? { ...profile.sharedTransport } : undefined, worldRequest: profile.worldRequest ? { ...profile.worldRequest } : undefined };
}

/** Completed native frames, independent of WebView paints and bounded history length. */
export function summarizeNativeViewportProfiles(profiles: readonly NativeViewportProfile[]) {
  const intervals = profiles.map(profile => profile.presentIntervalMs ?? 0).filter(value => Number.isFinite(value) && value > 0);
  const averagePresentIntervalMs = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0;
  const requests = profiles.map(profile => profile.transportMs ?? 0).filter(value => Number.isFinite(value) && value > 0);
  const simulations = profiles.map(profile => profile.simulationMs).filter((value): value is number => value != null && Number.isFinite(value));
  const simulationRequests = profiles.map(profile => profile.simulationRequestMs).filter((value): value is number => value != null && Number.isFinite(value));
  const commands = profiles.map(profile => profile.commandMs).filter((value): value is number => value != null && Number.isFinite(value));
  const worldSyncs = profiles.map(profile => profile.worldSyncMs).filter((value): value is number => value != null && Number.isFinite(value));
  const uploads = profiles.map(profile => profile.uploadMs).filter((value): value is number => value != null && Number.isFinite(value));
  return {
    intervals: intervals.length,
    averagePresentIntervalMs,
    p95PresentIntervalMs: percentile(intervals, 0.95),
    presentedFps: averagePresentIntervalMs > 0 ? 1000 / averagePresentIntervalMs : 0,
    averageRequestMs: requests.length ? requests.reduce((sum, value) => sum + value, 0) / requests.length : 0,
    averageRenderMs: profiles.length ? profiles.reduce((sum, value) => sum + value.totalMs, 0) / profiles.length : 0,
    averageCommandMs: commands.length ? commands.reduce((sum, value) => sum + value, 0) / commands.length : null,
    averageUploadMs: uploads.length ? uploads.reduce((sum, value) => sum + value, 0) / uploads.length : null,
    averageWorldSyncMs: worldSyncs.length ? worldSyncs.reduce((sum, value) => sum + value, 0) / worldSyncs.length : null,
    averageSimulationMs: simulations.length ? simulations.reduce((sum, value) => sum + value, 0) / simulations.length : null,
    averageSimulationRequestMs: simulationRequests.length ? simulationRequests.reduce((sum, value) => sum + value, 0) / simulationRequests.length : null,
  };
}

function nearestTimestampValue<T extends { timestamp: number }>(
  values: readonly T[],
  timestamp: number,
): T | null {
  if (!values.length) return null;
  return values.reduce((nearest, candidate) => (
    Math.abs(candidate.timestamp - timestamp) < Math.abs(nearest.timestamp - timestamp)
      ? candidate
      : nearest
  ));
}

export function buildEditorProfilerFrames(
  inputSamples: readonly EditorProfilerSample[],
  inputNativeProfiles: readonly NativeViewportProfile[],
): EditorProfilerFrame[] {
  const orderedSamples = [...inputSamples].sort((left, right) => left.timestamp - right.timestamp);
  const orderedNativeProfiles = [...inputNativeProfiles]
    .sort((left, right) => left.timestamp - right.timestamp);
  if (orderedNativeProfiles.length) {
    return orderedNativeProfiles.map((nativeProfile) => ({
      timestamp: nativeProfile.timestamp,
      sample: nearestTimestampValue(orderedSamples, nativeProfile.timestamp),
      nativeProfile,
    }));
  }
  return orderedSamples.map((sample) => ({
    timestamp: sample.timestamp,
    sample,
    nativeProfile: null,
  }));
}

export function nearestEditorProfilerFrame(
  frames: readonly EditorProfilerFrame[],
  timestamp: number,
): EditorProfilerFrame | null {
  return nearestTimestampValue(frames, timestamp);
}

function memoryBranch(
  id: string,
  name: string,
  domain: string,
  children: NativeProfilerMemoryNode[],
): NativeProfilerMemoryNode {
  const certainties = new Set(children.map((child) => child.certainty));
  return {
    id,
    name,
    domain,
    bytes: children.reduce((total, child) => total + child.bytes, 0),
    certainty: certainties.size === 1 ? children[0]?.certainty ?? 'exact' : 'mixed',
    source: `${children.length} ${children.length === 1 ? 'entry' : 'entries'}`,
    children,
  };
}

export function buildNativeProfilerMemoryTree(
  profile: Pick<NativeViewportProfile, 'memory' | 'resources'>,
): NativeProfilerMemoryNode[] {
  const domains = new Map<string, NativeProfilerMemoryCategory[]>();
  for (const category of profile.memory) {
    const domain = category.domain.trim().toLowerCase() || 'other';
    const values = domains.get(domain) ?? [];
    values.push(category);
    domains.set(domain, values);
  }

  return [...domains.entries()].map(([domain, categories]) => {
    const direct: NativeProfilerMemoryNode[] = [];
    const groups = new Map<string, NativeProfilerMemoryNode[]>();
    categories.forEach((category, index) => {
      let group: string | null = null;
      let name = category.name;
      const slash = category.name.indexOf(' / ');
      if (slash > 0) {
        group = category.name.slice(0, slash);
        name = category.name.slice(slash + 3);
      } else if (/^GPU offscreen /i.test(category.name)) {
        group = 'Offscreen targets';
        name = category.name.replace(/^GPU offscreen /i, '');
      } else if (category.name.toLowerCase().startsWith(`${domain} `)) {
        name = category.name.slice(domain.length + 1);
      }

      const resourceChildren = /texture residency/i.test(category.name)
        ? profile.resources.flatMap((resource, resourceIndex) => (
            resource.gpuBytesEstimate == null
              ? []
              : [{
                  id: `memory:${domain}:${index}:resource:${resourceIndex}`,
                  name: resource.asset,
                  domain,
                  bytes: resource.gpuBytesEstimate,
                  certainty: 'estimate',
                  source: `${resource.kind}${resource.referencedBy.length ? ` · ${resource.referencedBy.join(', ')}` : ''}`,
                  children: [],
                }]
          ))
        : [];
      const node: NativeProfilerMemoryNode = {
        ...category,
        id: `memory:${domain}:${index}`,
        name,
        children: resourceChildren,
      };
      if (group) {
        const values = groups.get(group) ?? [];
        values.push(node);
        groups.set(group, values);
      } else {
        direct.push(node);
      }
    });
    const children = [
      ...direct,
      ...[...groups.entries()].map(([name, values], index) => (
        memoryBranch(`memory:${domain}:group:${index}`, name, domain, values)
      )),
    ];
    return memoryBranch(`memory:${domain}`, domain.toUpperCase(), domain, children);
  });
}

type ProfilerChannelMessage =
  | { type: 'sample'; sample: EditorProfilerSample }
  | { type: 'native-profile'; profile: NativeViewportProfile }
  | { type: 'clear' };

const CHANNEL_NAME = 'mengine.editor.profiler.v1';
const samples: EditorProfilerSample[] = [];
const nativeProfiles: NativeViewportProfile[] = [];
const nativeProfileCounts = { scene: 0, game: 0 };
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
  if (channel) return channel;
  let created: BroadcastChannel | null;
  try {
    created = createEditorBroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
  if (!created) return null;
  channel = created;
  created.addEventListener('message', (event: MessageEvent<ProfilerChannelMessage>) => {
    const message = event.data;
    if (message?.type === 'clear') {
      samples.length = 0;
      nativeProfiles.length = 0;
      nativeProfileCounts.scene = nativeProfileCounts.game = 0;
      notify();
      return;
    }
    if (message?.type === 'native-profile') {
      const profile = message.profile;
      if (!profile || (profile.source !== 'scene' && profile.source !== 'game')) return;
      appendNativeProfile(profile, false);
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
      ...(candidate.paintStages ? { paintStages: normalizePaintStageSamples(candidate.paintStages) } : {}),
      entities: normalizedFrame.entities,
      drawItems: normalizedFrame.drawItems,
      uiPrimitives: normalizedFrame.uiPrimitives,
      uiBatches: normalizedFrame.uiBatches,
      particles: normalizedFrame.particles,
      spineSkeletons: normalizedFrame.spineSkeletons,
      viewportPixels: normalizedFrame.viewportPixels,
    }, false);
  });
  return created;
}

export function recordViewportProfilerFrame(frame: ViewportProfilerFrame): void {
  const sample = sampler(frame);
  if (sample) appendSample(sample, true);
}

function appendNativeProfile(profile: NativeViewportProfile, broadcast: boolean): void {
  nativeProfiles.push(profile);
  if (++nativeProfileCounts[profile.source] > 240) {
    const oldest = nativeProfiles.findIndex((candidate) => candidate.source === profile.source);
    if (oldest >= 0) { nativeProfiles.splice(oldest, 1); nativeProfileCounts[profile.source]--; }
  }
  notify();
  if (broadcast) {
    profilerChannel()?.postMessage({ type: 'native-profile', profile } satisfies ProfilerChannelMessage);
  }
}

export function recordNativeViewportProfile(
  source: EditorProfilerSource,
  payload: NativeViewportProfilePayload,
  timestamp = performance.now(),
): void {
  if (payload.schemaVersion !== 1 || !Number.isFinite(payload.totalMs)) return;
  recordOwnedNativeViewportProfile(source, structuredClone(payload), timestamp);
}

/** Transfer a decoded frame's metadata to history; the caller must not mutate it afterward. */
export function recordOwnedNativeViewportProfile(source: EditorProfilerSource, payload: NativeViewportProfilePayload, timestamp = performance.now()): void {
  if (payload.schemaVersion !== 1 || !Number.isFinite(payload.totalMs)) return;
  let previous: NativeViewportProfile | undefined;
  for (let index = nativeProfiles.length - 1; index >= 0; index--) { if (nativeProfiles[index].source === source) { previous = nativeProfiles[index]; break; } }
  appendNativeProfile({ ...payload, source, timestamp, presentIntervalMs: previous ? timestamp - previous.timestamp : undefined }, true);
}

export function readNativeViewportProfiles(
  source?: EditorProfilerSource,
  copy = true,
): NativeViewportProfile[] {
  const profiles = nativeProfiles.filter((profile) => !source || profile.source === source);
  // Recorded entries are never mutated; the internal Profiler can retain them across UI refreshes.
  return copy ? profiles.map((profile) => structuredClone(profile)) : profiles;
}

export function readEditorProfilerSamples(
  source?: EditorProfilerSource,
): EditorProfilerSample[] {
  return samples.filter((sample) => !source || sample.source === source).map((sample) => ({ ...sample, ...(sample.paintStages ? { paintStages: normalizePaintStageSamples(sample.paintStages) } : {}) }));
}

export function clearEditorProfilerSamples(): void {
  samples.length = 0;
  nativeProfiles.length = 0;
  nativeProfileCounts.scene = nativeProfileCounts.game = 0;
  notify();
  profilerChannel()?.postMessage({ type: 'clear' } satisfies ProfilerChannelMessage);
}

export function subscribeEditorProfiler(listener: () => void): () => void {
  listeners.add(listener);
  profilerChannel();
  return () => listeners.delete(listener);
}
