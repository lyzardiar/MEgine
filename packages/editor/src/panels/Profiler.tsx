import { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearEditorProfilerSamples,
  readEditorProfilerSamples,
  subscribeEditorProfiler,
  summarizeEditorProfilerSamples,
  type EditorProfilerSample,
  type EditorProfilerSource,
} from '../editorProfiler';

const GRAPH_SAMPLES = 120;
const FRAME_BUDGET_MS = 1000 / 60;
const COUNT_FORMATTER = new Intl.NumberFormat();

function formatMs(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(value >= 10 ? 1 : 2)} ms` : '—';
}

function formatCount(value: number): string {
  return COUNT_FORMATTER.format(Math.max(0, Math.trunc(value)));
}

function ProfileGraph(props: {
  samples: EditorProfilerSample[];
  averageField: 'frameMs' | 'paintMs';
  peakField: 'frameMaxMs' | 'paintMaxMs';
  color: string;
  budget?: number;
  label: string;
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
  return (
    <section className="profiler-graph">
      <header><strong>{props.label}</strong><span>0–{maximum.toFixed(1)} ms</span></header>
      <svg viewBox="0 0 300 72" preserveAspectRatio="none" aria-label={`${props.label} history`}>
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
  const [source, setSource] = useState<EditorProfilerSource>('game');
  const [frozen, setFrozen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [samples, setSamples] = useState(() => readEditorProfilerSamples('game'));

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
    if (!visible) return undefined;
    if (!frozen) setSamples(readEditorProfilerSamples(source));
    return subscribeEditorProfiler(() => {
      if (!frozen) setSamples(readEditorProfilerSamples(source));
    });
  }, [frozen, source, visible]);

  const summary = useMemo(() => summarizeEditorProfilerSamples(samples), [samples]);
  const latest = summary.latest;
  const fps = latest && latest.frameMs > 0 ? 1000 / latest.frameMs : 0;
  const itemsPerBatch = latest && latest.uiBatches > 0
    ? latest.uiPrimitives / latest.uiBatches
    : latest?.uiPrimitives ? latest.uiPrimitives : 0;

  return (
    <div className="profiler-panel" ref={panelRef}>
      <div className="profiler-toolbar">
        <div className="profiler-source-tabs" role="tablist" aria-label="Profiler source">
          {(['scene', 'game'] as const).map((value) => (
            <button
              type="button"
              role="tab"
              aria-selected={source === value}
              className={source === value ? 'active' : ''}
              onClick={() => setSource(value)}
              key={value}
            >{value === 'scene' ? 'Scene' : 'Game'}</button>
          ))}
        </div>
        <span className={`profiler-record-state${frozen ? ' frozen' : ''}`}>
          <i />{frozen ? 'Frozen' : 'Recording'}
        </span>
        <button type="button" onClick={() => setFrozen((value) => !value)}>
          {frozen ? 'Resume' : 'Freeze'}
        </button>
        <button type="button" onClick={() => {
          clearEditorProfilerSamples();
          setSamples([]);
        }}>Clear</button>
      </div>

      {!latest ? (
        <div className="profiler-empty">
          <strong>No {source === 'scene' ? 'Scene' : 'Game'} samples</strong>
          <span>Open the {source === 'scene' ? 'Scene' : 'Game'} tab at a visible size to begin sampling.</span>
        </div>
      ) : (
        <div className="profiler-scroll">
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
            />
            <ProfileGraph
              samples={samples}
              averageField="paintMs"
              peakField="paintMaxMs"
              color="#7ac56b"
              label="Viewport CPU"
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
            Editor Canvas preview CPU metrics. UI batch count uses contiguous authoring-preview batches;
            it is not native Player GPU timing, memory, or draw-call capture.
          </div>
        </div>
      )}
    </div>
  );
}
