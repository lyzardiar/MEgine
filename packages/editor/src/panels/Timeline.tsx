import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { WorldSnapshotView } from '@mengine/api';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Circle,
  ClipboardPaste,
  Code2,
  Copy,
  Crosshair,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Trash2,
  Redo2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  advanceAnimationPreviewPhase,
  addAnimationEvent,
  automaticAnimationTangent,
  createAnimationClip,
  normalizeAnimationClip,
  pasteAnimationEvent,
  parseAnimationClip,
  removeAnimationEvent,
  replaceAnimationEvent,
  replaceAnimationKeyframe,
  sampleAnimationClip,
  sampleAnimationTrack,
  serializeAnimationClip,
  setAnimationKeyframeTangents,
  snapAnimationTime,
  upsertAnimationKeyframe,
  wrappedAnimationTime,
  type AnimationClip,
  type AnimationEvent,
  type AnimationKeyframe,
  type AnimationSample,
  type AnimationTangent,
  type AnimationTrack,
  type AnimationValue,
} from '../animationClip';
import { parseAnimatorController } from '../animatorController';
import {
  animationBindingKey,
  groupAnimationPropertyBindings,
  listAnimationPropertyBindings,
  navigateAnimationPropertyBindingIndex,
  parseAnimationBindingKey,
  searchAnimationPropertyBindings,
} from '../animationBindings';
import {
  animationCurveChannelCount,
  animationCurveCoordinates,
  animationCurvePoint,
  animationCurveSlopeFromPoint,
  animationCurveTangentHandle,
  animationCurveValueBounds,
  curveNumericChannels,
  moveAnimationCurveKey,
  setAnimationCurveTangentChannel,
  setAnimationCurveTangentsAuto,
  setAnimationCurveTangentsFlat,
  type AnimationCurvePoint,
  type AnimationCurveViewport,
} from '../animationCurveEditing.ts';
import type {
  EditorUndoCheckpoint,
  EditorUndoService,
  EditorUndoToken,
} from '../editorUndoService';
import {
  clampTimelineKeyDelta,
  copyTimelineKeySelection,
  mergeTimelineKeySelection,
  moveTimelineKeySelection,
  normalizeTimelineKeySelection,
  pasteTimelineKeySelection,
  retimeTimelineKeySelection,
  removeTimelineKeySelection,
  timelineKeyRangeSelection,
  timelineKeyNudgeFrames,
  timelineKeySelectionFrameRange,
  timelineKeysInRange,
  toggleTimelineKeySelection,
  type TimelineKeyClipboardItem,
  type TimelineKeyRef,
} from '../timelineKeyEditing.ts';
import { registerMenuItem } from '../editorWindow';
import {
  listProjectFiles,
  normalizeProjectAssetPath,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerSaveAllParticipant } from '../saveAll';

type SnapshotEntity = WorldSnapshotView['entities'][number];

export const OPEN_ANIMATION_CLIP_EVENT = 'mengine:open-animation-clip';

export function openAnimationClipAsset(path: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_ANIMATION_CLIP_EVENT, { detail: path }));
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'timeline' }));
}

type AnimationPlayerData = {
  clip?: string;
  play_on_awake?: boolean;
  playing?: boolean;
  speed?: number;
  time?: number;
};

type TimelineKeyDrag = {
  kind: 'key';
  pointerId: number;
  active: TimelineKeyRef;
  activeTime: number;
  selection: TimelineKeyRef[];
  delta: number;
  left: number;
  width: number;
};

type TimelineEventDrag = {
  kind: 'event';
  pointerId: number;
  index: number;
  authoredTime: number;
  time: number;
  left: number;
  width: number;
};

type TimelineDrag = TimelineKeyDrag | TimelineEventDrag;

type TimelineViewMode = 'dope_sheet' | 'curves';

type TimelineMarquee = {
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  additive: boolean;
  base: TimelineKeyRef[];
};

type TimelineClipboard =
  | {
      kind: 'keys';
      keys: TimelineKeyClipboardItem[];
    }
  | {
      kind: 'event';
      event: AnimationEvent;
    };

function playerOf(entity: SnapshotEntity | null): AnimationPlayerData | null {
  const value = entity?.components.AnimationPlayer;
  return value != null && typeof value === 'object'
    ? value as AnimationPlayerData
    : null;
}

type AnimatorData = {
  controller?: string;
  current_state?: string;
  speed?: number;
};

function animatorOf(entity: SnapshotEntity | null): AnimatorData | null {
  const value = entity?.components.Animator;
  return value != null && typeof value === 'object' ? value as AnimatorData : null;
}

function animationValue(value: unknown): AnimationValue | null {
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value) && value.length > 0) {
    const numbers = value.map(Number);
    return numbers.every(Number.isFinite) ? numbers : null;
  }
  return null;
}

function getProperty(source: unknown, path: string): AnimationValue | null {
  let cursor = source;
  for (const segment of path.split('.').map((part) => part.trim()).filter(Boolean)) {
    if (cursor == null || typeof cursor !== 'object') return null;
    const key: string | number = Array.isArray(cursor) && /^\d+$/.test(segment)
      ? Number(segment)
      : segment;
    cursor = (cursor as Record<string | number, unknown>)[key];
  }
  return animationValue(cursor);
}

function targetEntity(
  entities: SnapshotEntity[],
  root: SnapshotEntity,
  target: string,
): SnapshotEntity | null {
  const normalized = target.trim();
  if (!normalized || normalized === '.') return root;
  if (/^\d+$/.test(normalized)) {
    return entities.find((entity) => entity.entity === Number(normalized)) ?? null;
  }
  let current: SnapshotEntity | null = root;
  for (const segment of normalized.replace(/^\.\//, '').split('/').filter(Boolean)) {
    current = entities.find(
      (entity) => (entity.parent ?? null) === current!.entity && entity.name === segment,
    ) ?? null;
    if (!current) return null;
  }
  return current;
}

function valueLabel(value: AnimationValue): string {
  if (Array.isArray(value)) return `[${value.map((part) => Number(part.toFixed(3))).join(', ')}]`;
  if (typeof value === 'number') return String(Number(value.toFixed(3)));
  return String(value);
}

const CURVE_COLORS = ['#f06b6b', '#6fd36f', '#64a8ff', '#f0cf61'];

function AnimationCurvePreview(props: {
  track: AnimationTrack;
  duration: number;
  time: number;
}) {
  const first = curveNumericChannels(props.track.keyframes[0]?.value ?? null);
  if (!first) return null;
  const width = 640;
  const height = 128;
  const duration = Math.max(props.duration, Number.EPSILON);
  const samples = Array.from({ length: 129 }, (_unused, index) => {
    const sampleTime = duration * index / 128;
    return { time: sampleTime, channels: curveNumericChannels(sampleAnimationTrack(props.track, sampleTime)) };
  });
  const values = samples.flatMap((sample) => sample.channels?.slice(0, CURVE_COLORS.length) ?? []);
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) return null;
  if (Math.abs(maximum - minimum) < 1e-6) {
    minimum -= 0.5;
    maximum += 0.5;
  }
  const y = (value: number) => height - (value - minimum) / (maximum - minimum) * height;
  return (
    <div className="timeline-curve-editor">
      <header>
        <strong>Curve</strong>
        <span>{minimum.toFixed(3)} to {maximum.toFixed(3)}</span>
      </header>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Animation curve preview">
        <line className="timeline-curve-midline" x1="0" y1={height / 2} x2={width} y2={height / 2} />
        {first.slice(0, CURVE_COLORS.length).map((_channel, channel) => (
          <polyline
            key={channel}
            fill="none"
            stroke={CURVE_COLORS[channel]}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            points={samples.map((sample) => {
              const value = sample.channels?.[channel] ?? 0;
              return `${sample.time / duration * width},${y(value)}`;
            }).join(' ')}
          />
        ))}
        {props.track.keyframes.flatMap((key, keyIndex) => (
          (curveNumericChannels(key.value) ?? []).slice(0, CURVE_COLORS.length).map((value, channel) => (
            <circle
              key={`${keyIndex}:${channel}`}
              cx={key.time / duration * width}
              cy={y(value)}
              r="3"
              fill={CURVE_COLORS[channel]}
              vectorEffect="non-scaling-stroke"
            />
          ))
        ))}
        <line
          className="timeline-curve-playhead"
          x1={props.time / duration * width}
          y1="0"
          x2={props.time / duration * width}
          y2={height}
        />
      </svg>
    </div>
  );
}

type AnimationCurveWorkspaceDrag =
  | {
      kind: 'key';
      pointerId: number;
      keyIndex: number;
      channel: number;
      time: number;
      value: number;
    }
  | {
      kind: 'tangent';
      pointerId: number;
      keyIndex: number;
      channel: number;
      side: 'in_tangent' | 'out_tangent';
      slope: number;
      point: AnimationCurvePoint;
    };

const CURVE_VIEW_WIDTH = 1000;
const CURVE_VIEW_HEIGHT = 420;

function AnimationCurveWorkspace(props: {
  track: AnimationTrack | null;
  trackIndex: number | null;
  duration: number;
  frameRate: number;
  time: number;
  zoom: number;
  selectedKey: TimelineKeyRef | null;
  onSelectKey: (key: TimelineKeyRef) => void;
  onPreviewTime: (time: number) => void;
  onCommitKey: (keyIndex: number, channel: number, time: number, value: number) => void;
  onCommitTangent: (
    keyIndex: number,
    channel: number,
    side: 'in_tangent' | 'out_tangent',
    slope: number,
  ) => void;
  onSetTangents: (mode: 'auto' | 'flat') => void;
  onEnableCubic: () => void;
}) {
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [drag, setDrag] = useState<AnimationCurveWorkspaceDrag | null>(null);
  const [viewCenter, setViewCenter] = useState(props.time);
  const dragRef = useRef<AnimationCurveWorkspaceDrag | null>(null);
  const track = props.track;
  const channelCount = track ? animationCurveChannelCount(track) : 0;

  useEffect(() => {
    setSelectedChannel((channel) => Math.max(0, Math.min(channelCount - 1, channel)));
    dragRef.current = null;
    setDrag(null);
  }, [props.trackIndex, channelCount]);

  useEffect(() => {
    if (!dragRef.current) setViewCenter(props.time);
  }, [props.time, props.trackIndex]);

  if (!track || props.trackIndex == null || channelCount === 0) {
    return (
      <div className="timeline-curve-workspace timeline-curve-workspace-empty">
        <strong>Curve View</strong>
        <span>Select a numeric property track to edit its animation curves.</span>
      </div>
    );
  }

  const safeDuration = Math.max(props.duration, 1 / Math.max(1, props.frameRate));
  const visibleSpan = Math.max(1 / Math.max(1, props.frameRate), safeDuration / Math.max(1, props.zoom));
  const timeStart = Math.max(0, Math.min(safeDuration - visibleSpan, viewCenter - visibleSpan / 2));
  const timeEnd = timeStart + visibleSpan;
  const bounds = animationCurveValueBounds(track, timeStart, timeEnd);
  if (!bounds) {
    return (
      <div className="timeline-curve-workspace timeline-curve-workspace-empty">
        <strong>Curve View</strong>
        <span>This track does not contain editable numeric keyframes.</span>
      </div>
    );
  }

  const viewport: AnimationCurveViewport = {
    ...bounds,
    timeStart,
    timeEnd,
    width: CURVE_VIEW_WIDTH,
    height: CURVE_VIEW_HEIGHT,
    paddingLeft: 48,
    paddingRight: 14,
    paddingTop: 14,
    paddingBottom: 28,
  };
  const channels = curveNumericChannels(track.keyframes[0]?.value ?? null)?.slice(0, CURVE_COLORS.length) ?? [];
  const samples = Array.from({ length: 241 }, (_unused, index) => {
    const sampleTime = timeStart + visibleSpan * index / 240;
    return {
      time: sampleTime,
      channels: curveNumericChannels(sampleAnimationTrack(track, sampleTime)),
    };
  });
  const selectedKeyIndex = props.selectedKey?.track === props.trackIndex
    ? props.selectedKey.key
    : null;
  const selectedKeyframe = selectedKeyIndex == null ? null : track.keyframes[selectedKeyIndex] ?? null;
  const selectedValues = curveNumericChannels(selectedKeyframe?.value ?? null);
  const keyPoint = selectedKeyframe && selectedValues?.[selectedChannel] != null
    ? animationCurvePoint(viewport, selectedKeyframe.time, selectedValues[selectedChannel])
    : null;
  const tangentHandles = keyPoint && selectedKeyIndex != null && track.interpolation === 'cubic'
    ? (['in_tangent', 'out_tangent'] as const).map((side) => {
        if (side === 'in_tangent' && selectedKeyIndex === 0) return null;
        if (side === 'out_tangent' && selectedKeyIndex === track.keyframes.length - 1) return null;
        const authored = animationCurveTangentHandle(
          track,
          selectedKeyIndex,
          side,
          selectedChannel,
          viewport,
        );
        const preview = drag?.kind === 'tangent'
          && drag.keyIndex === selectedKeyIndex
          && drag.channel === selectedChannel
          && drag.side === side
          ? drag.point
          : authored;
        return preview ? { side, point: preview } : null;
      }).filter((handle): handle is { side: 'in_tangent' | 'out_tangent'; point: AnimationCurvePoint } => handle != null)
    : [];

  const pointerCoordinates = (
    clientX: number,
    clientY: number,
    svg: SVGSVGElement,
  ) => {
    const rect = svg.getBoundingClientRect();
    return animationCurveCoordinates(
      viewport,
      (clientX - rect.left) / Math.max(1, rect.width) * CURVE_VIEW_WIDTH,
      (clientY - rect.top) / Math.max(1, rect.height) * CURVE_VIEW_HEIGHT,
    );
  };

  const beginKeyDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    keyIndex: number,
    channel: number,
    time: number,
    value: number,
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedChannel(channel);
    props.onSelectKey({ track: props.trackIndex!, key: keyIndex });
    props.onPreviewTime(time);
    const next: AnimationCurveWorkspaceDrag = {
      kind: 'key',
      pointerId: event.pointerId,
      keyIndex,
      channel,
      time,
      value,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const beginTangentDrag = (
    event: ReactPointerEvent<SVGCircleElement>,
    side: 'in_tangent' | 'out_tangent',
    point: AnimationCurvePoint,
  ) => {
    if (selectedKeyIndex == null || !selectedKeyframe || !selectedValues) return;
    const slope = animationCurveSlopeFromPoint(
      selectedKeyframe.time,
      selectedValues[selectedChannel],
      animationCurveCoordinates(viewport, point.x, point.y).time,
      animationCurveCoordinates(viewport, point.x, point.y).value,
    );
    if (slope == null) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next: AnimationCurveWorkspaceDrag = {
      kind: 'tangent',
      pointerId: event.pointerId,
      keyIndex: selectedKeyIndex,
      channel: selectedChannel,
      side,
      slope,
      point,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const moveCurveDrag = (event: ReactPointerEvent<SVGCircleElement>) => {
    const current = dragRef.current;
    const svg = event.currentTarget.ownerSVGElement;
    if (!current || !svg || current.pointerId !== event.pointerId) return;
    const coordinates = pointerCoordinates(event.clientX, event.clientY, svg);
    if (current.kind === 'key') {
      const next: AnimationCurveWorkspaceDrag = {
        ...current,
        time: snapAnimationTime(coordinates.time, props.frameRate, props.duration),
        value: coordinates.value,
      };
      dragRef.current = next;
      setDrag(next);
      props.onPreviewTime(next.time);
      return;
    }
    if (!selectedKeyframe || selectedValues?.[current.channel] == null) return;
    const slope = animationCurveSlopeFromPoint(
      selectedKeyframe.time,
      selectedValues[current.channel],
      coordinates.time,
      coordinates.value,
    );
    if (slope == null) return;
    const next: AnimationCurveWorkspaceDrag = {
      ...current,
      slope,
      point: animationCurvePoint(viewport, coordinates.time, coordinates.value),
    };
    dragRef.current = next;
    setDrag(next);
  };

  const finishCurveDrag = (event: ReactPointerEvent<SVGCircleElement>, commit: boolean) => {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDrag(null);
    if (!commit) return;
    if (current.kind === 'key') {
      setViewCenter(current.time);
      props.onCommitKey(current.keyIndex, current.channel, current.time, current.value);
    } else {
      props.onCommitTangent(current.keyIndex, current.channel, current.side, current.slope);
    }
  };

  return (
    <div className="timeline-curve-workspace">
      <header>
        <div className="timeline-curve-title">
          <strong>{track.component}.{track.property}</strong>
          <span>{timeStart.toFixed(3)}–{timeEnd.toFixed(3)} s · {bounds.minimum.toFixed(3)}–{bounds.maximum.toFixed(3)}</span>
        </div>
        <div className="timeline-curve-legend" aria-label="Curve channels">
          {channels.map((_value, channel) => (
            <button
              type="button"
              key={channel}
              className={selectedChannel === channel ? 'active' : ''}
              aria-pressed={selectedChannel === channel}
              onClick={() => setSelectedChannel(channel)}
            >
              <i style={{ background: CURVE_COLORS[channel] }} />{['X', 'Y', 'Z', 'W'][channel] ?? channel + 1}
            </button>
          ))}
        </div>
        <div className="timeline-curve-tangent-tools">
          <span>{track.interpolation === 'cubic' ? 'Tangents' : `${track.interpolation} interpolation`}</span>
          {track.interpolation === 'cubic' ? <>
            <button type="button" disabled={selectedKeyIndex == null} onClick={() => props.onSetTangents('auto')}>Auto</button>
            <button type="button" disabled={selectedKeyIndex == null} onClick={() => props.onSetTangents('flat')}>Flat</button>
          </> : (
            <button type="button" onClick={props.onEnableCubic}>Use Cubic</button>
          )}
        </div>
      </header>
      <svg
        viewBox={`0 0 ${CURVE_VIEW_WIDTH} ${CURVE_VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        aria-label="Editable animation curve"
        onPointerDown={(event) => {
          const target = event.target as SVGElement;
          if (target.closest('.timeline-curve-key, .timeline-curve-tangent')) return;
          const coordinates = pointerCoordinates(event.clientX, event.clientY, event.currentTarget);
          props.onPreviewTime(snapAnimationTime(coordinates.time, props.frameRate, props.duration));
        }}
      >
        <rect className="timeline-curve-plot" x={viewport.paddingLeft} y={viewport.paddingTop} width={CURVE_VIEW_WIDTH - viewport.paddingLeft - viewport.paddingRight} height={CURVE_VIEW_HEIGHT - viewport.paddingTop - viewport.paddingBottom} />
        {Array.from({ length: 11 }, (_unused, index) => {
          const x = viewport.paddingLeft + (CURVE_VIEW_WIDTH - viewport.paddingLeft - viewport.paddingRight) * index / 10;
          const labelTime = timeStart + visibleSpan * index / 10;
          return <g key={`time:${index}`}><line className="timeline-curve-grid-line" x1={x} y1={viewport.paddingTop} x2={x} y2={CURVE_VIEW_HEIGHT - viewport.paddingBottom} /><text className="timeline-curve-axis-label" x={x + 3} y={CURVE_VIEW_HEIGHT - 8}>{labelTime.toFixed(2)}</text></g>;
        })}
        {Array.from({ length: 9 }, (_unused, index) => {
          const y = viewport.paddingTop + (CURVE_VIEW_HEIGHT - viewport.paddingTop - viewport.paddingBottom) * index / 8;
          const labelValue = bounds.maximum - (bounds.maximum - bounds.minimum) * index / 8;
          return <g key={`value:${index}`}><line className="timeline-curve-grid-line" x1={viewport.paddingLeft} y1={y} x2={CURVE_VIEW_WIDTH - viewport.paddingRight} y2={y} /><text className="timeline-curve-axis-label" x="4" y={y + 4}>{labelValue.toFixed(2)}</text></g>;
        })}
        {channels.map((_value, channel) => (
          <polyline
            key={channel}
            fill="none"
            stroke={CURVE_COLORS[channel]}
            strokeWidth={selectedChannel === channel ? 2.5 : 1.5}
            opacity={selectedChannel === channel ? 1 : 0.72}
            vectorEffect="non-scaling-stroke"
            points={samples.map((sample) => {
              const value = sample.channels?.[channel] ?? 0;
              const point = animationCurvePoint(viewport, sample.time, value);
              return `${point.x},${point.y}`;
            }).join(' ')}
          />
        ))}
        {tangentHandles.map((handle) => (
          <g key={handle.side}>
            <line className="timeline-curve-tangent-line" x1={keyPoint!.x} y1={keyPoint!.y} x2={handle.point.x} y2={handle.point.y} />
            <circle
              role="button"
              tabIndex={0}
              aria-label={`${handle.side === 'in_tangent' ? 'In' : 'Out'} tangent handle`}
              className="timeline-curve-tangent"
              cx={handle.point.x}
              cy={handle.point.y}
              r="5"
              onPointerDown={(event) => beginTangentDrag(event, handle.side, handle.point)}
              onPointerMove={moveCurveDrag}
              onPointerUp={(event) => finishCurveDrag(event, true)}
              onPointerCancel={(event) => finishCurveDrag(event, false)}
            />
          </g>
        ))}
        {track.keyframes.flatMap((key, keyIndex) => {
          if (key.time < timeStart || key.time > timeEnd) return [];
          const values = curveNumericChannels(key.value) ?? [];
          const displayTime = drag?.kind === 'key' && drag.keyIndex === keyIndex ? drag.time : key.time;
          return values.slice(0, CURVE_COLORS.length).map((value, channel) => {
            const displayValue = drag?.kind === 'key' && drag.keyIndex === keyIndex && drag.channel === channel
              ? drag.value
              : value;
            const point = animationCurvePoint(viewport, displayTime, displayValue);
            const selected = selectedKeyIndex === keyIndex && selectedChannel === channel;
            return (
              <circle
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`Curve key ${keyIndex + 1} channel ${channel + 1} at ${displayTime.toFixed(3)} seconds`}
                className={`timeline-curve-key${selected ? ' selected' : ''}`}
                key={`${keyIndex}:${channel}`}
                cx={point.x}
                cy={point.y}
                r={selected ? 6 : 4.5}
                fill={CURVE_COLORS[channel]}
                onPointerDown={(event) => beginKeyDrag(event, keyIndex, channel, key.time, value)}
                onPointerMove={moveCurveDrag}
                onPointerUp={(event) => finishCurveDrag(event, true)}
                onPointerCancel={(event) => finishCurveDrag(event, false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedChannel(channel);
                    props.onSelectKey({ track: props.trackIndex!, key: keyIndex });
                    props.onPreviewTime(key.time);
                  }
                }}
              />
            );
          });
        })}
        {props.time >= timeStart && props.time <= timeEnd && (() => {
          const point = animationCurvePoint(viewport, props.time, bounds.minimum);
          return <line className="timeline-curve-playhead" x1={point.x} y1={viewport.paddingTop} x2={point.x} y2={CURVE_VIEW_HEIGHT - viewport.paddingBottom} />;
        })()}
      </svg>
    </div>
  );
}

function KeyframeValueEditor(props: {
  value: AnimationValue;
  onChange: (value: AnimationValue) => void;
  label?: string;
}) {
  const label = props.label ?? 'Value';
  const ariaLabel = label === 'Value' ? 'Keyframe value' : `Keyframe ${label.toLowerCase()}`;
  if (typeof props.value === 'boolean') {
    return (
      <label className="timeline-key-bool">
        {label}
        <input
          aria-label={ariaLabel}
          type="checkbox"
          checked={props.value}
          onChange={(event) => props.onChange(event.target.checked)}
        />
      </label>
    );
  }
  if (Array.isArray(props.value)) {
    const values = props.value;
    return (
      <label className="timeline-key-vector">
        {label}
        <span>
          {values.map((part, index) => (
            <input
              key={index}
              aria-label={`${ariaLabel} ${index + 1}`}
              type="number"
              step="any"
              value={part}
              onChange={(event) => {
                if (!Number.isFinite(event.target.valueAsNumber)) return;
                const next = [...values];
                next[index] = event.target.valueAsNumber;
                props.onChange(next);
              }}
            />
          ))}
        </span>
      </label>
    );
  }
  return (
    <label>
      {label}
      <input
        aria-label={ariaLabel}
        type={typeof props.value === 'number' ? 'number' : 'text'}
        step={typeof props.value === 'number' ? 'any' : undefined}
        value={props.value}
        onChange={(event) => {
          if (typeof props.value === 'number') {
            if (Number.isFinite(event.target.valueAsNumber)) {
              props.onChange(event.target.valueAsNumber);
            }
          } else {
            props.onChange(event.target.value);
          }
        }}
      />
    </label>
  );
}

function AnimationEventParameterEditor(props: {
  value: AnimationValue | null;
  onChange: (value: AnimationValue | null) => void;
}) {
  const kind = props.value == null
    ? 'none'
    : Array.isArray(props.value)
      ? 'vector'
      : typeof props.value;
  return (
    <>
      <label>
        Parameter
        <select
          aria-label="Animation event parameter type"
          value={kind}
          onChange={(event) => {
            const next = event.target.value;
            props.onChange(next === 'none'
              ? null
              : next === 'number'
                ? 0
                : next === 'boolean'
                  ? false
                  : next === 'vector'
                    ? [0, 0, 0]
                    : '');
          }}
        >
          <option value="none">None</option>
          <option value="string">String</option>
          <option value="number">Number</option>
          <option value="boolean">Boolean</option>
          <option value="vector">Vector</option>
        </select>
      </label>
      {props.value != null && (
        <KeyframeValueEditor value={props.value} onChange={props.onChange} />
      )}
    </>
  );
}

function safeClipName(raw: string): string {
  return raw
    .trim()
    .replace(/\.manim$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 80);
}

function uniqueClipPath(name: string): string {
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  let suffix = 1;
  let path = `Assets/Animations/${name}.manim`;
  while (used.has(path.toLowerCase())) {
    suffix += 1;
    path = `Assets/Animations/${name} ${suffix}.manim`;
  }
  return path;
}

export async function createProjectAnimationClip(name = 'New Animation'): Promise<string> {
  await refreshProjectFiles();
  const safe = safeClipName(name) || 'New Animation';
  const path = uniqueClipPath(safe);
  await writeProjectAssetText(path, serializeAnimationClip(createAnimationClip(safe)));
  await refreshProjectFiles();
  window.dispatchEvent(new CustomEvent('mengine:project-assets-changed'));
  openAnimationClipAsset(path);
  return path;
}

registerMenuItem(
  'Assets/Create/Animation Clip',
  async (context) => {
    try {
      context.log(`Created ${await createProjectAnimationClip()}`);
    } catch (reason) {
      context.log(`Animation Clip 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 205 },
);

function trackValue(
  entities: SnapshotEntity[],
  root: SnapshotEntity,
  track: AnimationTrack,
): AnimationValue | null {
  const target = targetEntity(entities, root, track.target);
  return getProperty(target?.components[track.component], track.property);
}

function recordingTrackKey(track: AnimationTrack, index: number): string {
  return `${index}\u0000${track.target}\u0000${track.component}\u0000${track.property}`;
}

function recordingValueToken(value: AnimationValue | null): string | null {
  return value == null ? null : JSON.stringify(value);
}

type AnimationHistorySnapshot = {
  clip: AnimationClip;
  time: number;
  selectedTrack: number | null;
  selectedKey: { track: number; key: number } | null;
  selectedKeys: TimelineKeyRef[];
  selectedEvent: number | null;
};

type AnimationDraft = AnimationHistorySnapshot & {
  savedText: string;
};

type AnimationEditTransaction = AnimationHistorySnapshot & {
  checkpoint: EditorUndoCheckpoint;
  token: EditorUndoToken | null;
};

function animationDraftDirty(draft: Pick<AnimationDraft, 'clip' | 'savedText'>): boolean {
  return serializeAnimationClip(draft.clip) !== draft.savedText;
}

function isAnimationEditControl(target: EventTarget): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (!(target instanceof HTMLElement) || target.closest('[data-animation-history="ignore"]')) return false;
  if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
}

export function Timeline(props: {
  assetPath?: string | null;
  onCloseAsset?: () => void;
  entity: SnapshotEntity | null;
  entities: SnapshotEntity[];
  authoredEntities: SnapshotEntity[];
  onAddComponent: (entity: number, type: string, value: Record<string, unknown>) => void;
  onPatchComponent: (entity: number, type: string, patch: Record<string, unknown>) => void;
  onPreview: (entity: number, samples: AnimationSample[]) => void;
  onClearPreview: () => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  undoService: EditorUndoService;
  onGlobalUndo: () => void;
  onGlobalRedo: () => void;
}) {
  const directAsset = props.assetPath?.trim() ?? '';
  const player = directAsset ? null : playerOf(props.entity);
  const animator = directAsset ? null : animatorOf(props.entity);
  const [animatorClipPath, setAnimatorClipPath] = useState('');
  const [animatorStateSpeed, setAnimatorStateSpeed] = useState(1);
  const [animatorStateName, setAnimatorStateName] = useState('');
  const clipPath = directAsset || (animator ? animatorClipPath : player?.clip?.trim() ?? '');
  const [clip, setClipState] = useState<AnimationClip | null>(null);
  const [savedText, setSavedText] = useState('');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<{ track: number; key: number } | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<TimelineKeyRef[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newClipName, setNewClipName] = useState('');
  const [showNewClip, setShowNewClip] = useState(false);
  const [propertyPath, setPropertyPath] = useState('Transform.position');
  const [manualPropertyOpen, setManualPropertyOpen] = useState(false);
  const [propertyPickerOpen, setPropertyPickerOpen] = useState(false);
  const [propertyPopupPlacement, setPropertyPopupPlacement] = useState<'above' | 'below'>('below');
  const [propertyPopupStyle, setPropertyPopupStyle] = useState<CSSProperties>({});
  const [propertySearch, setPropertySearch] = useState('');
  const [activePropertyBindingKey, setActivePropertyBindingKey] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<TimelineViewMode>('dope_sheet');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [timelineClipboard, setTimelineClipboard] = useState<TimelineClipboard | null>(null);
  const [timelineDrag, setTimelineDrag] = useState<TimelineDrag | null>(null);
  const timelineDragRef = useRef<TimelineDrag | null>(null);
  const [timelineMarquee, setTimelineMarquee] = useState<TimelineMarquee | null>(null);
  const timelineMarqueeRef = useRef<TimelineMarquee | null>(null);
  const scrubPointer = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const propertyPickerRef = useRef<HTMLDivElement>(null);
  const propertyPopupRef = useRef<HTMLDivElement>(null);
  const propertySearchRef = useRef<HTMLInputElement>(null);
  const propertyOptionRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectionDetailsRef = useRef<HTMLElement | null>(null);
  const playbackFrame = useRef<number | null>(null);
  const previousFrameTime = useRef<number | null>(null);
  const playbackPhase = useRef<number | null>(null);
  const recordingValues = useRef(new Map<string, string | null>());
  const loadedClipPath = useRef('');
  const drafts = useRef(new Map<string, AnimationDraft>());
  const [, setDraftEpoch] = useState(0);
  const clipRef = useRef<AnimationClip | null>(null);
  const timeRef = useRef(0);
  const selectedTrackRef = useRef<number | null>(null);
  const selectedKeyRef = useRef<{ track: number; key: number } | null>(null);
  const selectedKeysRef = useRef<TimelineKeyRef[]>([]);
  const selectedEventRef = useRef<number | null>(null);
  const editTransaction = useRef<AnimationEditTransaction | null>(null);
  const keyboardNudgeKey = useRef<string | null>(null);
  clipRef.current = clip;
  timeRef.current = time;
  selectedTrackRef.current = selectedTrack;
  selectedKeyRef.current = selectedKey;
  selectedKeysRef.current = selectedKeys;
  selectedEventRef.current = selectedEvent;

  const replaceClip = (next: AnimationClip | null) => {
    clipRef.current = next;
    setClipState(next);
  };

  const captureDocument = (path: string): AnimationHistorySnapshot => {
    if (loadedClipPath.current === path && clipRef.current) {
      return {
        clip: structuredClone(clipRef.current),
        time: timeRef.current,
        selectedTrack: selectedTrackRef.current,
        selectedKey: selectedKeyRef.current ? { ...selectedKeyRef.current } : null,
        selectedKeys: structuredClone(selectedKeysRef.current),
        selectedEvent: selectedEventRef.current,
      };
    }
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Animation history document '${path}' is no longer available.`);
    return {
      clip: structuredClone(draft.clip),
      time: draft.time,
      selectedTrack: draft.selectedTrack,
      selectedKey: draft.selectedKey ? { ...draft.selectedKey } : null,
      selectedKeys: structuredClone(draft.selectedKeys),
      selectedEvent: draft.selectedEvent,
    };
  };

  const restoreDocument = (path: string, snapshot: AnimationHistorySnapshot) => {
    const restored = structuredClone(snapshot);
    restored.time = Math.max(0, Math.min(restored.clip.duration, restored.time));
    if (loadedClipPath.current === path) {
      editTransaction.current = null;
      replaceClip(restored.clip);
      playbackPhase.current = restored.time;
      timeRef.current = restored.time;
      setTime(restored.time);
      selectedTrackRef.current = restored.selectedTrack;
      selectedKeyRef.current = restored.selectedKey;
      selectedKeysRef.current = restored.selectedKeys;
      selectedEventRef.current = restored.selectedEvent;
      setSelectedTrack(restored.selectedTrack);
      setSelectedKey(restored.selectedKey);
      setSelectedKeys(restored.selectedKeys);
      setSelectedEvent(restored.selectedEvent);
      setError(null);
      return;
    }
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Animation history document '${path}' is no longer available.`);
    drafts.current.set(path, { ...draft, ...restored });
    setDraftEpoch((value) => value + 1);
  };

  const recordHistory = (
    snapshot: AnimationHistorySnapshot,
    label: string,
  ): EditorUndoToken | null => {
    const path = loadedClipPath.current;
    if (!path) return null;
    return props.undoService.recordSnapshot({
      scope: `animation:${path}`,
      label,
      state: structuredClone(snapshot),
      capture: () => captureDocument(path),
      restore: (state) => restoreDocument(path, state),
    });
  };

  const currentHistorySnapshot = (): AnimationHistorySnapshot | null => {
    if (!clipRef.current) return null;
    return {
      clip: structuredClone(clipRef.current),
      time: timeRef.current,
      selectedTrack: selectedTrackRef.current,
      selectedKey: selectedKeyRef.current ? { ...selectedKeyRef.current } : null,
      selectedKeys: structuredClone(selectedKeysRef.current),
      selectedEvent: selectedEventRef.current,
    };
  };

  const updateClip = (next: AnimationClip, label = 'Edit Animation Clip') => {
    const current = clipRef.current;
    if (!current || serializeAnimationClip(next) === serializeAnimationClip(current)) return false;
    const transaction = editTransaction.current;
    if (transaction) {
      if (!transaction.token || !props.undoService.isUndoTop(transaction.token)) {
        const snapshot: AnimationHistorySnapshot = {
          clip: structuredClone(current),
          time: timeRef.current,
          selectedTrack: selectedTrackRef.current,
          selectedKey: selectedKeyRef.current ? { ...selectedKeyRef.current } : null,
          selectedKeys: structuredClone(selectedKeysRef.current),
          selectedEvent: selectedEventRef.current,
        };
        transaction.clip = structuredClone(current);
        transaction.time = snapshot.time;
        transaction.selectedTrack = snapshot.selectedTrack;
        transaction.selectedKey = snapshot.selectedKey;
        transaction.selectedKeys = snapshot.selectedKeys;
        transaction.selectedEvent = snapshot.selectedEvent;
        transaction.checkpoint = props.undoService.checkpoint();
        transaction.token = recordHistory(snapshot, label);
      }
    } else {
      const snapshot = currentHistorySnapshot();
      if (snapshot) recordHistory(snapshot, label);
    }
    replaceClip(next);
    return true;
  };

  const beginHistoryTransaction = () => {
    if (editTransaction.current) return false;
    const snapshot = currentHistorySnapshot();
    if (!snapshot) return false;
    editTransaction.current = {
      ...snapshot,
      checkpoint: props.undoService.checkpoint(),
      token: null,
    };
    return true;
  };

  const finishHistoryTransaction = () => {
    const transaction = editTransaction.current;
    editTransaction.current = null;
    if (
      !transaction?.token
      || !clipRef.current
      || !props.undoService.isUndoTop(transaction.token)
      || serializeAnimationClip(clipRef.current) !== serializeAnimationClip(transaction.clip)
    ) return;
    props.undoService.restoreCheckpoint(transaction.checkpoint);
  };

  const beginEdit = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (isAnimationEditControl(event.target)) beginHistoryTransaction();
  };

  const endEdit = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (keyboardNudgeKey.current) {
      keyboardNudgeKey.current = null;
      finishHistoryTransaction();
    }
    if (isAnimationEditControl(event.target)) finishHistoryTransaction();
  };

  useEffect(() => {
    let cancelled = false;
    const controllerPath = animator?.controller?.trim() ?? '';
    setAnimatorClipPath('');
    setAnimatorStateName('');
    setAnimatorStateSpeed(1);
    if (!controllerPath) return () => { cancelled = true; };
    void readProjectAssetText(controllerPath)
      .then((text) => {
        if (cancelled) return;
        const controller = parseAnimatorController(text);
        const requested = animator?.current_state?.trim() ?? '';
        const state = controller.states.find((candidate) => candidate.name === requested)
          ?? controller.states.find((candidate) => candidate.name === controller.default_state)!;
        setAnimatorClipPath(state.clip);
        setAnimatorStateName(state.name);
        setAnimatorStateSpeed(state.speed);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(`Animator Controller：${reason instanceof Error ? reason.message : String(reason)}`);
        }
      });
    return () => { cancelled = true; };
  }, [animator?.controller, animator?.current_state]);

  useEffect(() => {
    setNewClipName(props.entity?.name ?? 'New Animation');
    setShowNewClip(false);
  }, [props.entity?.entity]);

  useEffect(() => {
    setSelectedKeys((current) => {
      if (!selectedKey) return current.length === 0 ? current : [];
      return current.some((ref) => ref.track === selectedKey.track && ref.key === selectedKey.key)
        ? current
        : [selectedKey];
    });
  }, [selectedKey]);

  useEffect(() => {
    if (!detailsOpen || (!selectedKey && selectedEvent == null)) return;
    const frame = window.requestAnimationFrame(() => {
      selectionDetailsRef.current?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detailsOpen, selectedEvent, selectedKey?.key, selectedKey?.track]);

  useEffect(() => {
    let cancelled = false;
    const transaction = editTransaction.current;
    if (
      transaction?.token
      && clip
      && props.undoService.isUndoTop(transaction.token)
      && serializeAnimationClip(clip) === serializeAnimationClip(transaction.clip)
    ) {
      props.undoService.restoreCheckpoint(transaction.checkpoint);
    }
    const previousPath = loadedClipPath.current;
    if (previousPath && clip) {
      drafts.current.set(previousPath, {
        clip: structuredClone(clip),
        savedText,
        time,
        selectedTrack,
        selectedKey: selectedKey ? { ...selectedKey } : null,
        selectedKeys: selectedKeys.map((ref) => ({ ...ref })),
        selectedEvent,
      });
    }
    loadedClipPath.current = clipPath;
    editTransaction.current = null;
    setPlaying(false);
    setRecording(false);
    timelineDragRef.current = null;
    setTimelineDrag(null);
    timelineMarqueeRef.current = null;
    setTimelineMarquee(null);
    keyboardNudgeKey.current = null;
    recordingValues.current.clear();
    setError(null);
    replaceClip(null);
    setSavedText('');
    setTime(0);
    playbackPhase.current = 0;
    setLoading(false);
    if (!clipPath) {
      setSelectedTrack(null);
      setSelectedKey(null);
      setSelectedKeys([]);
      setSelectedEvent(null);
      props.onClearPreview();
      return () => { cancelled = true; };
    }
    const draft = drafts.current.get(clipPath);
    if (draft) {
      drafts.current.delete(clipPath);
      replaceClip(structuredClone(draft.clip));
      setSavedText(draft.savedText);
      setTime(draft.time);
      setSelectedTrack(draft.selectedTrack);
      setSelectedKeys(draft.selectedKeys.map((ref) => ({ ...ref })));
      setSelectedKey(draft.selectedKey ? { ...draft.selectedKey } : null);
      setSelectedEvent(draft.selectedEvent);
      playbackPhase.current = draft.time;
      setLoading(false);
      return () => { cancelled = true; };
    }
    setSelectedTrack(null);
    setSelectedKey(null);
    setSelectedKeys([]);
    setSelectedEvent(null);
    setLoading(true);
    void readProjectAssetText(clipPath)
      .then((text) => {
        if (cancelled) return;
        const loaded = parseAnimationClip(text);
        replaceClip(loaded);
        setSavedText(serializeAnimationClip(loaded));
        const authoredTime = Number(player?.time ?? 0);
        playbackPhase.current = Number.isFinite(authoredTime) ? authoredTime : 0;
        setTime(wrappedAnimationTime(authoredTime, loaded.duration, loaded.wrap_mode));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        replaceClip(null);
        setError(reason instanceof Error ? reason.message : String(reason));
        props.onClearPreview();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [clipPath]);

  const serializedClip = useMemo(
    () => clip ? serializeAnimationClip(clip) : '',
    [clip],
  );
  const dirty = Boolean(clip && serializedClip !== savedText);
  const anyDirty = dirty || [...drafts.current.values()].some(animationDraftDirty);

  useEffect(() => {
    props.onDirtyChange(anyDirty);
  }, [anyDirty, props.onDirtyChange]);

  useEffect(() => () => props.onClearPreview(), [props.entity?.entity]);

  useEffect(() => {
    if (!maximized) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMaximized(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [maximized]);

  useEffect(() => {
    if (!props.entity || !clip) {
      props.onClearPreview();
      return;
    }
    props.onPreview(props.entity.entity, sampleAnimationClip(clip, time));
  }, [clip, props.entity?.entity, time]);

  useEffect(() => {
    if (!playing || !clip) {
      previousFrameTime.current = null;
      if (playbackFrame.current != null) cancelAnimationFrame(playbackFrame.current);
      playbackFrame.current = null;
      return;
    }
    const tick = (now: number) => {
      const previous = previousFrameTime.current ?? now;
      previousFrameTime.current = now;
      const speed = Number(animator
        ? Number(animator.speed ?? 1) * animatorStateSpeed
        : player?.speed ?? 1);
      setTime((current) => {
        const delta = Math.max(0, now - previous) * 0.001 * (Number.isFinite(speed) ? speed : 1);
        const next = advanceAnimationPreviewPhase(
          playbackPhase.current ?? current,
          delta,
          clip.duration,
          clip.wrap_mode,
        );
        playbackPhase.current = next.phase;
        if (next.finished) setPlaying(false);
        return next.time;
      });
      playbackFrame.current = requestAnimationFrame(tick);
    };
    playbackFrame.current = requestAnimationFrame(tick);
    return () => {
      if (playbackFrame.current != null) cancelAnimationFrame(playbackFrame.current);
      playbackFrame.current = null;
      previousFrameTime.current = null;
    };
  }, [animator, animatorStateSpeed, clip, playing, player?.speed]);

  useEffect(() => {
    if (!recording || !clip || !props.entity) return;
    const authoredRoot = props.authoredEntities.find(
      (entity) => entity.entity === props.entity!.entity,
    );
    if (!authoredRoot) return;

    const nextValues = new Map<string, string | null>();
    const changes: Array<{ index: number; value: AnimationValue }> = [];
    clip.tracks.forEach((track, index) => {
      const key = recordingTrackKey(track, index);
      const value = trackValue(props.authoredEntities, authoredRoot, track);
      const token = recordingValueToken(value);
      nextValues.set(key, token);
      if (
        value != null
        && recordingValues.current.has(key)
        && recordingValues.current.get(key) !== token
      ) {
        changes.push({ index, value });
      }
    });
    recordingValues.current = nextValues;
    if (changes.length === 0) return;

    let lastKey: { track: number; key: number } | null = null;
    const tracks = [...clip.tracks];
    for (const change of changes) {
      const result = upsertAnimationKeyframe(
        tracks[change.index],
        time,
        change.value,
        clip.frame_rate,
        clip.duration,
      );
      tracks[change.index] = result.track;
      lastKey = { track: change.index, key: result.keyIndex };
    }
    updateClip({ ...clip, tracks }, 'Record Animation Keys');
    setSelectedTrack(lastKey!.track);
    setSelectedKeys([lastKey!]);
    setSelectedKey(lastKey);
  }, [clip, props.authoredEntities, props.entity?.entity, recording, time]);

  const samples = useMemo(() => clip ? sampleAnimationClip(clip, time) : [], [clip, time]);
  const propertyBindings = useMemo(
    () => props.entity
      ? listAnimationPropertyBindings(props.authoredEntities, props.entity.entity)
      : [],
    [props.authoredEntities, props.entity?.entity],
  );
  const addablePropertyBindings = useMemo(
    () => propertyBindings.filter((binding) => !clip?.tracks.some((track) => (
      track.target === binding.target
      && track.component === binding.component
      && track.property === binding.property
    ))),
    [clip, propertyBindings],
  );
  const propertySearchResult = useMemo(
    () => searchAnimationPropertyBindings(addablePropertyBindings, propertySearch),
    [addablePropertyBindings, propertySearch],
  );
  const propertyBindingGroups = useMemo(
    () => groupAnimationPropertyBindings(propertySearchResult.bindings),
    [propertySearchResult.bindings],
  );
  const propertyBindingIndexByKey = useMemo(() => new Map(
    propertySearchResult.bindings.map((binding, index) => [animationBindingKey(binding), index]),
  ), [propertySearchResult.bindings]);
  const activePropertyBindingIndex = activePropertyBindingKey == null
    ? -1
    : (propertyBindingIndexByKey.get(activePropertyBindingKey) ?? -1);
  const activePropertyBindingId = activePropertyBindingIndex < 0
    ? undefined
    : `timeline-property-option-${activePropertyBindingIndex}`;

  const positionPropertyPopup = () => {
    const rect = propertyPickerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const padding = 8;
    const gap = 4;
    const preferredHeight = Math.min(430, window.innerHeight * 0.68);
    const spaceAbove = Math.max(0, rect.top - gap - padding);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - padding);
    const placement = spaceBelow >= preferredHeight || spaceBelow >= spaceAbove ? 'below' : 'above';
    const availableHeight = placement === 'below' ? spaceBelow : spaceAbove;
    const width = Math.min(440, Math.max(120, window.innerWidth - padding * 2));
    const left = Math.min(
      Math.max(padding, rect.left),
      Math.max(padding, window.innerWidth - width - padding),
    );
    const style: CSSProperties = {
      left,
      width,
      maxHeight: Math.max(48, Math.min(preferredHeight, availableHeight)),
    };
    if (placement === 'below') style.top = rect.bottom + gap;
    else style.bottom = window.innerHeight - rect.top + gap;
    setPropertyPopupPlacement(placement);
    setPropertyPopupStyle(style);
  };

  useEffect(() => {
    if (!propertyPickerOpen) return;
    const focusFrame = window.requestAnimationFrame(() => propertySearchRef.current?.focus());
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target
        && !propertyPickerRef.current?.contains(target)
        && !propertyPopupRef.current?.contains(target)
      ) setPropertyPickerOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setPropertyPickerOpen(false);
    };
    const reposition = () => positionPropertyPopup();
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeWithEscape, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeWithEscape, true);
      window.removeEventListener('resize', reposition);
    };
  }, [propertyPickerOpen]);

  useEffect(() => {
    if (!propertyPickerOpen) return;
    setActivePropertyBindingKey((current) => {
      if (current && propertyBindingIndexByKey.has(current)) return current;
      const first = propertySearchResult.bindings[0];
      return first ? animationBindingKey(first) : null;
    });
  }, [propertyBindingIndexByKey, propertyPickerOpen, propertySearchResult.bindings]);

  useEffect(() => {
    if (!propertyPickerOpen || !activePropertyBindingKey) return;
    const frame = window.requestAnimationFrame(() => {
      propertyOptionRefs.current.get(activePropertyBindingKey)?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activePropertyBindingKey, propertyPickerOpen]);

  const assignClip = (path: string) => {
    if (!props.entity) return;
    if (animator) {
      props.onLog('Animator 的 Clip 由 Controller State 管理，请在 Animator 面板中修改 State。', 'warn');
      return;
    }
    if (player) props.onPatchComponent(props.entity.entity, 'AnimationPlayer', { clip: path });
    else {
      props.onAddComponent(props.entity.entity, 'AnimationPlayer', {
        clip: path,
        play_on_awake: true,
        playing: true,
        speed: 1,
        time: 0,
      });
    }
  };

  const persist = async (next = clip): Promise<boolean> => {
    if (!next || !clipPath) return false;
    const normalized = normalizeAnimationClip(next);
    replaceClip(normalized);
    setSaving(true);
    setError(null);
    try {
      await writeProjectAssetText(clipPath, serializeAnimationClip(normalized));
      await refreshProjectFiles();
      drafts.current.delete(clipPath);
      setSavedText(serializeAnimationClip(normalized));
      props.onAssetsChanged();
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Animation Clip 保存失败：${message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const persistAll = async () => {
    if (dirty && !await persist()) throw new Error('Current Animation Clip could not be saved');
    const failures: string[] = [];
    const dirtyDrafts = [...drafts.current].filter(([, draft]) => animationDraftDirty(draft));
    if (dirtyDrafts.length > 0) setSaving(true);
    try {
      for (const [path, draft] of dirtyDrafts) {
        try {
          const normalized = normalizeAnimationClip(draft.clip);
          const text = serializeAnimationClip(normalized);
          await writeProjectAssetText(path, text);
          drafts.current.set(path, { ...draft, clip: normalized, savedText: text });
          props.onLog(`Saved ${path}`);
        } catch (reason) {
          failures.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      await refreshProjectFiles();
      props.onAssetsChanged();
    } finally {
      setSaving(false);
      if (dirtyDrafts.length > 0) setDraftEpoch((value) => value + 1);
    }
    if (failures.length > 0) throw new Error(failures.join('; '));
  };

  useEffect(() => registerSaveAllParticipant('Animation Clips', () => (
    anyDirty && !saving ? persistAll : null
  )), [anyDirty, clip, clipPath, dirty, savedText, saving]);

  const createClip = async () => {
    if (!props.entity) return;
    const name = safeClipName(newClipName || props.entity.name || 'New Animation');
    if (!name) {
      props.onLog('Animation Clip 名称无效', 'warn');
      return;
    }
    const path = uniqueClipPath(name);
    const next = createAnimationClip(name);
    setSaving(true);
    setError(null);
    try {
      await writeProjectAssetText(path, serializeAnimationClip(next));
      await refreshProjectFiles();
      if (loadedClipPath.current && clip) {
        drafts.current.set(loadedClipPath.current, {
          clip: structuredClone(clip),
          savedText,
          time,
          selectedTrack,
          selectedKey: selectedKey ? { ...selectedKey } : null,
          selectedKeys: selectedKeys.map((ref) => ({ ...ref })),
          selectedEvent,
        });
      }
      loadedClipPath.current = path;
      assignClip(path);
      replaceClip(next);
      setSavedText(serializeAnimationClip(next));
      setTime(0);
      setSelectedTrack(null);
      setSelectedKey(null);
      setSelectedKeys([]);
      setSelectedEvent(null);
      playbackPhase.current = 0;
      setShowNewClip(false);
      props.onAssetsChanged();
      props.onLog(`Created ${path}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Animation Clip 创建失败：${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const dropClip = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData('text/mengine-asset')
      || event.dataTransfer.getData('text/plain');
    try {
      const path = normalizeProjectAssetPath(raw);
      if (!path.toLowerCase().endsWith('.manim')) throw new Error('只接受 .manim Animation Clip');
      assignClip(path);
    } catch (reason) {
      props.onLog(reason instanceof Error ? reason.message : String(reason), 'warn');
    }
  };

  const addProperty = (bindingKey = ''): boolean => {
    if (!clip || !props.entity) return false;
    const picked = parseAnimationBindingKey(bindingKey);
    const raw = propertyPath.trim();
    const dot = raw.indexOf('.');
    const target = picked?.target ?? '.';
    const component = picked?.component ?? raw.slice(0, dot).trim();
    const property = picked?.property ?? raw.slice(dot + 1).trim();
    const propertyLabel = picked ? `${target}:${component}.${property}` : raw;
    const bindingTarget = targetEntity(props.authoredEntities, props.entity, target);
    const value = dot > 0 || picked
      ? getProperty(bindingTarget?.components[component], property)
      : null;
    if (!component || !property || value == null) {
      props.onLog(`无法记录属性：${propertyLabel}`, 'warn');
      return false;
    }
    const existing = clip.tracks.findIndex((track) => (
      track.target === target && track.component === component && track.property === property
    ));
    if (existing >= 0) {
      setSelectedTrack(existing);
      setSelectedKeys([]);
      setSelectedKey(null);
      props.onLog(`${component}.${property} 已在当前 Animation Clip 中`, 'warn');
      return false;
    }
    const keyframes = [{ time: 0, value: structuredClone(value) }];
    if (clip.duration > 0) keyframes.push({ time: clip.duration, value: structuredClone(value) });
    const next = normalizeAnimationClip({
      ...clip,
      tracks: [...clip.tracks, {
        target,
        component,
        property,
        interpolation: typeof value === 'boolean' || typeof value === 'string' ? 'step' : 'linear',
        keyframes,
      }],
    });
    setSelectedTrack(next.tracks.length - 1);
    setSelectedKeys([]);
    setSelectedKey(null);
    setSelectedEvent(null);
    updateClip(next, 'Add Animation Track');
    return true;
  };

  const selectPropertyBinding = (bindingKey: string): boolean => {
    const binding = parseAnimationBindingKey(bindingKey);
    if (!binding) return false;
    editTransaction.current = null;
    setPropertyPath(`${binding.component}.${binding.property}`);
    if (!addProperty(bindingKey)) return false;
    setPropertyPickerOpen(false);
    setPropertySearch('');
    setActivePropertyBindingKey(null);
    return true;
  };

  const addManualProperty = (): boolean => {
    editTransaction.current = null;
    return addProperty();
  };

  const handlePropertySearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const binding = propertySearchResult.bindings[activePropertyBindingIndex];
      if (!binding) return;
      event.preventDefault();
      event.stopPropagation();
      selectPropertyBinding(animationBindingKey(binding));
      return;
    }
    const command = event.key === 'ArrowDown'
      ? 'next'
      : event.key === 'ArrowUp'
        ? 'previous'
        : event.key === 'PageDown'
          ? 'page_next'
          : event.key === 'PageUp'
            ? 'page_previous'
            : null;
    if (command == null) return;
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = navigateAnimationPropertyBindingIndex(
      propertySearchResult.bindings.length,
      activePropertyBindingIndex,
      command,
    );
    const nextBinding = propertySearchResult.bindings[nextIndex];
    setActivePropertyBindingKey(nextBinding ? animationBindingKey(nextBinding) : null);
  };

  const recordKey = () => {
    if (!clip || !props.entity || selectedTrack == null) return;
    const track = clip.tracks[selectedTrack];
    if (!track) return;
    const authoredRoot = props.authoredEntities.find(
      (entity) => entity.entity === props.entity!.entity,
    ) ?? props.entity;
    const value = trackValue(props.authoredEntities, authoredRoot, track);
    if (value == null) {
      props.onLog(`无法读取 ${track.target}:${track.component}.${track.property}`, 'warn');
      return;
    }
    const result = upsertAnimationKeyframe(
      track,
      time,
      value,
      clip.frame_rate,
      clip.duration,
    );
    const tracks = clip.tracks.map((candidate, index) => index === selectedTrack
      ? result.track
      : candidate);
    updateClip({ ...clip, tracks }, 'Record Animation Key');
    const primary = { track: selectedTrack, key: result.keyIndex };
    setSelectedKeys([primary]);
    setSelectedKey(primary);
    setSelectedEvent(null);
    setDetailsOpen(true);
  };

  const toggleRecording = () => {
    if (!clip || !props.entity) return;
    setPlaying(false);
    if (recording) {
      setRecording(false);
      recordingValues.current.clear();
      return;
    }
    const authoredRoot = props.authoredEntities.find(
      (entity) => entity.entity === props.entity!.entity,
    ) ?? props.entity;
    recordingValues.current = new Map(clip.tracks.map((track, index) => [
      recordingTrackKey(track, index),
      recordingValueToken(trackValue(props.authoredEntities, authoredRoot, track)),
    ]));
    setRecording(true);
  };

  const deleteTrack = () => {
    if (!clip || selectedTrack == null) return;
    const tracks = clip.tracks.filter((_track, index) => index !== selectedTrack);
    setSelectedTrack(null);
    setSelectedKeys([]);
    setSelectedKey(null);
    updateClip({ ...clip, tracks }, 'Delete Animation Track');
  };

  const addEvent = () => {
    if (!clip) return;
    const result = addAnimationEvent(clip, time);
    updateClip(result.clip, 'Add Animation Event');
    setSelectedTrack(null);
    setSelectedKeys([]);
    setSelectedKey(null);
    setSelectedEvent(result.eventIndex);
    setDetailsOpen(true);
  };

  const selectedAnimationEvent = selectedEvent != null && clip
    ? clip.events[selectedEvent] ?? null
    : null;

  const updateSelectedEvent = (patch: Partial<AnimationEvent>) => {
    if (!clip || selectedEvent == null) return;
    const result = replaceAnimationEvent(clip, selectedEvent, patch);
    if (!result) return;
    updateClip(result.clip, 'Edit Animation Event');
    setSelectedEvent(result.eventIndex);
    const next = result.clip.events[result.eventIndex].time;
    playbackPhase.current = next;
    setTime(next);
  };

  const deleteSelectedEvent = () => {
    if (!clip || selectedEvent == null) return;
    updateClip(removeAnimationEvent(clip, selectedEvent), 'Delete Animation Event');
    setSelectedEvent(null);
  };

  const selectedKeyframe = selectedKey && clip
    ? clip.tracks[selectedKey.track]?.keyframes[selectedKey.key] ?? null
    : null;
  const selectedTrackData = selectedTrack != null && clip
    ? clip.tracks[selectedTrack] ?? null
    : null;
  const activeSelectedKeys = clip
    ? normalizeTimelineKeySelection(clip, selectedKeys)
    : [];
  const selectedKeyFrameRange = clip
    ? timelineKeySelectionFrameRange(clip, activeSelectedKeys)
    : null;
  const timelineDragFeedback = clip && timelineDrag
    ? (() => {
        const frameRate = Math.max(1, clip.frame_rate);
        if (timelineDrag.kind === 'event') {
          return {
            time: timelineDrag.time,
            label: `Event ${Math.round(timelineDrag.time * frameRate)}f`,
          };
        }
        const range = timelineKeySelectionFrameRange(clip, timelineDrag.selection);
        const deltaFrames = Math.round(timelineDrag.delta * frameRate);
        const activeTime = timelineDrag.activeTime + timelineDrag.delta;
        if (!range) return { time: activeTime, label: `${Math.round(activeTime * frameRate)}f` };
        const start = range.startFrame + deltaFrames;
        const end = range.endFrame + deltaFrames;
        const moved = deltaFrames === 0 ? '' : ` | ${deltaFrames > 0 ? '+' : ''}${deltaFrames}f`;
        return {
          time: activeTime,
          label: `${start === end ? `${start}f` : `${start}-${end}f`}${moved}`,
        };
      })()
    : null;
  const selectedKeyFrameStep = clip ? 1 / Math.max(1, clip.frame_rate) : 0;
  const canNudgeSelectedKeysBackward = Boolean(
    clip
    && activeSelectedKeys.length > 0
    && clampTimelineKeyDelta(clip, activeSelectedKeys, -selectedKeyFrameStep) < 0,
  );
  const canNudgeSelectedKeysForward = Boolean(
    clip
    && activeSelectedKeys.length > 0
    && clampTimelineKeyDelta(clip, activeSelectedKeys, selectedKeyFrameStep) > 0,
  );
  const rulerSteps = Math.min(80, Math.max(5, Math.round(5 * zoom)));
  const canCopySelection = activeSelectedKeys.length > 0 || selectedAnimationEvent != null;
  const canMaximizePanel = !new URLSearchParams(window.location.search).has('detachedPanel');

  const selectKeys = (
    selection: readonly TimelineKeyRef[],
    sourceClip: AnimationClip | null = clip,
  ) => {
    const normalized = sourceClip ? normalizeTimelineKeySelection(sourceClip, selection) : [];
    const primary = normalized[normalized.length - 1] ?? null;
    selectedKeysRef.current = normalized;
    selectedKeyRef.current = primary;
    setSelectedKeys(normalized);
    setSelectedKey(primary);
    if (primary) {
      selectedTrackRef.current = primary.track;
      setSelectedTrack(primary.track);
    }
    selectedEventRef.current = null;
    setSelectedEvent(null);
  };

  const updateSelectedKey = (patch: Partial<AnimationKeyframe>) => {
    if (!clip || !selectedKey || !selectedKeyframe) return;
    const track = clip.tracks[selectedKey.track];
    const result = replaceAnimationKeyframe(
      track,
      selectedKey.key,
      patch.time ?? selectedKeyframe.time,
      patch.value ?? selectedKeyframe.value,
      clip.frame_rate,
      clip.duration,
    );
    if (!result) return;
    updateClip({
      ...clip,
      tracks: clip.tracks.map((candidate, index) => (
        index === selectedKey.track ? result.track : candidate
      )),
    }, 'Edit Animation Key');
    const primary = { track: selectedKey.track, key: result.keyIndex };
    setSelectedKeys([primary]);
    setSelectedKey(primary);
    const next = result.track.keyframes[result.keyIndex].time;
    playbackPhase.current = next;
    setTime(next);
  };

  const deleteSelectedKey = () => {
    if (!clip || activeSelectedKeys.length === 0) return;
    updateClip(removeTimelineKeySelection(clip, activeSelectedKeys), 'Delete Animation Keys');
    setSelectedKeys([]);
    setSelectedKey(null);
  };

  const moveSelectedKeysByFrames = (frames: number) => {
    const sourceClip = clipRef.current;
    if (!sourceClip || !Number.isFinite(frames)) return;
    const selection = normalizeTimelineKeySelection(sourceClip, selectedKeysRef.current);
    if (selection.length === 0) return;
    const result = moveTimelineKeySelection(
      sourceClip,
      selection,
      frames / Math.max(1, sourceClip.frame_rate),
    );
    if (result.appliedDelta === 0) return;
    updateClip(result.clip, 'Move Animation Keys');
    selectKeys(result.selection, result.clip);
    const primary = result.selection[result.selection.length - 1];
    if (primary) {
      const next = result.clip.tracks[primary.track].keyframes[primary.key].time;
      playbackPhase.current = next;
      timeRef.current = next;
      setTime(next);
    }
  };

  const retimeSelectedKeys = (startFrame: number, endFrame: number) => {
    const sourceClip = clipRef.current;
    if (!sourceClip) return;
    const selection = normalizeTimelineKeySelection(sourceClip, selectedKeysRef.current);
    const result = retimeTimelineKeySelection(sourceClip, selection, startFrame, endFrame);
    if (!result.ok) {
      props.onLog(`Cannot retime animation keys: ${result.error}`, 'warn');
      return;
    }
    if (!updateClip(result.clip, 'Retime Animation Keys')) return;
    selectKeys(result.selection, result.clip);
    const primary = result.selection[result.selection.length - 1];
    if (primary) {
      const next = result.clip.tracks[primary.track].keyframes[primary.key].time;
      playbackPhase.current = next;
      timeRef.current = next;
      setTime(next);
    }
  };

  const updateSelectedTangent = (
    side: 'in_tangent' | 'out_tangent',
    value: AnimationTangent | null,
  ) => {
    if (!clip || !selectedKey) return;
    const track = clip.tracks[selectedKey.track];
    if (!track) return;
    const next = setAnimationKeyframeTangents(track, selectedKey.key, { [side]: value });
    updateClip({
      ...clip,
      tracks: clip.tracks.map((candidate, index) => index === selectedKey.track ? next : candidate),
    }, 'Edit Animation Tangent');
  };

  const updateCurveKey = (
    keyIndex: number,
    channel: number,
    nextTime: number,
    nextValue: number,
  ) => {
    if (!clip || selectedTrack == null) return;
    const result = moveAnimationCurveKey(
      clip.tracks[selectedTrack],
      keyIndex,
      channel,
      nextTime,
      nextValue,
      clip.frame_rate,
      clip.duration,
    );
    if (!result) return;
    const nextClip = {
      ...clip,
      tracks: clip.tracks.map((track, index) => index === selectedTrack ? result.track : track),
    };
    const primary = { track: selectedTrack, key: result.keyIndex };
    updateClip(nextClip, 'Edit Animation Curve');
    selectKeys([primary], nextClip);
    const authoredTime = result.track.keyframes[result.keyIndex].time;
    playbackPhase.current = authoredTime;
    setTime(authoredTime);
  };

  const updateCurveTangent = (
    keyIndex: number,
    channel: number,
    side: 'in_tangent' | 'out_tangent',
    slope: number,
  ) => {
    if (!clip || selectedTrack == null) return;
    const next = setAnimationCurveTangentChannel(
      clip.tracks[selectedTrack],
      keyIndex,
      side,
      channel,
      slope,
    );
    updateClip({
      ...clip,
      tracks: clip.tracks.map((track, index) => index === selectedTrack ? next : track),
    }, 'Edit Animation Tangent');
  };

  const setSelectedCurveTangents = (mode: 'auto' | 'flat') => {
    if (!clip || !selectedKey) return;
    const track = clip.tracks[selectedKey.track];
    if (!track || track.interpolation !== 'cubic') return;
    const next = mode === 'auto'
      ? setAnimationCurveTangentsAuto(track, selectedKey.key)
      : setAnimationCurveTangentsFlat(track, selectedKey.key);
    updateClip({
      ...clip,
      tracks: clip.tracks.map((candidate, index) => index === selectedKey.track ? next : candidate),
    }, `Set Animation Tangents ${mode === 'auto' ? 'Auto' : 'Flat'}`);
  };

  const enableSelectedCurveCubic = () => {
    if (!clip || selectedTrack == null || !clip.tracks[selectedTrack]) return;
    updateClip({
      ...clip,
      tracks: clip.tracks.map((track, index) => index === selectedTrack
        ? { ...track, interpolation: 'cubic' }
        : track),
    }, 'Enable Cubic Animation Curve');
  };

  const selectionClipboard = (): TimelineClipboard | null => {
    if (clip && activeSelectedKeys.length > 0) {
      const keys = copyTimelineKeySelection(clip, activeSelectedKeys);
      if (keys.length > 0) return { kind: 'keys', keys };
    }
    if (selectedAnimationEvent) {
      return { kind: 'event', event: structuredClone(selectedAnimationEvent) };
    }
    return null;
  };

  const copySelection = () => {
    const copied = selectionClipboard();
    if (copied) setTimelineClipboard(copied);
  };

  const pasteSelection = (copied = timelineClipboard) => {
    if (!clip || !copied) return;
    if (copied.kind === 'event') {
      const pasted = pasteAnimationEvent(clip, copied.event, time);
      updateClip(pasted.clip, 'Paste Animation Event');
      setSelectedTrack(null);
      setSelectedKeys([]);
      setSelectedKey(null);
      setSelectedEvent(pasted.eventIndex);
      setDetailsOpen(true);
      return;
    }

    const pasted = pasteTimelineKeySelection(clip, copied.keys, time);
    if (pasted.selection.length === 0) {
      props.onLog(
        'Cannot paste keys: none of the copied property tracks exist in this clip',
        'warn',
      );
      return;
    }
    updateClip(pasted.clip, 'Paste Animation Keys');
    selectKeys(pasted.selection, pasted.clip);
    if (pasted.skipped > 0) {
      props.onLog(`Pasted ${pasted.selection.length} key(s); skipped ${pasted.skipped} unmatched key(s)`, 'warn');
    }
    setDetailsOpen(true);
  };

  const setPreviewTime = (next: number) => {
    if (!clip) return;
    const snapped = snapAnimationTime(next, clip.frame_rate, clip.duration);
    setPlaying(false);
    playbackPhase.current = snapped;
    setTime(snapped);
  };

  const stepFrame = (direction: -1 | 1) => {
    if (!clip) return;
    setPreviewTime(time + direction / Math.max(1, clip.frame_rate));
  };

  const cancelTimelineDrag = () => {
    const drag = timelineDragRef.current;
    if (!drag) return false;
    timelineDragRef.current = null;
    setTimelineDrag(null);
    const restoredTime = drag.kind === 'event' ? drag.authoredTime : drag.activeTime;
    playbackPhase.current = restoredTime;
    timeRef.current = restoredTime;
    setTime(restoredTime);
    return true;
  };

  const seekAtPointer = (
    event: ReactPointerEvent<HTMLElement>,
    duration: number,
    frameRate: number,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    setPlaying(false);
    const next = snapAnimationTime(
      (event.clientX - rect.left) / rect.width * duration,
      frameRate,
      duration,
    );
    playbackPhase.current = next;
    setTime(next);
  };

  const beginScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!clip) return;
    scrubPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekAtPointer(event, clip.duration, clip.frame_rate);
  };

  const moveScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!clip || scrubPointer.current !== event.pointerId) return;
    seekAtPointer(event, clip.duration, clip.frame_rate);
  };

  const finishScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (scrubPointer.current !== event.pointerId) return;
    scrubPointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleTimelineKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (event.key === 'Escape' && cancelTimelineDrag()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (command && key === 's') {
      event.preventDefault();
      event.stopPropagation();
      void persist();
      return;
    }
    if (target.closest('input, select, textarea')) return;
    if (command && key === 'z') {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) props.onGlobalRedo();
      else props.onGlobalUndo();
      return;
    }
    if (command && key === 'y') {
      event.preventDefault();
      event.stopPropagation();
      props.onGlobalRedo();
      return;
    }
    if (command && key === 'c') {
      if (selectionClipboard()) {
        event.preventDefault();
        copySelection();
      }
      return;
    }
    if (command && key === 'v') {
      if (timelineClipboard) {
        event.preventDefault();
        pasteSelection();
      }
      return;
    }
    if (event.shiftKey && event.key === ' ') {
      event.preventDefault();
      setMaximized((value) => !value);
      return;
    }
    if (target.closest('button') && (event.key === ' ' || event.key === 'Enter')) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (clip) setPlaying((value) => !value);
      return;
    }
    const nudgeFrames = timelineKeyNudgeFrames(event.key, event.altKey, event.shiftKey);
    if (nudgeFrames !== 0 && activeSelectedKeys.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      if (keyboardNudgeKey.current !== event.key) {
        if (keyboardNudgeKey.current) finishHistoryTransaction();
        beginHistoryTransaction();
        keyboardNudgeKey.current = event.key;
      }
      moveSelectedKeysByFrames(nudgeFrames);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepFrame(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (event.key.toLowerCase() === 'k' && selectedTrack != null) {
      event.preventDefault();
      recordKey();
      setDetailsOpen(true);
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (activeSelectedKeys.length > 0) {
        event.preventDefault();
        deleteSelectedKey();
      } else if (selectedEvent != null) {
        event.preventDefault();
        deleteSelectedEvent();
      }
    }
  };

  const handleTimelineKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (keyboardNudgeKey.current !== event.key) return;
    keyboardNudgeKey.current = null;
    finishHistoryTransaction();
  };

  const beginTimelineDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    kind: TimelineDrag['kind'],
    track: number,
    index: number,
    authoredTime: number,
  ) => {
    if (!clip) return;
    const lane = event.currentTarget.parentElement;
    if (!lane) return;
    const rect = lane.getBoundingClientRect();
    event.stopPropagation();
    setPlaying(false);
    if (kind === 'key') {
      const ref = { track, key: index };
      const command = event.ctrlKey || event.metaKey;
      if (command) {
        selectKeys(toggleTimelineKeySelection(clip, activeSelectedKeys, ref));
        setDetailsOpen(true);
        return;
      }
      if (event.shiftKey) {
        const range = selectedKey
          ? timelineKeyRangeSelection(clip, selectedKey, ref)
          : [ref];
        selectKeys(range);
        setDetailsOpen(true);
        return;
      }
      const selection = activeSelectedKeys.some((candidate) => (
        candidate.track === ref.track && candidate.key === ref.key
      )) ? activeSelectedKeys : [ref];
      selectKeys(selection);
      const drag: TimelineKeyDrag = {
        kind: 'key',
        pointerId: event.pointerId,
        active: ref,
        activeTime: authoredTime,
        selection,
        delta: 0,
        left: rect.left,
        width: Math.max(1, rect.width),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      timelineDragRef.current = drag;
      setTimelineDrag(drag);
      setDetailsOpen(true);
    } else {
      const drag: TimelineEventDrag = {
        kind: 'event',
        pointerId: event.pointerId,
        index,
        authoredTime,
        time: authoredTime,
        left: rect.left,
        width: Math.max(1, rect.width),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      timelineDragRef.current = drag;
      setTimelineDrag(drag);
      setSelectedTrack(null);
      setSelectedKeys([]);
      setSelectedKey(null);
      setSelectedEvent(index);
      setDetailsOpen(true);
    }
    playbackPhase.current = authoredTime;
    timeRef.current = authoredTime;
    setTime(authoredTime);
  };

  const moveTimelineDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = timelineDragRef.current;
    if (!clip || !drag || drag.pointerId !== event.pointerId) return;
    const next = snapAnimationTime(
      (event.clientX - drag.left) / drag.width * clip.duration,
      clip.frame_rate,
      clip.duration,
    );
    const updated: TimelineDrag = drag.kind === 'event'
      ? { ...drag, time: next }
      : {
          ...drag,
          delta: clampTimelineKeyDelta(clip, drag.selection, next - drag.activeTime),
        };
    timelineDragRef.current = updated;
    setTimelineDrag(updated);
    const previewTime = updated.kind === 'event'
      ? updated.time
      : updated.activeTime + updated.delta;
    playbackPhase.current = previewTime;
    timeRef.current = previewTime;
    setTime(previewTime);
  };

  const completeTimelineDrag = (pointerId: number, commit: boolean) => {
    const drag = timelineDragRef.current;
    const sourceClip = clipRef.current;
    if (!sourceClip || !drag || drag.pointerId !== pointerId) return;
    timelineDragRef.current = null;
    setTimelineDrag(null);
    if (!commit) {
      const restoredTime = drag.kind === 'event' ? drag.authoredTime : drag.activeTime;
      playbackPhase.current = restoredTime;
      timeRef.current = restoredTime;
      setTime(restoredTime);
      return;
    }
    if (drag.kind === 'event') {
      const result = replaceAnimationEvent(sourceClip, drag.index, { time: drag.time });
      if (!result) return;
      updateClip(result.clip, 'Move Animation Event');
      setSelectedEvent(result.eventIndex);
      return;
    }
    const result = moveTimelineKeySelection(sourceClip, drag.selection, drag.delta);
    updateClip(result.clip, 'Move Animation Keys');
    selectKeys(result.selection, result.clip);
  };

  const finishTimelineDrag = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    completeTimelineDrag(event.pointerId, commit);
  };

  useEffect(() => {
    const finishPointerDrag = (event: PointerEvent) => completeTimelineDrag(event.pointerId, true);
    const finishMouseDrag = () => {
      const drag = timelineDragRef.current;
      if (drag) completeTimelineDrag(drag.pointerId, true);
    };
    const cancelWindowDrag = () => cancelTimelineDrag();
    window.addEventListener('pointerup', finishPointerDrag, true);
    window.addEventListener('mouseup', finishMouseDrag, true);
    window.addEventListener('blur', cancelWindowDrag);
    return () => {
      window.removeEventListener('pointerup', finishPointerDrag, true);
      window.removeEventListener('mouseup', finishMouseDrag, true);
      window.removeEventListener('blur', cancelWindowDrag);
    };
  }, [clipPath, props.undoService]);

  const beginTimelineMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!clip || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('.timeline-ruler, .timeline-key, .timeline-event-key')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const startX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const startY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const marquee: TimelineMarquee = {
      pointerId: event.pointerId,
      startX,
      startY,
      x: startX,
      y: startY,
      width: 0,
      height: 0,
      additive,
      base: additive ? activeSelectedKeys : [],
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlaying(false);
    timelineMarqueeRef.current = marquee;
    setTimelineMarquee(marquee);
  };

  const moveTimelineMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    const marquee = timelineMarqueeRef.current;
    if (!marquee || marquee.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const pointerY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const updated = {
      ...marquee,
      x: Math.min(marquee.startX, pointerX),
      y: Math.min(marquee.startY, pointerY),
      width: Math.abs(pointerX - marquee.startX),
      height: Math.abs(pointerY - marquee.startY),
    };
    timelineMarqueeRef.current = updated;
    setTimelineMarquee(updated);
  };

  const finishTimelineMarquee = (event: ReactPointerEvent<HTMLDivElement>, commit: boolean) => {
    const marquee = timelineMarqueeRef.current;
    if (!clip || !marquee || marquee.pointerId !== event.pointerId) return;
    timelineMarqueeRef.current = null;
    setTimelineMarquee(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!commit) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (marquee.width < 4 && marquee.height < 4) {
      const clickedTime = marquee.startX / Math.max(1, rect.width) * clip.duration;
      setPreviewTime(clickedTime);
      if (marquee.startY < 56) {
        setSelectedTrack(null);
        selectKeys([]);
      } else {
        const track = Math.floor((marquee.startY - 56) / 32);
        setSelectedTrack(clip.tracks[track] ? track : null);
        selectKeys([]);
      }
      setSelectedEvent(null);
      return;
    }
    const firstTrack = Math.floor((marquee.y - 56) / 32);
    const lastTrack = Math.floor((marquee.y + marquee.height - 56) / 32);
    const firstTime = marquee.x / Math.max(1, rect.width) * clip.duration;
    const lastTime = (marquee.x + marquee.width) / Math.max(1, rect.width) * clip.duration;
    const boxed = timelineKeysInRange(clip, firstTrack, lastTrack, firstTime, lastTime);
    const selection = marquee.additive
      ? mergeTimelineKeySelection(clip, marquee.base, boxed)
      : boxed;
    selectKeys(selection);
    if (selection.length > 0) setDetailsOpen(true);
  };

  if (!props.entity && !directAsset) {
    return <div className="timeline-empty">选择一个 GameObject 以创建或编辑动画。</div>;
  }

  if ((!player && !animator && !directAsset) || !clipPath) {
    return (
      <div
        className="timeline-empty timeline-drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropClip}
      >
        <strong>{props.entity?.name ?? (directAsset ? 'Animation Clip' : 'No Selection')}</strong>
        <span>{animator
          ? (error ?? 'Animator 尚未绑定有效的 Controller/State；请在 Animator 面板中配置。')
          : '尚未绑定 Animation Clip，可创建新资源或把 Project 中的 `.manim` 拖到这里。'}
        </span>
        {!animator && (
          <span className="timeline-empty-help">
            新建资源会保存到 Assets/Animations，并自动为当前对象添加或更新 Animation Player。
          </span>
        )}
        {animator && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'animator' }))}
          >
            Open Animator
          </button>
        )}
        {!animator && <>
        <label className="timeline-new-name">
          Clip Name
          <input
            aria-label="New clip name"
            value={newClipName}
            onChange={(event) => setNewClipName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createClip();
            }}
          />
        </label>
        <button type="button" onClick={() => void createClip()} disabled={saving}>
          Create Animation Clip
        </button>
        </>}
      </div>
    );
  }

  return (
    <div
      className={`timeline-panel${maximized ? ' maximized' : ''}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={dropClip}
      onFocusCapture={beginEdit}
      onBlurCapture={endEdit}
    >
      {animator && (
        <div className="timeline-animator-state">
          Animator State: <strong>{animatorStateName}</strong>
        </div>
      )}
      <div className="timeline-toolbar">
        <div className="timeline-transport" role="group" aria-label="Timeline playback">
          <button
            type="button"
            className={`timeline-icon-button${recording ? ' recording' : ''}`}
            aria-label={recording ? 'Stop recording' : 'Record animation changes'}
            title={recording ? 'Stop recording' : 'Record animation changes'}
            disabled={!clip}
            onClick={toggleRecording}
          >
            <Circle size={12} fill="currentColor" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="timeline-icon-button"
            aria-label="Previous frame"
            title="Previous frame (Left Arrow)"
            disabled={!clip}
            onClick={() => stepFrame(-1)}
          >
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`timeline-icon-button timeline-play-button${playing ? ' active' : ''}`}
            aria-label={playing ? 'Pause animation' : 'Play animation'}
            title={playing ? 'Pause (Space)' : 'Play (Space)'}
            disabled={!clip}
            onClick={() => setPlaying(!playing)}
          >
            {playing
              ? <Pause size={13} fill="currentColor" aria-hidden="true" />
              : <Play size={13} fill="currentColor" aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="timeline-icon-button"
            aria-label="Next frame"
            title="Next frame (Right Arrow)"
            disabled={!clip}
            onClick={() => stepFrame(1)}
          >
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="timeline-transport timeline-history" role="group" aria-label="Animation edit history">
          <button
            type="button"
            className="timeline-icon-button"
            aria-label="Undo"
            title={`Undo${props.undoService.undoLabel ? ` ${props.undoService.undoLabel}` : ''} (Ctrl+Z)`}
            disabled={!props.undoService.canUndo}
            onClick={props.onGlobalUndo}
          >
            <Undo2 size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="timeline-icon-button"
            aria-label="Redo"
            title={`Redo${props.undoService.redoLabel ? ` ${props.undoService.redoLabel}` : ''} (Ctrl+Y)`}
            disabled={!props.undoService.canRedo}
            onClick={props.onGlobalRedo}
          >
            <Redo2 size={13} aria-hidden="true" />
          </button>
        </div>
        <label className="timeline-time" title="Current animation time">
          <input
            aria-label="Current animation time"
            type="number"
            min={0}
            max={clip?.duration ?? 0}
            step={clip ? 1 / Math.max(1, clip.frame_rate) : 0.01}
            value={time.toFixed(3)}
            disabled={!clip}
            onChange={(event) => {
              if (Number.isFinite(event.target.valueAsNumber)) setPreviewTime(event.target.valueAsNumber);
            }}
          />
          <span>s</span>
        </label>
        <span className="timeline-clip-path" title={clipPath}>{clipPath}{dirty ? ' *' : ''}</span>
        {directAsset && props.onCloseAsset && (
          <button type="button" className="timeline-icon-button" title="Close asset" onClick={props.onCloseAsset}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <div className="timeline-view-modes" role="group" aria-label="Timeline view mode">
          <button
            type="button"
            className={viewMode === 'dope_sheet' ? 'active' : ''}
            aria-pressed={viewMode === 'dope_sheet'}
            onClick={() => setViewMode('dope_sheet')}
          >
            Dope Sheet
          </button>
          <button
            type="button"
            className={viewMode === 'curves' ? 'active' : ''}
            aria-pressed={viewMode === 'curves'}
            onClick={() => setViewMode('curves')}
          >
            Curves
          </button>
        </div>
        <div className="timeline-zoom" role="group" aria-label="Timeline zoom">
          <button
            type="button"
            className="timeline-icon-button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoom <= 1}
            onClick={() => setZoom((value) => Math.max(1, Number((value / 1.25).toFixed(2))))}
          >
            <ZoomOut size={13} aria-hidden="true" />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="timeline-icon-button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= 8}
            onClick={() => setZoom((value) => Math.min(8, Number((value * 1.25).toFixed(2))))}
          >
            <ZoomIn size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="timeline-icon-button"
            aria-label="Fit timeline"
            title="Fit entire clip"
            disabled={zoom === 1}
            onClick={() => setZoom(1)}
          >
            <Crosshair size={13} aria-hidden="true" />
          </button>
        </div>
        {canMaximizePanel && (
          <button
            type="button"
            className="timeline-icon-button timeline-maximize-button"
            aria-label={maximized ? 'Restore Timeline panel' : 'Maximize Timeline panel'}
            title={maximized ? 'Restore Timeline (Shift+Space)' : 'Maximize Timeline (Shift+Space)'}
            onClick={() => setMaximized((value) => !value)}
          >
            {maximized
              ? <Minimize2 size={13} aria-hidden="true" />
              : <Maximize2 size={13} aria-hidden="true" />}
          </button>
        )}
        <button
          type="button"
          className={`timeline-details-toggle${detailsOpen ? ' active' : ''}`}
          aria-label={detailsOpen ? 'Hide timeline details' : 'Show timeline details'}
          title={detailsOpen ? 'Hide details' : 'Show clip and selection details'}
          onClick={() => setDetailsOpen((value) => !value)}
        >
          {detailsOpen
            ? <PanelRightClose size={13} aria-hidden="true" />
            : <PanelRightOpen size={13} aria-hidden="true" />}
          <span>Details</span>
        </button>
        {!animator && (
          <button
            type="button"
            aria-label="Create new animation clip"
            title="Create new animation clip"
            onClick={() => setShowNewClip((value) => !value)}
            disabled={saving}
          >
            <Plus size={13} aria-hidden="true" /><span>New</span>
          </button>
        )}
        <button
          type="button"
          aria-label="Save animation clip"
          title="Save animation clip"
          onClick={() => void persist()}
          disabled={!dirty || saving}
        >
          <Save size={13} aria-hidden="true" /><span>{saving ? 'Saving…' : 'Save'}</span>
        </button>
      </div>

      {showNewClip && !animator && (
        <div className="timeline-new-clip">
          <label>
            New Clip
            <input
              aria-label="New clip name"
              value={newClipName}
              onChange={(event) => setNewClipName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void createClip();
                if (event.key === 'Escape') setShowNewClip(false);
              }}
            />
          </label>
          <button type="button" onClick={() => void createClip()} disabled={saving}>Create</button>
          <button type="button" onClick={() => setShowNewClip(false)}>Cancel</button>
        </div>
      )}

      {loading && <div className="timeline-message">Loading Animation Clip…</div>}
      {error && <div className="timeline-message error">{error}</div>}
      {clip && (
        <div
          className={`timeline-workspace${detailsOpen ? ' details-open' : ''}`}
          ref={workspaceRef}
          tabIndex={0}
          onKeyDown={handleTimelineKeyDown}
          onKeyUp={handleTimelineKeyUp}
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            if (!target.closest('button, input, select, textarea')) {
              workspaceRef.current?.focus({ preventScroll: true });
            }
          }}
        >
          <div className="timeline-track-tools">
            {viewMode === 'curves' && (
              <select
                className="timeline-curve-track-picker"
                aria-label="Curve property track"
                value={selectedTrack ?? ''}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setSelectedTrack(Number.isInteger(index) && clip.tracks[index] ? index : null);
                  setSelectedKeys([]);
                  setSelectedKey(null);
                  setSelectedEvent(null);
                }}
              >
                <option value="">Select curve track...</option>
                {clip.tracks.map((track, index) => (
                  <option key={`${track.target}:${track.component}.${track.property}:${index}`} value={index} disabled={animationCurveChannelCount(track) === 0}>
                    {track.component}.{track.property}{animationCurveChannelCount(track) === 0 ? ' (discrete)' : ''}
                  </option>
                ))}
              </select>
            )}
            <div className="timeline-property-picker" ref={propertyPickerRef}>
              <button
                type="button"
                className={`timeline-property-picker-button${propertyPickerOpen ? ' active' : ''}`}
                aria-label="Add animated property"
                aria-haspopup="dialog"
                aria-expanded={propertyPickerOpen}
                disabled={addablePropertyBindings.length === 0}
                title={addablePropertyBindings.length > 0 ? 'Add an animated property track' : 'All available properties have tracks'}
                onClick={() => {
                  setManualPropertyOpen(false);
                  setPropertySearch('');
                  setActivePropertyBindingKey(
                    addablePropertyBindings[0] ? animationBindingKey(addablePropertyBindings[0]) : null,
                  );
                  if (!propertyPickerOpen) positionPropertyPopup();
                  setPropertyPickerOpen(!propertyPickerOpen);
                }}
              >
                <Plus size={13} aria-hidden="true" />
                <span>{addablePropertyBindings.length > 0 ? 'Add Property' : 'All Properties Added'}</span>
                <ChevronDown className="timeline-property-chevron" size={12} aria-hidden="true" />
              </button>
              {propertyPickerOpen && createPortal(
                <div
                  ref={propertyPopupRef}
                  className={`timeline-property-popup open-${propertyPopupPlacement}`}
                  role="dialog"
                  aria-label="Add Animated Property"
                  style={propertyPopupStyle}
                >
                  <label className="timeline-property-search">
                    <Search size={13} aria-hidden="true" />
                    <input
                      ref={propertySearchRef}
                      type="search"
                      data-animation-history="ignore"
                      role="combobox"
                      aria-label="Search animated properties"
                      aria-autocomplete="list"
                      aria-controls="timeline-property-results"
                      aria-expanded="true"
                      aria-activedescendant={activePropertyBindingId}
                      placeholder="Search target, component, or property..."
                      value={propertySearch}
                      onChange={(event) => {
                        setPropertySearch(event.target.value);
                        setActivePropertyBindingKey(null);
                      }}
                      onKeyDown={handlePropertySearchKeyDown}
                    />
                  </label>
                  <div
                    id="timeline-property-results"
                    className="timeline-property-results"
                    role="listbox"
                    aria-label="Animated properties"
                  >
                    {propertyBindingGroups.map((group, groupIndex) => (
                      <section
                        key={group.key}
                        className="timeline-property-group"
                        role="group"
                        aria-labelledby={`timeline-property-group-${groupIndex}`}
                      >
                        <div
                          id={`timeline-property-group-${groupIndex}`}
                          className="timeline-property-group-label"
                        >
                          {group.label}
                        </div>
                        {group.bindings.map((binding) => (
                          <button
                            type="button"
                            role="option"
                            id={`timeline-property-option-${propertyBindingIndexByKey.get(animationBindingKey(binding))}`}
                            key={animationBindingKey(binding)}
                            ref={(element) => {
                              const key = animationBindingKey(binding);
                              if (element) propertyOptionRefs.current.set(key, element);
                              else propertyOptionRefs.current.delete(key);
                            }}
                            className={activePropertyBindingKey === animationBindingKey(binding) ? 'active' : ''}
                            aria-selected={activePropertyBindingKey === animationBindingKey(binding)}
                            tabIndex={-1}
                            title={binding.label}
                            onPointerEnter={() => setActivePropertyBindingKey(animationBindingKey(binding))}
                            onClick={() => selectPropertyBinding(animationBindingKey(binding))}
                          >
                            {binding.property}
                          </button>
                        ))}
                      </section>
                    ))}
                    {propertySearchResult.matchCount === 0 && (
                      <div className="timeline-property-empty">No matching properties</div>
                    )}
                  </div>
                  <footer>
                    <span className="timeline-property-result-status" role="status" aria-live="polite">
                      {propertySearchResult.truncated
                        ? `Showing ${propertySearchResult.bindings.length} of ${propertySearchResult.matchCount}. Refine the search to see more.`
                        : `${propertySearchResult.matchCount} ${propertySearchResult.matchCount === 1 ? 'property' : 'properties'}`}
                    </span>
                    <span className="timeline-property-keyboard-hint">↑↓ Navigate · PgUp/PgDn Jump · Enter Add · Esc Close</span>
                  </footer>
                </div>,
                document.body,
              )}
            </div>
            <button
              type="button"
              className={`timeline-icon-button timeline-manual-binding-toggle${manualPropertyOpen ? ' active' : ''}`}
              aria-label={manualPropertyOpen ? 'Hide manual property path' : 'Add property by path'}
              aria-expanded={manualPropertyOpen}
              title="Advanced: add a Component.property path"
              onClick={() => {
                setPropertyPickerOpen(false);
                setManualPropertyOpen((open) => !open);
              }}
            >
              <Code2 size={13} aria-hidden="true" />
            </button>
            {manualPropertyOpen && <>
              <input
                className="timeline-property-path"
                data-animation-history="ignore"
                aria-label="Property track"
                title="Component.property，例如 Transform.position"
                value={propertyPath}
                onChange={(event) => setPropertyPath(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && addManualProperty()) setManualPropertyOpen(false);
                  if (event.key === 'Escape') setManualPropertyOpen(false);
                }}
              />
              <button
                type="button"
                className="timeline-icon-button"
                aria-label="Add manual property track"
                title="Add manual property track"
                onClick={() => {
                  if (addManualProperty()) setManualPropertyOpen(false);
                }}
              >
                <Plus size={13} aria-hidden="true" />
              </button>
            </>}
            <button type="button" onClick={addEvent} title="Add animation event at the playhead">
              <Plus size={13} aria-hidden="true" /><span>Event</span>
            </button>
            <button type="button" disabled={selectedTrack == null} onClick={recordKey} title="Add key at the playhead (K)">
              <Plus size={13} aria-hidden="true" /><span>Key</span>
            </button>
            <button
              type="button"
              className="timeline-selection-command"
              aria-label="Copy selected key or event"
              disabled={!canCopySelection}
              onClick={copySelection}
              title="Copy selected key or event (Ctrl/Cmd+C)"
            >
              <Copy size={13} aria-hidden="true" /><span>Copy</span>
            </button>
            <button
              type="button"
              className="timeline-selection-command"
              aria-label="Paste key or event at the playhead"
              disabled={!timelineClipboard}
              onClick={() => pasteSelection()}
              title="Paste key or event at the playhead (Ctrl/Cmd+V)"
            >
              <ClipboardPaste size={13} aria-hidden="true" /><span>Paste</span>
            </button>
            <button
              type="button"
              className="timeline-danger-button"
              aria-label="Delete selected track"
              disabled={selectedTrack == null}
              onClick={deleteTrack}
              title="Delete selected track"
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>

          <div
            className="timeline-grid-scroll"
            hidden={viewMode === 'curves'}
            onWheel={(event) => {
              if (event.ctrlKey) {
                event.preventDefault();
                setZoom((value) => event.deltaY < 0
                  ? Math.min(8, Number((value * 1.15).toFixed(2)))
                  : Math.max(1, Number((value / 1.15).toFixed(2))));
                return;
              }
              if (event.shiftKey && event.deltaY !== 0) {
                const lanes = event.currentTarget.querySelector<HTMLElement>('.timeline-lanes-scroll');
                if (lanes && lanes.scrollWidth > lanes.clientWidth) {
                  event.preventDefault();
                  lanes.scrollLeft += event.deltaY;
                }
              }
            }}
          >
            <div className="timeline-grid">
              <div className="timeline-labels-column">
                <div className="timeline-ruler-label">Target / Property</div>
                <button
                  type="button"
                  className={`timeline-track-label timeline-event-row${selectedEvent != null ? ' selected' : ''}`}
                  onClick={() => {
                    setSelectedTrack(null);
                    setSelectedKeys([]);
                    setSelectedKey(null);
                    setSelectedEvent(null);
                  }}
                >
                  <strong>Animation Events</strong>
                  <span>{clip.events.length} event{clip.events.length === 1 ? '' : 's'}</span>
                </button>
                {clip.tracks.map((track, index) => (
                  <button
                    type="button"
                    className={`timeline-track-label${selectedTrack === index ? ' selected' : ''}`}
                    key={`${track.target}:${track.component}.${track.property}:${index}`}
                    onClick={() => {
                      setSelectedTrack(index);
                      setSelectedKeys([]);
                      setSelectedKey(null);
                      setSelectedEvent(null);
                    }}
                  >
                    <strong>{track.component}.{track.property}</strong>
                    <span>{track.target} · {track.interpolation}</span>
                  </button>
                ))}
                {clip.tracks.length === 0 && <div className="timeline-empty-row">No property tracks</div>}
              </div>

              <div
                className="timeline-lanes-scroll"
                role="region"
                aria-label="Animation dope sheet"
                title="Ctrl + Wheel to zoom · Shift + Wheel to scroll horizontally"
              >
                <div
                  className="timeline-lanes"
                  style={{ width: `${zoom * 100}%` }}
                  onPointerDown={beginTimelineMarquee}
                  onPointerMove={moveTimelineMarquee}
                  onPointerUp={(event) => finishTimelineMarquee(event, true)}
                  onPointerCancel={(event) => finishTimelineMarquee(event, false)}
                >
                  <div
                    className="timeline-ruler"
                    title="Drag to move the playhead"
                    onPointerDown={beginScrub}
                    onPointerMove={moveScrub}
                    onPointerUp={finishScrub}
                    onPointerCancel={finishScrub}
                  >
                    {Array.from({ length: rulerSteps + 1 }, (_unused, index) => (
                      <span
                        key={index}
                        style={{ left: `clamp(12px, ${index / rulerSteps * 100}%, calc(100% - 12px))` }}
                      >
                        {(clip.duration * index / rulerSteps).toFixed(2)}
                      </span>
                    ))}
                    <i style={{ left: `${clip.duration > 0 ? time / clip.duration * 100 : 0}%` }} />
                  </div>
                  <div className={`timeline-track-keys timeline-event-row${selectedEvent != null ? ' selected' : ''}`}>
                    {clip.events.map((animationEvent, eventIndex) => {
                      const displayTime = timelineDrag?.kind === 'event' && timelineDrag.index === eventIndex
                        ? timelineDrag.time
                        : animationEvent.time;
                      return (
                        <button
                          type="button"
                          className={`timeline-event-key${selectedEvent === eventIndex ? ' selected' : ''}${timelineDrag?.kind === 'event' && timelineDrag.index === eventIndex ? ' dragging' : ''}`}
                          key={eventIndex}
                          aria-label={`Animation event at ${displayTime.toFixed(3)} seconds`}
                          title={`${displayTime.toFixed(3)} s - ${animationEvent.function}`}
                          style={{ left: `clamp(6px, ${clip.duration > 0 ? displayTime / clip.duration * 100 : 0}%, calc(100% - 6px))` }}
                          onPointerDown={(event) => beginTimelineDrag(event, 'event', -1, eventIndex, animationEvent.time)}
                          onPointerMove={moveTimelineDrag}
                          onPointerUp={(event) => finishTimelineDrag(event, true)}
                          onPointerCancel={(event) => finishTimelineDrag(event, false)}
                          onLostPointerCapture={(event) => finishTimelineDrag(event, true)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedTrack(null);
                            setSelectedKeys([]);
                            setSelectedKey(null);
                            setSelectedEvent(eventIndex);
                            setDetailsOpen(true);
                          }}
                        />
                      );
                    })}
                    <i className="timeline-playhead" style={{ left: `${clip.duration > 0 ? time / clip.duration * 100 : 0}%` }} />
                  </div>

                  {clip.tracks.map((track, index) => (
                    <div
                      className={`timeline-track-keys${selectedTrack === index ? ' selected' : ''}`}
                      key={`${track.target}:${track.component}.${track.property}:${index}`}
                    >
                      {track.keyframes.map((key, keyIndex) => {
                        const selected = activeSelectedKeys.some((candidate) => (
                          candidate.track === index && candidate.key === keyIndex
                        ));
                        const dragged = timelineDrag?.kind === 'key'
                          && timelineDrag.selection.some((candidate) => (
                            candidate.track === index && candidate.key === keyIndex
                          ));
                        const displayTime = timelineDrag?.kind === 'key'
                          && dragged
                          ? key.time + timelineDrag.delta
                          : key.time;
                        return (
                          <button
                            type="button"
                            className={`timeline-key${selected ? ' selected' : ''}${dragged ? ' dragging' : ''}`}
                            key={keyIndex}
                            aria-pressed={selected}
                            aria-label={`Keyframe at ${displayTime.toFixed(3)} seconds`}
                            title={`${displayTime.toFixed(3)} s · ${valueLabel(key.value)}`}
                            style={{ left: `clamp(6px, ${clip.duration > 0 ? displayTime / clip.duration * 100 : 0}%, calc(100% - 6px))` }}
                            onPointerDown={(event) => beginTimelineDrag(event, 'key', index, keyIndex, key.time)}
                            onPointerMove={moveTimelineDrag}
                            onPointerUp={(event) => finishTimelineDrag(event, true)}
                            onPointerCancel={(event) => finishTimelineDrag(event, false)}
                            onLostPointerCapture={(event) => finishTimelineDrag(event, true)}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetailsOpen(true);
                            }}
                          />
                        );
                      })}
                      <i className="timeline-playhead" style={{ left: `${clip.duration > 0 ? time / clip.duration * 100 : 0}%` }} />
                    </div>
                  ))}
                  {clip.tracks.length === 0 && (
                    <div className="timeline-empty-row timeline-empty-lane">Choose a property above, then add a track.</div>
                  )}
                  {timelineDragFeedback && (
                    <div
                      className={`timeline-drag-frame-guide${timelineDragFeedback.time > clip.duration * 0.82 ? ' edge' : ''}`}
                      style={{ left: `${clip.duration > 0 ? timelineDragFeedback.time / clip.duration * 100 : 0}%` }}
                      aria-hidden="true"
                    >
                      <span>{timelineDragFeedback.label}</span>
                    </div>
                  )}
                  {timelineMarquee && (timelineMarquee.width >= 4 || timelineMarquee.height >= 4) && (
                    <i
                      className="timeline-marquee"
                      style={{
                        left: timelineMarquee.x,
                        top: timelineMarquee.y,
                        width: timelineMarquee.width,
                        height: timelineMarquee.height,
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="timeline-values-column">
                <div className="timeline-ruler-value">Sample</div>
                <div className={`timeline-track-value timeline-event-row${selectedEvent != null ? ' selected' : ''}`}>
                  {clip.events
                    .filter((animationEvent) => Math.abs(animationEvent.time - time) < 0.5 / Math.max(1, clip.frame_rate))
                    .map((animationEvent) => animationEvent.function)
                    .join(', ') || '—'}
                </div>
                {clip.tracks.map((track, index) => {
                  const sample = samples.find((candidate) => (
                    candidate.target === track.target
                    && candidate.component === track.component
                    && candidate.property === track.property
                  ))?.value;
                  return (
                    <div className={`timeline-track-value${selectedTrack === index ? ' selected' : ''}`} key={`${track.target}:${track.component}.${track.property}:${index}`}>
                      {sample == null ? '—' : valueLabel(sample)}
                    </div>
                  );
                })}
                {clip.tracks.length === 0 && <div className="timeline-empty-row" />}
              </div>
            </div>
          </div>

          {viewMode === 'curves' && (
            <AnimationCurveWorkspace
              key={selectedTrack ?? 'no-track'}
              track={selectedTrackData}
              trackIndex={selectedTrack}
              duration={clip.duration}
              frameRate={clip.frame_rate}
              time={time}
              zoom={zoom}
              selectedKey={selectedKey}
              onSelectKey={(key) => {
                selectKeys([key]);
                setDetailsOpen(true);
              }}
              onPreviewTime={setPreviewTime}
              onCommitKey={updateCurveKey}
              onCommitTangent={updateCurveTangent}
              onSetTangents={setSelectedCurveTangents}
              onEnableCubic={enableSelectedCurveCubic}
            />
          )}

          {detailsOpen && (
            <aside className="timeline-details" aria-label="Timeline details">
              <header>
                <strong>Details</strong>
                <button type="button" className="timeline-icon-button" aria-label="Close timeline details" onClick={() => setDetailsOpen(false)}>
                  <PanelRightClose size={13} aria-hidden="true" />
                </button>
              </header>

              <section>
                <h3>Clip</h3>
                <div className="timeline-details-form">
                  <label>Name <input value={clip.name} onChange={(event) => updateClip({ ...clip, name: event.target.value }, 'Rename Animation Clip')} /></label>
                  <label>Duration <input type="number" min={0} step={0.1} value={clip.duration} onChange={(event) => updateClip(normalizeAnimationClip({ ...clip, duration: Number(event.target.value) }), 'Edit Animation Duration')} /></label>
                  <label>FPS <input type="number" min={1} step={1} value={clip.frame_rate} onChange={(event) => updateClip(normalizeAnimationClip({ ...clip, frame_rate: Number(event.target.value) }), 'Edit Animation Frame Rate')} /></label>
                  <label>Wrap <select value={clip.wrap_mode} onChange={(event) => updateClip({ ...clip, wrap_mode: event.target.value as AnimationClip['wrap_mode'] }, 'Edit Animation Wrap Mode')}>
                    <option value="once">Once</option>
                    <option value="loop">Loop</option>
                    <option value="ping_pong">Ping Pong</option>
                  </select></label>
                </div>
              </section>

              {selectedTrack != null && clip.tracks[selectedTrack] && (
                <section>
                  <h3>Track</h3>
                  <div className="timeline-details-form">
                    <label>Target <input aria-label="Animation track target" value={clip.tracks[selectedTrack].target} onChange={(event) => updateClip({
                      ...clip,
                      tracks: clip.tracks.map((track, index) => index === selectedTrack ? { ...track, target: event.target.value } : track),
                    }, 'Edit Animation Track Target')} /></label>
                    <label>Interpolation <select aria-label="Animation track interpolation" value={clip.tracks[selectedTrack].interpolation} onChange={(event) => updateClip({
                      ...clip,
                      tracks: clip.tracks.map((track, index) => index === selectedTrack ? { ...track, interpolation: event.target.value as AnimationTrack['interpolation'] } : track),
                    }, 'Edit Animation Interpolation')}>
                      <option value="step">Step</option>
                      <option value="linear">Linear</option>
                      <option value="smooth">Smooth</option>
                      <option value="cubic">Cubic (Hermite)</option>
                    </select></label>
                  </div>
                </section>
              )}

              {selectedKeyframe && selectedKey && (
                <section ref={selectionDetailsRef}>
                  <h3>Keyframe{activeSelectedKeys.length > 1 ? `s · ${activeSelectedKeys.length} selected` : ''}</h3>
                  {selectedKeyFrameRange && (
                    <div
                      className="timeline-selection-frame-range"
                      aria-label={selectedKeyFrameRange.startFrame === selectedKeyFrameRange.endFrame
                        ? `Selected frame ${selectedKeyFrameRange.startFrame}`
                        : `Selected frames ${selectedKeyFrameRange.startFrame} through ${selectedKeyFrameRange.endFrame}`}
                    >
                      <span>{selectedKeyFrameRange.count === 1 ? 'Frame' : 'Range'}</span>
                      <strong>
                        {selectedKeyFrameRange.startFrame === selectedKeyFrameRange.endFrame
                          ? selectedKeyFrameRange.startFrame
                          : `${selectedKeyFrameRange.startFrame}–${selectedKeyFrameRange.endFrame}`}
                      </strong>
                      <span>{selectedKeyFrameRange.count === 1
                        ? `${selectedKeyframe.time.toFixed(3)}s`
                        : `${selectedKeyFrameRange.spanFrames}f span`}</span>
                    </div>
                  )}
                  <div className="timeline-selection-nudge">
                    <button
                      type="button"
                      aria-label="Move selected keys back one frame"
                      aria-keyshortcuts="Alt+ArrowLeft"
                      title="Move selected keys back 1 frame (Alt+Left; add Shift for 10 frames)"
                      disabled={!canNudgeSelectedKeysBackward}
                      onClick={() => moveSelectedKeysByFrames(-1)}
                    >
                      <ChevronLeft size={12} aria-hidden="true" /> −1f
                    </button>
                    <button
                      type="button"
                      aria-label="Move selected keys forward one frame"
                      aria-keyshortcuts="Alt+ArrowRight"
                      title="Move selected keys forward 1 frame (Alt+Right; add Shift for 10 frames)"
                      disabled={!canNudgeSelectedKeysForward}
                      onClick={() => moveSelectedKeysByFrames(1)}
                    >
                      +1f <ChevronRight size={12} aria-hidden="true" />
                    </button>
                  </div>
                  {activeSelectedKeys.length > 1 && (
                    <>
                      {selectedKeyFrameRange && (
                        <div className="timeline-selection-retime" aria-label="Retime selected keyframes">
                          <label>
                            Start
                            <input
                              aria-label="Selection start frame"
                              type="number"
                              min={0}
                              max={selectedKeyFrameRange.endFrame}
                              step={1}
                              value={selectedKeyFrameRange.startFrame}
                              onChange={(event) => {
                                if (Number.isFinite(event.target.valueAsNumber)) {
                                  retimeSelectedKeys(event.target.valueAsNumber, selectedKeyFrameRange.endFrame);
                                }
                              }}
                            />
                            <span>f</span>
                          </label>
                          <label>
                            End
                            <input
                              aria-label="Selection end frame"
                              type="number"
                              min={selectedKeyFrameRange.startFrame}
                              max={Math.round(clip.duration * Math.max(1, clip.frame_rate))}
                              step={1}
                              value={selectedKeyFrameRange.endFrame}
                              onChange={(event) => {
                                if (Number.isFinite(event.target.valueAsNumber)) {
                                  retimeSelectedKeys(selectedKeyFrameRange.startFrame, event.target.valueAsNumber);
                                }
                              }}
                            />
                            <span>f</span>
                          </label>
                        </div>
                      )}
                      <div className="timeline-multi-selection-summary">
                        Start/End retime the whole selection. Value editing applies only to the primary key.
                      </div>
                    </>
                  )}
                  <div className="timeline-details-form">
                    {activeSelectedKeys.length === 1 && (
                      <>
                        <label>Frame <input aria-label="Keyframe frame" type="number" min={0} max={Math.round(clip.duration * Math.max(1, clip.frame_rate))} step={1} value={Math.round(selectedKeyframe.time * Math.max(1, clip.frame_rate))} onChange={(event) => {
                          if (Number.isFinite(event.target.valueAsNumber)) updateSelectedKey({ time: event.target.valueAsNumber / Math.max(1, clip.frame_rate) });
                        }} /></label>
                        <label>Time <input aria-label="Keyframe time" type="number" min={0} max={clip.duration} step={1 / Math.max(1, clip.frame_rate)} value={selectedKeyframe.time} onChange={(event) => {
                          if (Number.isFinite(event.target.valueAsNumber)) updateSelectedKey({ time: event.target.valueAsNumber });
                        }} /></label>
                      </>
                    )}
                    <KeyframeValueEditor label={activeSelectedKeys.length > 1 ? 'Primary Value' : 'Value'} value={selectedKeyframe.value} onChange={(value) => updateSelectedKey({ value })} />
                  </div>
                  {clip.tracks[selectedKey.track].interpolation === 'cubic' && (() => {
                    const track = clip.tracks[selectedKey.track];
                    const automatic = automaticAnimationTangent(track, selectedKey.key);
                    if (automatic == null) return <span className="timeline-selection-hint">Cubic tangents require a numeric track.</span>;
                    return (
                      <div className="timeline-tangent-editors">
                        <div><KeyframeValueEditor label="In Tangent" value={selectedKeyframe.in_tangent ?? automatic} onChange={(value) => {
                          if (typeof value === 'number' || Array.isArray(value)) updateSelectedTangent('in_tangent', value);
                        }} /><button type="button" className={selectedKeyframe.in_tangent === undefined ? 'active' : ''} onClick={() => updateSelectedTangent('in_tangent', null)}>Auto</button></div>
                        <div><KeyframeValueEditor label="Out Tangent" value={selectedKeyframe.out_tangent ?? automatic} onChange={(value) => {
                          if (typeof value === 'number' || Array.isArray(value)) updateSelectedTangent('out_tangent', value);
                        }} /><button type="button" className={selectedKeyframe.out_tangent === undefined ? 'active' : ''} onClick={() => updateSelectedTangent('out_tangent', null)}>Auto</button></div>
                      </div>
                    );
                  })()}
                  <button type="button" className="timeline-delete-selection" onClick={deleteSelectedKey}>
                    <Trash2 size={13} aria-hidden="true" /> Delete {activeSelectedKeys.length > 1 ? `${activeSelectedKeys.length} Keys` : 'Key'}
                  </button>
                </section>
              )}

              {selectedAnimationEvent && (
                <section ref={selectionDetailsRef} className="timeline-event-editor">
                  <h3>Animation Event</h3>
                  <div className="timeline-details-form">
                    <label>Function <input aria-label="Animation event function" value={selectedAnimationEvent.function} onChange={(event) => updateSelectedEvent({ function: event.target.value })} /></label>
                    <label>Time <input aria-label="Animation event time" type="number" min={0} max={clip.duration} step={1 / Math.max(1, clip.frame_rate)} value={selectedAnimationEvent.time} onChange={(event) => {
                      if (Number.isFinite(event.target.valueAsNumber)) updateSelectedEvent({ time: event.target.valueAsNumber });
                    }} /></label>
                    <AnimationEventParameterEditor value={selectedAnimationEvent.parameter} onChange={(parameter) => updateSelectedEvent({ parameter })} />
                  </div>
                  <button type="button" className="timeline-delete-selection" onClick={deleteSelectedEvent}>
                    <Trash2 size={13} aria-hidden="true" /> Delete Event
                  </button>
                </section>
              )}

              {selectedTrackData && viewMode === 'dope_sheet' && <AnimationCurvePreview track={selectedTrackData} duration={clip.duration} time={time} />}
              {!selectedTrackData && !selectedAnimationEvent && (
                <div className="timeline-details-empty">Select a track, keyframe, or event to inspect it.</div>
              )}
              <footer>Ctrl/Shift+Click: Multi-select · Box Drag: Select · Drag: Move · Esc: Cancel Drag · Alt+←/→: Nudge 1f · Add Shift: 10f · Ctrl/Cmd+C/V: Copy/Paste · Delete: Remove</footer>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
