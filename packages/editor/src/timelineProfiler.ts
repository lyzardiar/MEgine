import { createEditorBroadcastChannel } from './editorInstance.ts';
import type { TimelineDependencyProfile } from './timelineDependencyProfile.ts';
import type { TimelineScenePreviewMetrics } from './timelineScenePreview.ts';

export const TIMELINE_PROFILER_SNAPSHOT_LIMIT = 32;

export interface TimelineProfilerSnapshot {
  version: 1;
  capturedAt: number;
  assetPath: string;
  assetName: string;
  sampleTime: number;
  previewEvaluated: boolean;
  previewActive: boolean;
  evaluationCapturedAt: number;
  evaluationMs: number;
  diagnostics: string[];
  dependency: TimelineDependencyProfile;
  evaluation: TimelineScenePreviewMetrics;
}

type TimelineProfilerChannelMessage =
  | { type: 'snapshot'; snapshot: TimelineProfilerSnapshot }
  | { type: 'clear' };

const CHANNEL_NAME = 'mengine.editor.timeline-profiler.v1';
const snapshots = new Map<string, TimelineProfilerSnapshot>();
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteCount(value: unknown): number {
  return Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(finiteNonNegative(value)));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function boundedText(value: unknown, maximum = 1_024): string {
  return typeof value === 'string' ? value.slice(0, maximum) : '';
}

function snapshotKey(path: string): string {
  return path.trim().replaceAll('\\', '/').toLowerCase();
}

function cloneSnapshot(snapshot: TimelineProfilerSnapshot): TimelineProfilerSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as TimelineProfilerSnapshot;
}

export function normalizeTimelineProfilerSnapshot(
  input: TimelineProfilerSnapshot,
): TimelineProfilerSnapshot | null {
  if (!input || input.version !== 1 || typeof input !== 'object') return null;
  const assetPath = boundedText(input.assetPath).trim().replaceAll('\\', '/');
  if (!assetPath) return null;
  const dependency = input.dependency;
  const evaluation = input.evaluation;
  if (!dependency || !evaluation || !Array.isArray(dependency.nodes) || !Array.isArray(dependency.edges)) {
    return null;
  }
  const nodes = dependency.nodes.slice(0, 256).flatMap((node) => (
    isObjectRecord(node) ? [{
      path: boundedText(node.path),
      name: boundedText(node.name, 256),
      depth: finiteCount(node.depth),
      duration: finiteNonNegative(node.duration),
      tracks: finiteCount(node.tracks),
      items: finiteCount(node.items),
    }] : []
  ));
  const edges = dependency.edges.slice(0, 2_048).flatMap((edge) => {
    if (!isObjectRecord(edge)) return [];
    return [{
      parentPath: boundedText(edge.parentPath),
      childPath: boundedText(edge.childPath),
      trackId: boundedText(edge.trackId, 256),
      trackName: boundedText(edge.trackName, 256),
      clipIndex: finiteCount(edge.clipIndex),
      depth: finiteCount(edge.depth),
      status: ['loaded', 'missing', 'cycle', 'depth-limit'].includes(String(edge.status))
        ? edge.status as TimelineDependencyProfile['edges'][number]['status']
        : 'missing' as const,
    }];
  });
  const normalizedMetrics: TimelineScenePreviewMetrics = {
    assetsEvaluated: finiteCount(evaluation.assetsEvaluated),
    tracksEvaluated: finiteCount(evaluation.tracksEvaluated),
    activeItems: finiteCount(evaluation.activeItems),
    targetResolutions: finiteCount(evaluation.targetResolutions),
    unresolvedTargets: finiteCount(evaluation.unresolvedTargets),
    maximumDepth: finiteCount(evaluation.maximumDepth),
    entityIndexCacheHits: finiteCount(evaluation.entityIndexCacheHits),
    entityIndexCacheMisses: finiteCount(evaluation.entityIndexCacheMisses),
    bindingTargetCacheHits: finiteCount(evaluation.bindingTargetCacheHits),
    bindingTargetCacheMisses: finiteCount(evaluation.bindingTargetCacheMisses),
    bindingTableCacheHits: finiteCount(evaluation.bindingTableCacheHits),
    bindingTableCacheMisses: finiteCount(evaluation.bindingTableCacheMisses),
  };
  return {
    version: 1,
    capturedAt: finiteNonNegative(input.capturedAt),
    assetPath,
    assetName: boundedText(input.assetName, 256),
    sampleTime: finiteNonNegative(input.sampleTime),
    previewEvaluated: Boolean(input.previewEvaluated),
    previewActive: Boolean(input.previewActive),
    evaluationCapturedAt: finiteNonNegative(input.evaluationCapturedAt),
    evaluationMs: finiteNonNegative(input.evaluationMs),
    diagnostics: (Array.isArray(input.diagnostics) ? input.diagnostics : [])
      .slice(0, 64)
      .map((message) => boundedText(message, 2_048)),
    dependency: {
      rootPath: boundedText(dependency.rootPath) || assetPath,
      nodes,
      edges,
      totalTracks: nodes.reduce((count, node) => count + node.tracks, 0),
      totalItems: nodes.reduce((count, node) => count + node.items, 0),
      maximumDepth: nodes.reduce((depth, node) => Math.max(depth, node.depth), 0),
      missingAssets: edges.filter((edge) => edge.status === 'missing').length,
      cycles: edges.filter((edge) => edge.status === 'cycle').length,
      depthLimited: edges.filter((edge) => edge.status === 'depth-limit').length,
      truncated: Boolean(dependency.truncated || nodes.length < dependency.nodes.length || edges.length < dependency.edges.length),
    },
    evaluation: normalizedMetrics,
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

function appendSnapshot(snapshot: TimelineProfilerSnapshot, broadcast: boolean): void {
  const key = snapshotKey(snapshot.assetPath);
  const existing = snapshots.get(key);
  if (existing && existing.capturedAt > snapshot.capturedAt) return;
  snapshots.delete(key);
  snapshots.set(key, snapshot);
  while (snapshots.size > TIMELINE_PROFILER_SNAPSHOT_LIMIT) {
    const oldest = snapshots.keys().next().value;
    if (typeof oldest !== 'string') break;
    snapshots.delete(oldest);
  }
  notify();
  if (broadcast) timelineProfilerChannel()?.postMessage({
    type: 'snapshot', snapshot,
  } satisfies TimelineProfilerChannelMessage);
}

function timelineProfilerChannel(): BroadcastChannel | null {
  if (channel) return channel;
  const created = createEditorBroadcastChannel(CHANNEL_NAME);
  if (!created) return null;
  channel = created;
  created.addEventListener('message', (event: MessageEvent<TimelineProfilerChannelMessage>) => {
    if (event.data?.type === 'clear') {
      snapshots.clear();
      notify();
      return;
    }
    if (event.data?.type !== 'snapshot') return;
    const normalized = normalizeTimelineProfilerSnapshot(event.data.snapshot);
    if (normalized) appendSnapshot(normalized, false);
  });
  return created;
}

/** Join the editor-instance channel before detached Timeline windows publish. */
export function initializeTimelineProfiler(): void {
  timelineProfilerChannel();
}

export function recordTimelineProfilerSnapshot(input: TimelineProfilerSnapshot): void {
  const snapshot = normalizeTimelineProfilerSnapshot(input);
  if (snapshot) appendSnapshot(snapshot, true);
}

export function readTimelineProfilerSnapshots(assetPath?: string): TimelineProfilerSnapshot[] {
  const key = assetPath ? snapshotKey(assetPath) : null;
  const values = key ? [snapshots.get(key)].filter(Boolean) : [...snapshots.values()];
  return (values as TimelineProfilerSnapshot[])
    .sort((left, right) => left.capturedAt - right.capturedAt)
    .map(cloneSnapshot);
}

export function clearTimelineProfilerSnapshots(): void {
  snapshots.clear();
  notify();
  timelineProfilerChannel()?.postMessage({ type: 'clear' } satisfies TimelineProfilerChannelMessage);
}

export function subscribeTimelineProfiler(listener: () => void): () => void {
  listeners.add(listener);
  timelineProfilerChannel();
  return () => listeners.delete(listener);
}
