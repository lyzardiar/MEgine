import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  buildEditorProfilerFrames,
  buildNativeProfilerMemoryTree,
  clearEditorProfilerSamples,
  editorProfilerUiRefreshDelay,
  nearestEditorProfilerFrame,
  readNativeViewportProfiles,
  readEditorProfilerSamples,
  subscribeEditorProfiler,
  summarizeEditorProfilerSamples,
  type EditorProfilerSample,
  type EditorProfilerFrame,
  type EditorProfilerSource,
  type NativeProfilerMemoryNode,
  type NativeProfilerNode,
  type NativeProfilerResource,
} from '../editorProfiler';
import {
  clearTimelineProfilerSnapshots,
  readTimelineProfilerSnapshots,
  subscribeTimelineProfiler,
} from '../timelineProfiler';
import { nextHorizontalTabIndex } from '../tabKeyboardNavigation';

const GRAPH_SAMPLES = 120;
const FRAME_BUDGET_MS = 1000 / 60;
const COUNT_FORMATTER = new Intl.NumberFormat();
const PROFILER_SOURCES = ['scene', 'game', 'timeline'] as const;
type ProfilerSource = EditorProfilerSource | 'timeline';
const PROFILER_MODULES = ['overview', 'cpu', 'memory', 'resources'] as const;
type ProfilerModule = typeof PROFILER_MODULES[number];
type SortDirection = 'asc' | 'desc';
type SortState<Key extends string> = { key: Key; direction: SortDirection };
type CpuSortKey = 'name' | 'totalMs' | 'selfMs' | 'frame' | 'calls';
type MemorySortKey = 'name' | 'domain' | 'bytes' | 'certainty' | 'source';
type ResourceSortKey = 'kind' | 'asset' | 'sourceBytes' | 'gpuBytesEstimate' | 'loaded' | 'referencedBy';

function formatMs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 1 : 2)} ms` : '—';
}

function formatCount(value: number): string {
  return COUNT_FORMATTER.format(Math.max(0, Math.trunc(value)));
}

function formatBytes(value: number | null | undefined): string {
  if (!Number.isFinite(value)) return '—';
  const bytes = Math.max(0, Number(value));
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function compareValues(left: string | number | boolean | null, right: string | number | boolean | null): number {
  if (typeof left === 'string' || typeof right === 'string') {
    return String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
  }
  return Number(left ?? 0) - Number(right ?? 0);
}

function sortedRows<Row, Key extends string>(
  rows: readonly Row[],
  sort: SortState<Key>,
  value: (row: Row, key: Key) => string | number | boolean | null,
): Row[] {
  const direction = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => direction * compareValues(value(left, sort.key), value(right, sort.key)));
}

type CpuTreeRow = {
  id: string;
  node: NativeProfilerNode;
  depth: number;
  expandable: boolean;
  expanded: boolean;
};

type MemoryTreeRow = {
  id: string;
  node: NativeProfilerMemoryNode;
  depth: number;
  expandable: boolean;
  expanded: boolean;
};

function cpuSortValue(node: NativeProfilerNode, key: CpuSortKey, frameMs: number): string | number {
  if (key === 'name') return node.name;
  if (key === 'frame') return frameMs > 0 ? node.totalMs / frameMs : 0;
  return node[key];
}

function flattenCallTree(
  root: NativeProfilerNode,
  sort: SortState<CpuSortKey>,
  collapsed: ReadonlySet<string>,
  query: string,
  frameMs: number,
): CpuTreeRow[] {
  const visit = (node: NativeProfilerNode, id: string, depth: number): { matches: boolean; rows: CpuTreeRow[] } => {
    const childResults = sortedRows(
      node.children.map((child, index) => ({ child, index })),
      sort,
      (entry, key) => cpuSortValue(entry.child, key, frameMs),
    ).map(({ child, index }) => visit(child, `${id}:${index}`, depth + 1));
    const matches = !query
      || node.name.toLowerCase().includes(query)
      || childResults.some((child) => child.matches);
    if (!matches) return { matches: false, rows: [] };
    const expanded = Boolean(node.children.length) && (!collapsed.has(id) || Boolean(query));
    return {
      matches: true,
      rows: [{ id, node, depth, expandable: node.children.length > 0, expanded },
        ...(expanded ? childResults.flatMap((child) => child.rows) : [])],
    };
  };
  return visit(root, 'cpu', 0).rows;
}

function memorySortValue(node: NativeProfilerMemoryNode, key: MemorySortKey): string | number {
  return node[key];
}

function flattenMemoryTree(
  roots: readonly NativeProfilerMemoryNode[],
  sort: SortState<MemorySortKey>,
  collapsed: ReadonlySet<string>,
  query: string,
): MemoryTreeRow[] {
  const visit = (node: NativeProfilerMemoryNode, depth: number): { matches: boolean; rows: MemoryTreeRow[] } => {
    const childResults = sortedRows(node.children, sort, memorySortValue)
      .map((child) => visit(child, depth + 1));
    const matches = !query
      || `${node.name} ${node.domain} ${node.certainty} ${node.source}`.toLowerCase().includes(query)
      || childResults.some((child) => child.matches);
    if (!matches) return { matches: false, rows: [] };
    const expanded = Boolean(node.children.length) && (!collapsed.has(node.id) || Boolean(query));
    return {
      matches: true,
      rows: [{
        id: node.id,
        node,
        depth,
        expandable: node.children.length > 0,
        expanded,
      }, ...(expanded ? childResults.flatMap((child) => child.rows) : [])],
    };
  };
  return sortedRows(roots, sort, memorySortValue).flatMap((root) => visit(root, 0).rows);
}

function nextSort<Key extends string>(current: SortState<Key>, key: Key): SortState<Key> {
  if (current.key !== key) return { key, direction: 'desc' };
  return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
}

function SortableHeader<Key extends string>(props: {
  label: string;
  column: Key;
  sort: SortState<Key>;
  onSort: (next: SortState<Key>) => void;
}) {
  const active = props.sort.key === props.column;
  const Icon = !active ? ArrowUpDown : props.sort.direction === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th aria-sort={!active ? 'none' : props.sort.direction === 'asc' ? 'ascending' : 'descending'}>
      <button type="button" onClick={() => props.onSort(nextSort(props.sort, props.column))}>
        <span>{props.label}</span><Icon size={11} aria-hidden="true" />
      </button>
    </th>
  );
}

function ProfileGraph(props: {
  samples: EditorProfilerSample[];
  averageField: 'frameMs' | 'paintMs';
  peakField: 'frameMaxMs' | 'paintMaxMs';
  color: string;
  budget?: number;
  label: string;
  selectedTimestamp: number | null;
  onSelect: (sample: EditorProfilerSample) => void;
}) {
  const values = props.samples.slice(-GRAPH_SAMPLES);
  const maximum = Math.max(
    props.budget ?? 0,
    1,
    ...values.map((sample) => sample[props.peakField]),
  ) * 1.12;
  const points = (field: typeof props.averageField | typeof props.peakField) => values
    .map((sample, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * 300;
      const y = 68 - Math.min(1, sample[field] / maximum) * 64;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const budgetY = props.budget == null
    ? null
    : 68 - Math.min(1, props.budget / maximum) * 64;
  const selectedIndex = props.selectedTimestamp == null
    ? values.length - 1
    : values.findIndex((sample) => sample.timestamp === props.selectedTimestamp);
  const selectedX = selectedIndex < 0 || values.length <= 1
    ? null
    : selectedIndex / (values.length - 1) * 300;
  const selectAtClientX = (clientX: number, element: SVGSVGElement) => {
    if (!values.length) return;
    const rect = element.getBoundingClientRect();
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 1;
    props.onSelect(values[Math.round(ratio * (values.length - 1))]);
  };
  return (
    <section className="profiler-graph">
      <header><strong>{props.label}</strong><span>0–{maximum.toFixed(1)} ms</span></header>
      <svg
        role="slider"
        tabIndex={0}
        aria-label={`${props.label} frame history`}
        aria-valuemin={1}
        aria-valuemax={Math.max(1, values.length)}
        aria-valuenow={Math.max(1, selectedIndex + 1)}
        viewBox="0 0 300 72"
        preserveAspectRatio="none"
        onPointerDown={(event) => selectAtClientX(event.clientX, event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
          event.preventDefault();
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          const index = Math.max(0, Math.min(values.length - 1, selectedIndex + direction));
          if (values[index]) props.onSelect(values[index]);
        }}
      >
        <path className="profiler-grid" d="M0 20H300 M0 36H300 M0 52H300" />
        {budgetY != null && (
          <path className="profiler-budget" d={`M0 ${budgetY.toFixed(2)}H300`} />
        )}
        {values.length > 0 && (
          <>
            <polyline className="profiler-peak-line" points={points(props.peakField)} />
            <polyline
              className="profiler-average-line"
              style={{ stroke: props.color }}
              points={points(props.averageField)}
            />
          </>
        )}
        {selectedX != null && <path className="profiler-selected-frame-line" d={`M${selectedX.toFixed(2)} 0V72`} />}
      </svg>
    </section>
  );
}

function Metric(props: { label: string; value: string; hint?: string; warning?: boolean }) {
  return (
    <div className={`profiler-metric${props.warning ? ' warning' : ''}`}>
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      {props.hint && <small>{props.hint}</small>}
    </div>
  );
}

export function Profiler() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [source, setSource] = useState<ProfilerSource>('game');
  const [module, setModule] = useState<ProfilerModule>('overview');
  const [filter, setFilter] = useState('');
  const [frozen, setFrozen] = useState(false);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);
  const [cpuSort, setCpuSort] = useState<SortState<CpuSortKey>>({ key: 'totalMs', direction: 'desc' });
  const [memorySort, setMemorySort] = useState<SortState<MemorySortKey>>({ key: 'bytes', direction: 'desc' });
  const [resourceSort, setResourceSort] = useState<SortState<ResourceSortKey>>({ key: 'gpuBytesEstimate', direction: 'desc' });
  const [collapsedCpuNodes, setCollapsedCpuNodes] = useState<Set<string>>(() => new Set());
  const [collapsedMemoryNodes, setCollapsedMemoryNodes] = useState<Set<string>>(() => new Set());
  const [visible, setVisible] = useState(true);
  const [samples, setSamples] = useState(() => readEditorProfilerSamples('game'));
  const [nativeProfiles, setNativeProfiles] = useState(() => readNativeViewportProfiles('game'));
  const [timelineSnapshots, setTimelineSnapshots] = useState(readTimelineProfilerSnapshots);

  useEffect(() => {
    setSelectedTimestamp(null);
    setFrozen(false);
    setFilter('');
  }, [source]);

  useEffect(() => {
    const element = panelRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => {
      setVisible(element.clientWidth > 0 && element.clientHeight > 0);
    });
    observer.observe(element);
    setVisible(element.clientWidth > 0 && element.clientHeight > 0);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || frozen) return undefined;
    let refreshTimer: number | null = null;
    let lastPublishedAt = Number.NEGATIVE_INFINITY;
    const publish = () => {
      refreshTimer = null;
      lastPublishedAt = performance.now();
      if (source === 'timeline') setTimelineSnapshots(readTimelineProfilerSnapshots());
      else {
        setSamples(readEditorProfilerSamples(source));
        setNativeProfiles(readNativeViewportProfiles(source));
      }
    };
    const schedule = () => {
      const delay = editorProfilerUiRefreshDelay(
        lastPublishedAt,
        performance.now(),
        document.hasFocus(),
      );
      if (delay <= 0) {
        if (refreshTimer != null) {
          window.clearTimeout(refreshTimer);
          refreshTimer = null;
        }
        publish();
      } else if (refreshTimer == null) {
        refreshTimer = window.setTimeout(publish, delay);
      }
    };
    publish();
    const unsubscribe = source === 'timeline'
      ? subscribeTimelineProfiler(schedule)
      : subscribeEditorProfiler(schedule);
    return () => {
      unsubscribe();
      if (refreshTimer != null) window.clearTimeout(refreshTimer);
    };
  }, [frozen, source, visible]);

  const summary = useMemo(() => summarizeEditorProfilerSamples(samples), [samples]);
  const frames = useMemo(
    () => buildEditorProfilerFrames(samples, nativeProfiles),
    [nativeProfiles, samples],
  );
  const frameSelectionIndex = selectedTimestamp == null
    ? frames.length - 1
    : frames.findIndex((frame) => frame.timestamp === selectedTimestamp);
  const selectedFrame = frameSelectionIndex >= 0 ? frames[frameSelectionIndex] : frames.at(-1) ?? null;
  const latest = selectedFrame?.sample ?? null;
  const latestNative = selectedFrame?.nativeProfile ?? null;
  const normalizedFilter = filter.trim().toLowerCase();
  const cpuRows = useMemo(() => (
    latestNative
      ? flattenCallTree(
          latestNative.callTree,
          cpuSort,
          collapsedCpuNodes,
          normalizedFilter,
          latestNative.totalMs,
        )
      : []
  ), [collapsedCpuNodes, cpuSort, latestNative, normalizedFilter]);
  const memoryTree = useMemo(
    () => latestNative ? buildNativeProfilerMemoryTree(latestNative) : [],
    [latestNative],
  );
  const memoryRows = useMemo(
    () => flattenMemoryTree(memoryTree, memorySort, collapsedMemoryNodes, normalizedFilter),
    [collapsedMemoryNodes, memorySort, memoryTree, normalizedFilter],
  );
  const resources = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const rows = (latestNative?.resources ?? []).filter((resource) => (
      !query
      || resource.asset.toLowerCase().includes(query)
      || resource.kind.toLowerCase().includes(query)
      || resource.referencedBy.some((reference) => reference.toLowerCase().includes(query))
    ));
    return sortedRows(rows, resourceSort, (row: NativeProfilerResource, key) => (
      key === 'referencedBy' ? row.referencedBy.join(', ') : row[key]
    ));
  }, [filter, latestNative, resourceSort]);
  const latestTimeline = timelineSnapshots.at(-1) ?? null;
  const timelineHotspots = useMemo(() => (
    latestTimeline?.dependency.nodes
      .slice()
      .sort((left, right) => right.items - left.items || right.tracks - left.tracks || left.path.localeCompare(right.path))
      .slice(0, 12) ?? []
  ), [latestTimeline]);
  const timelineIssues = latestTimeline?.dependency.edges.filter((edge) => edge.status !== 'loaded') ?? [];
  const timelineCacheHits = latestTimeline
    ? latestTimeline.evaluation.entityIndexCacheHits
      + latestTimeline.evaluation.bindingTargetCacheHits
      + latestTimeline.evaluation.bindingTableCacheHits
    : 0;
  const timelineCacheMisses = latestTimeline
    ? latestTimeline.evaluation.entityIndexCacheMisses
      + latestTimeline.evaluation.bindingTargetCacheMisses
      + latestTimeline.evaluation.bindingTableCacheMisses
    : 0;
  const timelineCacheTotal = timelineCacheHits + timelineCacheMisses;
  const fps = latest && latest.frameMs > 0 ? 1000 / latest.frameMs : 0;
  const itemsPerBatch = latest && latest.uiBatches > 0
    ? latest.uiPrimitives / latest.uiBatches
    : latest?.uiPrimitives ? latest.uiPrimitives : 0;
  const selectFrame = (frame: EditorProfilerFrame) => {
    setSelectedTimestamp(frame.timestamp);
    setFrozen(true);
  };
  const selectSample = (sample: EditorProfilerSample) => {
    const frame = nearestEditorProfilerFrame(frames, sample.timestamp);
    if (frame) selectFrame(frame);
  };
  const toggleCpuNode = (id: string) => setCollapsedCpuNodes((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleMemoryNode = (id: string) => setCollapsedMemoryNodes((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const returnToLive = () => {
    setSelectedTimestamp(null);
    setFrozen(false);
  };

  return (
    <div className="profiler-panel" ref={panelRef}>
      <div className="profiler-toolbar">
        <div className="profiler-source-tabs" role="tablist" aria-label="Profiler source">
          {PROFILER_SOURCES.map((value, index) => (
            <button
              id={`profiler-source-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={source === value}
              aria-controls="profiler-source-panel"
              tabIndex={source === value ? 0 : -1}
              className={source === value ? 'active' : ''}
              onClick={() => setSource(value)}
              onKeyDown={(event) => {
                const nextIndex = nextHorizontalTabIndex(
                  PROFILER_SOURCES.length,
                  index,
                  event.key,
                );
                if (nextIndex == null) return;
                event.preventDefault();
                event.stopPropagation();
                const nextSource = PROFILER_SOURCES[nextIndex];
                setSource(nextSource);
                document
                  .getElementById(`profiler-source-tab-${nextSource}`)
                  ?.focus({ preventScroll: true });
              }}
              key={value}
            >{value === 'scene' ? 'Scene' : value === 'game' ? 'Game' : 'Timeline'}</button>
          ))}
        </div>
        <span className={`profiler-record-state${frozen ? ' frozen' : ''}`}>
          <i />{frozen ? 'Frozen' : 'Recording'}
        </span>
        <button type="button" aria-pressed={frozen} onClick={() => {
          if (frozen) returnToLive();
          else {
            const frame = frames.at(-1);
            if (frame) selectFrame(frame);
            else setFrozen(true);
          }
        }}>
          {frozen ? 'Resume' : 'Freeze'}
        </button>
        <button type="button" onClick={() => {
          clearEditorProfilerSamples();
          clearTimelineProfilerSnapshots();
          setSamples([]);
          setNativeProfiles([]);
          setTimelineSnapshots([]);
          setSelectedTimestamp(null);
        }}>Clear</button>
      </div>

      {source === 'timeline' ? (!latestTimeline ? (
        <div
          id="profiler-source-panel"
          className="profiler-empty"
          role="tabpanel"
          aria-labelledby="profiler-source-tab-timeline"
        >
          <strong>No Timeline profile</strong>
          <span>Open a Timeline asset to inspect its dependency graph and preview evaluation cost.</span>
        </div>
      ) : (
        <div
          id="profiler-source-panel"
          className="profiler-scroll profiler-timeline"
          role="tabpanel"
          aria-labelledby="profiler-source-tab-timeline"
        >
          <header className="profiler-timeline-header">
            <strong>{latestTimeline.assetName}</strong>
            <span title={latestTimeline.assetPath}>{latestTimeline.assetPath}</span>
          </header>
          <div className="profiler-metrics profiler-metrics-primary" aria-label="Timeline evaluation metrics">
            <Metric
              label="Evaluation"
              value={latestTimeline.previewEvaluated
                ? formatMs(latestTimeline.evaluationMs)
                : 'Not sampled'}
              hint={latestTimeline.previewEvaluated
                ? `${latestTimeline.previewActive ? 'at' : 'last at'} ${latestTimeline.sampleTime.toFixed(3)} s`
                : 'Enable edit-mode preview and bind a Timeline Director'}
              warning={latestTimeline.previewEvaluated && latestTimeline.evaluationMs > 4}
            />
            <Metric
              label="Dependencies"
              value={formatCount(latestTimeline.dependency.nodes.length)}
              hint={`${formatCount(latestTimeline.dependency.edges.length)} Control edges`}
              warning={timelineIssues.length > 0}
            />
            <Metric
              label="Evaluated Tracks"
              value={latestTimeline.previewEvaluated
                ? formatCount(latestTimeline.evaluation.tracksEvaluated)
                : '—'}
              hint={latestTimeline.previewEvaluated
                ? `${formatCount(latestTimeline.evaluation.activeItems)} active items`
                : 'No preview evaluation'}
            />
            <Metric
              label="Index Cache"
              value={latestTimeline.previewEvaluated && timelineCacheTotal
                ? `${(timelineCacheHits / timelineCacheTotal * 100).toFixed(0)}%`
                : '—'}
              hint={latestTimeline.previewEvaluated
                ? `${formatCount(timelineCacheHits)} hits · ${formatCount(timelineCacheMisses)} misses`
                : 'No preview evaluation'}
            />
          </div>

          <section className="profiler-timeline-section" aria-label="Timeline dependency hotspots">
            <h3>Dependency Hotspots</h3>
            <table>
              <thead><tr><th>Timeline</th><th>Depth</th><th>Tracks</th><th>Items</th></tr></thead>
              <tbody>{timelineHotspots.map((node) => <tr key={node.path}>
                <td title={node.path}>{node.name || node.path}</td>
                <td>{node.depth}</td>
                <td>{formatCount(node.tracks)}</td>
                <td>{formatCount(node.items)}</td>
              </tr>)}</tbody>
            </table>
          </section>

          <section className="profiler-timeline-section" aria-label="Timeline dependency issues">
            <h3>Dependency Issues <span>{timelineIssues.length}</span></h3>
            {timelineIssues.length ? <ul>{timelineIssues.slice(0, 32).map((edge) => <li key={`${edge.parentPath}:${edge.trackId}:${edge.clipIndex}`}>
              <strong>{edge.status}</strong>
              <span>{edge.trackName} → {edge.childPath}</span>
            </li>)}</ul> : <p>No missing, cyclic, or depth-limited dependencies.</p>}
          </section>

          <div className="profiler-scope-note">
            Timeline Editor preview dependency and CPU evaluation telemetry. Last evaluation is retained while
            the Timeline panel is inactive; this is not native Player execution timing.
          </div>
        </div>
      )) : !latest && !latestNative ? (
        <div
          id="profiler-source-panel"
          className="profiler-empty"
          role="tabpanel"
          aria-labelledby={`profiler-source-tab-${source}`}
        >
          <strong>No {source === 'scene' ? 'Scene' : 'Game'} samples</strong>
          <span>Open the {source === 'scene' ? 'Scene' : 'Game'} tab at a visible size to begin sampling.</span>
        </div>
      ) : (
        <div
          id="profiler-source-panel"
          className="profiler-scroll"
          role="tabpanel"
          aria-labelledby={`profiler-source-tab-${source}`}
        >
          <div className="profiler-module-bar" role="tablist" aria-label="Profiler module">
            {PROFILER_MODULES.map((value) => (
              <button
                type="button"
                role="tab"
                aria-selected={module === value}
                className={module === value ? 'active' : ''}
                onClick={() => {
                  setModule(value);
                  setFilter('');
                }}
                key={value}
              >{value === 'cpu' ? 'CPU' : value[0].toUpperCase() + value.slice(1)}</button>
            ))}
          </div>

          <div className="profiler-frame-navigator" aria-label="Profiler frame selection">
            <button
              type="button"
              aria-label="Previous frame"
              disabled={frameSelectionIndex <= 0}
              onClick={() => frames[frameSelectionIndex - 1] && selectFrame(frames[frameSelectionIndex - 1])}
            ><ChevronLeft size={14} aria-hidden="true" /></button>
            <input
              type="range"
              min={0}
              max={Math.max(0, frames.length - 1)}
              value={Math.max(0, frameSelectionIndex)}
              disabled={frames.length < 2}
              aria-label="Selected frame"
              onChange={(event) => frames[Number(event.target.value)] && selectFrame(frames[Number(event.target.value)])}
            />
            <button
              type="button"
              aria-label="Next frame"
              disabled={frameSelectionIndex < 0 || frameSelectionIndex >= frames.length - 1}
              onClick={() => frames[frameSelectionIndex + 1] && selectFrame(frames[frameSelectionIndex + 1])}
            ><ChevronRight size={14} aria-hidden="true" /></button>
            <span>
              {frames.length
                ? `${latestNative ? 'Native frame' : 'Frame'} ${frameSelectionIndex + 1} / ${frames.length}`
                : 'No frames'}
              {latestNative && latest
                ? ` · WebView sample Δ ${Math.abs(latestNative.timestamp - latest.timestamp).toFixed(0)} ms`
                : ''}
            </span>
            <button type="button" className={!frozen && selectedTimestamp == null ? 'active' : ''} aria-pressed={!frozen && selectedTimestamp == null} onClick={returnToLive}>
              Live
            </button>
          </div>

          {module === 'overview' && <div className="profiler-metrics profiler-metrics-primary">
            <Metric
              label="Native Render"
              value={latestNative ? formatMs(latestNative.totalMs) : '—'}
              hint={latestNative ? `${latestNative.callTree.children.length} instrumented calls` : 'Desktop RHI sample unavailable'}
              warning={Boolean(latestNative && latestNative.totalMs > FRAME_BUDGET_MS)}
            />
            <Metric
              label="Resident Estimate"
              value={formatBytes(latestNative?.residentMemoryEstimateBytes)}
              hint="provenance in Memory"
            />
            <Metric label="Native Draw Calls" value={latestNative ? formatCount(latestNative.counts.uiDrawCalls) : '—'} />
            <Metric label="Render Resources" value={latestNative ? formatCount(latestNative.resources.length) : '—'} />
          </div>}

          {module === 'overview' && latest && <>
          <div className="profiler-metrics profiler-metrics-primary">
            <Metric
              label="Frame"
              value={formatMs(latest.frameMs)}
              hint={`${fps.toFixed(1)} FPS · p95 ${formatMs(summary.p95FrameMs)}`}
              warning={summary.p95FrameMs > FRAME_BUDGET_MS}
            />
            <Metric
              label="Viewport CPU"
              value={formatMs(latest.paintMs)}
              hint={`peak ${formatMs(summary.peakPaintMs)}`}
              warning={summary.p95PaintMs > 8}
            />
            <Metric
              label="UI Batches"
              value={formatCount(latest.uiBatches)}
              hint={`${itemsPerBatch.toFixed(1)} primitives / batch`}
              warning={latest.uiPrimitives > 8 && itemsPerBatch < 2}
            />
            <Metric
              label="Draw Items"
              value={formatCount(latest.drawItems)}
              hint={`${formatCount(latest.entities)} scene entities`}
            />
          </div>

          <div className="profiler-graphs">
            <ProfileGraph
              samples={samples}
              averageField="frameMs"
              peakField="frameMaxMs"
              color="#55b8d0"
              budget={FRAME_BUDGET_MS}
              label="Frame Interval"
              selectedTimestamp={latest?.timestamp ?? null}
              onSelect={selectSample}
            />
            <ProfileGraph
              samples={samples}
              averageField="paintMs"
              peakField="paintMaxMs"
              color="#7ac56b"
              label="Viewport CPU"
              selectedTimestamp={latest?.timestamp ?? null}
              onSelect={selectSample}
            />
          </div>

          <div className="profiler-metrics profiler-metrics-secondary">
            <Metric label="UI Primitives" value={formatCount(latest.uiPrimitives)} />
            <Metric label="Particles" value={formatCount(latest.particles)} />
            <Metric label="Spine" value={formatCount(latest.spineSkeletons)} />
            <Metric label="Viewport" value={`${(latest.viewportPixels / 1_000_000).toFixed(2)} MP`} />
            <Metric label="Samples" value={formatCount(summary.samples)} hint="2 minute rolling history" />
            <Metric label="Peak Frame" value={formatMs(summary.peakFrameMs)} />
          </div>

          <div className="profiler-scope-note">
            WebView frame/paint telemetry is shown beside instrumented native editor-host and RHI work.
            GPU bytes are explicit estimates; driver timing and process-wide heap sampling are not claimed.
          </div>
          </>}

          {module === 'cpu' && <section className="profiler-detail-section" aria-label="Native CPU call tree">
            <header>
              <div><strong>Native CPU Call Tree</strong><span>{latestNative ? formatMs(latestNative.totalMs) : 'No sample'}</span></div>
              <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter function…" aria-label="Filter profiler functions" />
            </header>
            {latestNative ? <table className="profiler-detail-table">
              <thead><tr>
                <SortableHeader label="Function" column="name" sort={cpuSort} onSort={setCpuSort} />
                <SortableHeader label="Total" column="totalMs" sort={cpuSort} onSort={setCpuSort} />
                <SortableHeader label="Self" column="selfMs" sort={cpuSort} onSort={setCpuSort} />
                <SortableHeader label="Frame" column="frame" sort={cpuSort} onSort={setCpuSort} />
                <SortableHeader label="Calls" column="calls" sort={cpuSort} onSort={setCpuSort} />
              </tr></thead>
              <tbody>{cpuRows.map(({ id, node, depth, expandable, expanded }) => <tr key={id}>
                <td title={node.name}><div className="profiler-tree-cell" style={{ paddingLeft: depth * 14 }}>
                  {expandable ? <button
                    type="button"
                    className="profiler-tree-toggle"
                    aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
                    aria-expanded={expanded}
                    onClick={() => toggleCpuNode(id)}
                  >{expanded
                    ? <ChevronDown size={12} aria-hidden="true" />
                    : <ChevronRight size={12} aria-hidden="true" />}</button>
                    : <span className="profiler-tree-spacer" />}
                  <span>{node.name}</span>
                </div></td>
                <td>{formatMs(node.totalMs)}</td><td>{formatMs(node.selfMs)}</td>
                <td>{latestNative.totalMs > 0 ? `${(node.totalMs / latestNative.totalMs * 100).toFixed(1)}%` : '—'}</td>
                <td>{formatCount(node.calls)}</td>
              </tr>)}</tbody>
            </table> : <p>No native profile. Keep the {source === 'scene' ? 'Scene' : 'Game'} viewport visible.</p>}
          </section>}

          {module === 'memory' && <section className="profiler-detail-section" aria-label="Native memory provenance">
            <header>
              <div><strong>Memory Provenance</strong><span>expand CPU/GPU systems to allocation and resource sources</span></div>
              <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter allocation…" aria-label="Filter profiler memory" />
            </header>
            {latestNative ? <>
              <div className="profiler-metrics profiler-metrics-secondary">
                <Metric label="CPU" value={formatBytes(latestNative.memory.filter((item) => item.domain === 'cpu').reduce((sum, item) => sum + item.bytes, 0))} />
                <Metric label="GPU" value={formatBytes(latestNative.memory.filter((item) => item.domain === 'gpu').reduce((sum, item) => sum + item.bytes, 0))} />
                <Metric label="Texture Estimate" value={formatBytes(latestNative.memory.find((item) => item.name === 'GPU texture residency')?.bytes)} />
                <Metric label="Readback Exact" value={formatBytes(latestNative.memory.find((item) => item.name === 'CPU readback RGBA')?.bytes)} />
              </div>
              <table className="profiler-detail-table">
                <thead><tr>
                  <SortableHeader label="Allocation source" column="name" sort={memorySort} onSort={setMemorySort} />
                  <SortableHeader label="Domain" column="domain" sort={memorySort} onSort={setMemorySort} />
                  <SortableHeader label="Bytes" column="bytes" sort={memorySort} onSort={setMemorySort} />
                  <SortableHeader label="Certainty" column="certainty" sort={memorySort} onSort={setMemorySort} />
                  <SortableHeader label="Provenance" column="source" sort={memorySort} onSort={setMemorySort} />
                </tr></thead>
                <tbody>{memoryRows.map(({ id, node, depth, expandable, expanded }) => <tr key={id}>
                  <td title={node.name}><div className="profiler-tree-cell" style={{ paddingLeft: depth * 14 }}>
                    {expandable ? <button
                      type="button"
                      className="profiler-tree-toggle"
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
                      aria-expanded={expanded}
                      onClick={() => toggleMemoryNode(id)}
                    >{expanded
                      ? <ChevronDown size={12} aria-hidden="true" />
                      : <ChevronRight size={12} aria-hidden="true" />}</button>
                      : <span className="profiler-tree-spacer" />}
                    <span>{node.name}</span>
                  </div></td>
                  <td>{node.domain.toUpperCase()}</td><td>{formatBytes(node.bytes)}</td>
                  <td><span className={`profiler-certainty ${node.certainty}`}>{node.certainty}</span></td>
                  <td title={node.source}>{node.source}</td>
                </tr>)}</tbody>
              </table>
            </> : <p>No native memory snapshot. Keep the viewport visible.</p>}
          </section>}

          {module === 'resources' && <section className="profiler-detail-section" aria-label="Native render resources">
            <header>
              <div><strong>Render-bound Resources</strong><span>{latestNative ? `${resources.length}/${latestNative.resources.length}${latestNative.resourcesTruncated ? '+' : ''}` : 'No sample'}</span></div>
              <input type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter asset or type…" aria-label="Filter profiler resources" />
            </header>
            {latestNative ? <table className="profiler-detail-table profiler-resource-table">
              <thead><tr>
                <SortableHeader label="Type" column="kind" sort={resourceSort} onSort={setResourceSort} />
                <SortableHeader label="Asset" column="asset" sort={resourceSort} onSort={setResourceSort} />
                <SortableHeader label="Source" column="sourceBytes" sort={resourceSort} onSort={setResourceSort} />
                <SortableHeader label="GPU est." column="gpuBytesEstimate" sort={resourceSort} onSort={setResourceSort} />
                <SortableHeader label="Status" column="loaded" sort={resourceSort} onSort={setResourceSort} />
                <SortableHeader label="Used by" column="referencedBy" sort={resourceSort} onSort={setResourceSort} />
              </tr></thead>
              <tbody>{resources.map((resource) => <tr key={`${resource.kind}:${resource.asset}`}>
                <td>{resource.kind}</td><td title={resource.resolvedPath ?? resource.asset}>{resource.asset}</td>
                <td>{formatBytes(resource.sourceBytes)}</td><td>{formatBytes(resource.gpuBytesEstimate)}</td>
                <td className={resource.loaded ? 'profiler-resource-loaded' : 'profiler-resource-missing'}>{resource.loaded ? 'resident' : 'missing'}</td>
                <td>{resource.referencedBy.join(', ')}</td>
              </tr>)}</tbody>
            </table> : <p>No native resource snapshot. Keep the viewport visible.</p>}
          </section>}
        </div>
      )}
    </div>
  );
}
