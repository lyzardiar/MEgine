import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import {
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardPaste,
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
  Trash2,
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
  listAnimationPropertyBindings,
  parseAnimationBindingKey,
} from '../animationBindings';
import {
  clampTimelineKeyDelta,
  copyTimelineKeySelection,
  mergeTimelineKeySelection,
  moveTimelineKeySelection,
  normalizeTimelineKeySelection,
  pasteTimelineKeySelection,
  removeTimelineKeySelection,
  timelineKeyRangeSelection,
  timelineKeysInRange,
  toggleTimelineKeySelection,
  type TimelineKeyClipboardItem,
  type TimelineKeyRef,
} from '../timelineKeyEditing.ts';
import {
  listProjectFiles,
  normalizeProjectAssetPath,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerSaveAllParticipant } from '../saveAll';

type SnapshotEntity = WorldSnapshotView['entities'][number];

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
  time: number;
  left: number;
  width: number;
};

type TimelineDrag = TimelineKeyDrag | TimelineEventDrag;

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

function numericChannels(value: AnimationValue | null): number[] | null {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value;
  return null;
}

function AnimationCurvePreview(props: {
  track: AnimationTrack;
  duration: number;
  time: number;
}) {
  const first = numericChannels(props.track.keyframes[0]?.value ?? null);
  if (!first) return null;
  const width = 640;
  const height = 128;
  const duration = Math.max(props.duration, Number.EPSILON);
  const samples = Array.from({ length: 129 }, (_unused, index) => {
    const sampleTime = duration * index / 128;
    return { time: sampleTime, channels: numericChannels(sampleAnimationTrack(props.track, sampleTime)) };
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
          (numericChannels(key.value) ?? []).slice(0, CURVE_COLORS.length).map((value, channel) => (
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

export function Timeline(props: {
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
}) {
  const player = playerOf(props.entity);
  const animator = animatorOf(props.entity);
  const [animatorClipPath, setAnimatorClipPath] = useState('');
  const [animatorStateSpeed, setAnimatorStateSpeed] = useState(1);
  const [animatorStateName, setAnimatorStateName] = useState('');
  const clipPath = animator ? animatorClipPath : player?.clip?.trim() ?? '';
  const [clip, setClip] = useState<AnimationClip | null>(null);
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
  const [propertyBinding, setPropertyBinding] = useState('');
  const [zoom, setZoom] = useState(1);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [timelineClipboard, setTimelineClipboard] = useState<TimelineClipboard | null>(null);
  const [timelineDrag, setTimelineDrag] = useState<TimelineDrag | null>(null);
  const timelineDragRef = useRef<TimelineDrag | null>(null);
  const [timelineMarquee, setTimelineMarquee] = useState<TimelineMarquee | null>(null);
  const timelineMarqueeRef = useRef<TimelineMarquee | null>(null);
  const scrubPointer = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const playbackFrame = useRef<number | null>(null);
  const previousFrameTime = useRef<number | null>(null);
  const playbackPhase = useRef<number | null>(null);
  const recordingValues = useRef(new Map<string, string | null>());
  const loadedClipPath = useRef('');
  const drafts = useRef(new Map<string, {
    clip: AnimationClip;
    savedText: string;
    time: number;
    selectedTrack: number | null;
    selectedKey: { track: number; key: number } | null;
    selectedKeys: TimelineKeyRef[];
    selectedEvent: number | null;
  }>());

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
    let cancelled = false;
    const previousPath = loadedClipPath.current;
    if (previousPath && clip) {
      if (serializeAnimationClip(clip) !== savedText) {
        drafts.current.set(previousPath, {
          clip: structuredClone(clip),
          savedText,
          time,
          selectedTrack,
          selectedKey: selectedKey ? { ...selectedKey } : null,
          selectedKeys: selectedKeys.map((ref) => ({ ...ref })),
          selectedEvent,
        });
      } else {
        drafts.current.delete(previousPath);
      }
    }
    loadedClipPath.current = clipPath;
    setPlaying(false);
    setRecording(false);
    timelineDragRef.current = null;
    setTimelineDrag(null);
    timelineMarqueeRef.current = null;
    setTimelineMarquee(null);
    recordingValues.current.clear();
    setError(null);
    setClip(null);
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
      setClip(structuredClone(draft.clip));
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
        setClip(loaded);
        setSavedText(serializeAnimationClip(loaded));
        const authoredTime = Number(player?.time ?? 0);
        playbackPhase.current = Number.isFinite(authoredTime) ? authoredTime : 0;
        setTime(wrappedAnimationTime(authoredTime, loaded.duration, loaded.wrap_mode));
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setClip(null);
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
  const anyDirty = dirty || drafts.current.size > 0;

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
    setClip({ ...clip, tracks });
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
    setClip(normalized);
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
    if (drafts.current.size > 0) setSaving(true);
    try {
      for (const [path, draft] of [...drafts.current]) {
        try {
          const normalized = normalizeAnimationClip(draft.clip);
          await writeProjectAssetText(path, serializeAnimationClip(normalized));
          drafts.current.delete(path);
          props.onLog(`Saved ${path}`);
        } catch (reason) {
          failures.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      await refreshProjectFiles();
      props.onAssetsChanged();
    } finally {
      setSaving(false);
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
        const currentText = serializeAnimationClip(clip);
        if (currentText !== savedText) {
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
      }
      loadedClipPath.current = path;
      assignClip(path);
      setClip(next);
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

  const addProperty = () => {
    if (!clip || !props.entity) return;
    const picked = parseAnimationBindingKey(propertyBinding);
    const raw = propertyPath.trim();
    const dot = raw.indexOf('.');
    const target = picked?.target ?? '.';
    const component = picked?.component ?? raw.slice(0, dot).trim();
    const property = picked?.property ?? raw.slice(dot + 1).trim();
    const bindingTarget = targetEntity(props.authoredEntities, props.entity, target);
    const value = dot > 0 || picked
      ? getProperty(bindingTarget?.components[component], property)
      : null;
    if (!component || !property || value == null) {
      props.onLog(`无法记录属性：${raw}`, 'warn');
      return;
    }
    const existing = clip.tracks.findIndex((track) => (
      track.target === target && track.component === component && track.property === property
    ));
    if (existing >= 0) {
      setSelectedTrack(existing);
      setSelectedKeys([]);
      setSelectedKey(null);
      props.onLog(`${component}.${property} 已在当前 Animation Clip 中`, 'warn');
      return;
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
    setClip(next);
    setPropertyBinding('');
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
    setClip({ ...clip, tracks });
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
    setClip({ ...clip, tracks });
  };

  const addEvent = () => {
    if (!clip) return;
    const result = addAnimationEvent(clip, time);
    setClip(result.clip);
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
    setClip(result.clip);
    setSelectedEvent(result.eventIndex);
    const next = result.clip.events[result.eventIndex].time;
    playbackPhase.current = next;
    setTime(next);
  };

  const deleteSelectedEvent = () => {
    if (!clip || selectedEvent == null) return;
    setClip(removeAnimationEvent(clip, selectedEvent));
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
  const rulerSteps = Math.min(80, Math.max(5, Math.round(5 * zoom)));
  const canCopySelection = activeSelectedKeys.length > 0 || selectedAnimationEvent != null;
  const canMaximizePanel = !new URLSearchParams(window.location.search).has('detachedPanel');

  const selectKeys = (
    selection: readonly TimelineKeyRef[],
    sourceClip: AnimationClip | null = clip,
  ) => {
    const normalized = sourceClip ? normalizeTimelineKeySelection(sourceClip, selection) : [];
    const primary = normalized[normalized.length - 1] ?? null;
    setSelectedKeys(normalized);
    setSelectedKey(primary);
    if (primary) setSelectedTrack(primary.track);
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
    setClip({
      ...clip,
      tracks: clip.tracks.map((candidate, index) => (
        index === selectedKey.track ? result.track : candidate
      )),
    });
    const primary = { track: selectedKey.track, key: result.keyIndex };
    setSelectedKeys([primary]);
    setSelectedKey(primary);
    const next = result.track.keyframes[result.keyIndex].time;
    playbackPhase.current = next;
    setTime(next);
  };

  const deleteSelectedKey = () => {
    if (!clip || activeSelectedKeys.length === 0) return;
    setClip(removeTimelineKeySelection(clip, activeSelectedKeys));
    setSelectedKeys([]);
    setSelectedKey(null);
  };

  const moveSelectedKeysByFrames = (frames: number) => {
    if (!clip || activeSelectedKeys.length === 0 || !Number.isFinite(frames)) return;
    const result = moveTimelineKeySelection(
      clip,
      activeSelectedKeys,
      frames / Math.max(1, clip.frame_rate),
    );
    if (result.appliedDelta === 0) return;
    setClip(result.clip);
    selectKeys(result.selection, result.clip);
    const primary = result.selection[result.selection.length - 1];
    if (primary) {
      const next = result.clip.tracks[primary.track].keyframes[primary.key].time;
      playbackPhase.current = next;
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
    setClip({
      ...clip,
      tracks: clip.tracks.map((candidate, index) => index === selectedKey.track ? next : candidate),
    });
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
      setClip(pasted.clip);
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
    setClip(pasted.clip);
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
    if (target.closest('input, select, textarea')) return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === 'c') {
      if (selectionClipboard()) {
        event.preventDefault();
        copySelection();
      }
      return;
    }
    if (command && event.key.toLowerCase() === 'v') {
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
    setTime(previewTime);
  };

  const finishTimelineDrag = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    const drag = timelineDragRef.current;
    if (!clip || !drag || drag.pointerId !== event.pointerId) return;
    timelineDragRef.current = null;
    setTimelineDrag(null);
    if (!commit) return;
    if (drag.kind === 'event') {
      const result = replaceAnimationEvent(clip, drag.index, { time: drag.time });
      if (!result) return;
      setClip(result.clip);
      setSelectedEvent(result.eventIndex);
      return;
    }
    const result = moveTimelineKeySelection(clip, drag.selection, drag.delta);
    setClip(result.clip);
    selectKeys(result.selection, result.clip);
  };

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

  if (!props.entity) {
    return <div className="timeline-empty">选择一个 GameObject 以创建或编辑动画。</div>;
  }

  if ((!player && !animator) || !clipPath) {
    return (
      <div
        className="timeline-empty timeline-drop-zone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={dropClip}
      >
        <strong>{props.entity.name ?? `Entity ${props.entity.entity}`}</strong>
        <span>{animator
          ? (error ?? 'Animator 尚未绑定有效的 Controller/State；请在 Animator 面板中配置。')
          : '尚未绑定 Animation Clip，可创建新资源或把 Project 中的 `.manim` 拖到这里。'}
        </span>
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
          onPointerDown={(event) => {
            const target = event.target as HTMLElement;
            if (!target.closest('button, input, select, textarea')) {
              workspaceRef.current?.focus({ preventScroll: true });
            }
          }}
        >
          <div className="timeline-track-tools">
            <select
              className="timeline-property-picker"
              aria-label="Animatable property picker"
              value={propertyBinding}
              onChange={(event) => {
                setPropertyBinding(event.target.value);
                const binding = parseAnimationBindingKey(event.target.value);
                if (binding) setPropertyPath(`${binding.component}.${binding.property}`);
              }}
            >
              <option value="">Choose target property...</option>
              {propertyBindings.map((binding) => (
                <option key={animationBindingKey(binding)} value={animationBindingKey(binding)}>
                  {binding.label}
                </option>
              ))}
            </select>
            <input
              className="timeline-property-path"
              aria-label="Property track"
              title="Component.property，例如 Transform.position"
              value={propertyPath}
              onChange={(event) => {
                setPropertyPath(event.target.value);
                setPropertyBinding('');
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addProperty();
              }}
            />
            <button type="button" onClick={addProperty} title="Add selected property as a track">
              <Plus size={13} aria-hidden="true" /><span>Track</span>
            </button>
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
            onWheel={(event) => {
              if (!event.ctrlKey) return;
              event.preventDefault();
              setZoom((value) => event.deltaY < 0
                ? Math.min(8, Number((value * 1.15).toFixed(2)))
                : Math.max(1, Number((value / 1.15).toFixed(2))));
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

              <div className="timeline-lanes-scroll">
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
                      <span key={index} style={{ left: `${index / rulerSteps * 100}%` }}>{(clip.duration * index / rulerSteps).toFixed(2)}</span>
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
                            onClick={(event) => {
                              event.stopPropagation();
                              setDetailsOpen(true);
                              setPreviewTime(key.time);
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
                  <label>Name <input value={clip.name} onChange={(event) => setClip({ ...clip, name: event.target.value })} /></label>
                  <label>Duration <input type="number" min={0} step={0.1} value={clip.duration} onChange={(event) => setClip(normalizeAnimationClip({ ...clip, duration: Number(event.target.value) }))} /></label>
                  <label>FPS <input type="number" min={1} step={1} value={clip.frame_rate} onChange={(event) => setClip(normalizeAnimationClip({ ...clip, frame_rate: Number(event.target.value) }))} /></label>
                  <label>Wrap <select value={clip.wrap_mode} onChange={(event) => setClip({ ...clip, wrap_mode: event.target.value as AnimationClip['wrap_mode'] })}>
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
                    <label>Target <input aria-label="Animation track target" value={clip.tracks[selectedTrack].target} onChange={(event) => setClip({
                      ...clip,
                      tracks: clip.tracks.map((track, index) => index === selectedTrack ? { ...track, target: event.target.value } : track),
                    })} /></label>
                    <label>Interpolation <select aria-label="Animation track interpolation" value={clip.tracks[selectedTrack].interpolation} onChange={(event) => setClip({
                      ...clip,
                      tracks: clip.tracks.map((track, index) => index === selectedTrack ? { ...track, interpolation: event.target.value as AnimationTrack['interpolation'] } : track),
                    })}>
                      <option value="step">Step</option>
                      <option value="linear">Linear</option>
                      <option value="smooth">Smooth</option>
                      <option value="cubic">Cubic (Hermite)</option>
                    </select></label>
                  </div>
                </section>
              )}

              {selectedKeyframe && selectedKey && (
                <section>
                  <h3>Keyframe{activeSelectedKeys.length > 1 ? `s · ${activeSelectedKeys.length} selected` : ''}</h3>
                  {activeSelectedKeys.length > 1 && (
                    <div className="timeline-multi-selection-summary">
                      Editing values applies to the primary key. Move, copy, paste, and delete apply to the whole selection.
                    </div>
                  )}
                  <div className="timeline-details-form">
                    <label>Time <input aria-label="Keyframe time" type="number" min={0} max={clip.duration} step={1 / Math.max(1, clip.frame_rate)} value={selectedKeyframe.time} onChange={(event) => {
                      if (Number.isFinite(event.target.valueAsNumber)) updateSelectedKey({ time: event.target.valueAsNumber });
                    }} /></label>
                    <KeyframeValueEditor value={selectedKeyframe.value} onChange={(value) => updateSelectedKey({ value })} />
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
                  <div className="timeline-selection-nudge">
                    <button type="button" onClick={() => moveSelectedKeysByFrames(-1)}>−1 Frame</button>
                    <button type="button" onClick={() => moveSelectedKeysByFrames(1)}>+1 Frame</button>
                  </div>
                  <button type="button" className="timeline-delete-selection" onClick={deleteSelectedKey}>
                    <Trash2 size={13} aria-hidden="true" /> Delete {activeSelectedKeys.length > 1 ? `${activeSelectedKeys.length} Keys` : 'Key'}
                  </button>
                </section>
              )}

              {selectedAnimationEvent && (
                <section className="timeline-event-editor">
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

              {selectedTrackData && <AnimationCurvePreview track={selectedTrackData} duration={clip.duration} time={time} />}
              {!selectedTrackData && !selectedAnimationEvent && (
                <div className="timeline-details-empty">Select a track, keyframe, or event to inspect it.</div>
              )}
              <footer>Ctrl/Shift+Click: Multi-select · Box Drag: Select · Drag: Move Selection · Ctrl/Cmd+C/V: Copy/Paste · Shift+Space: Maximize · Delete: Remove</footer>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}
