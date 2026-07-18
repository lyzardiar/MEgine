import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import {
  advanceAnimationPreviewPhase,
  addAnimationEvent,
  createAnimationClip,
  normalizeAnimationClip,
  parseAnimationClip,
  removeAnimationKeyframe,
  removeAnimationEvent,
  replaceAnimationEvent,
  replaceAnimationKeyframe,
  sampleAnimationClip,
  serializeAnimationClip,
  snapAnimationTime,
  upsertAnimationKeyframe,
  wrappedAnimationTime,
  type AnimationClip,
  type AnimationEvent,
  type AnimationKeyframe,
  type AnimationSample,
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
  listProjectFiles,
  normalizeProjectAssetPath,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';

type SnapshotEntity = WorldSnapshotView['entities'][number];

type AnimationPlayerData = {
  clip?: string;
  play_on_awake?: boolean;
  playing?: boolean;
  speed?: number;
  time?: number;
};

type TimelineDrag = {
  kind: 'key' | 'event';
  pointerId: number;
  track: number;
  index: number;
  time: number;
  left: number;
  width: number;
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

function KeyframeValueEditor(props: {
  value: AnimationValue;
  onChange: (value: AnimationValue) => void;
}) {
  if (typeof props.value === 'boolean') {
    return (
      <label className="timeline-key-bool">
        Value
        <input
          aria-label="Keyframe value"
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
        Value
        <span>
          {values.map((part, index) => (
            <input
              key={index}
              aria-label={`Keyframe value ${index + 1}`}
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
      Value
      <input
        aria-label="Keyframe value"
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
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newClipName, setNewClipName] = useState('');
  const [showNewClip, setShowNewClip] = useState(false);
  const [propertyPath, setPropertyPath] = useState('Transform.position');
  const [propertyBinding, setPropertyBinding] = useState('');
  const [timelineDrag, setTimelineDrag] = useState<TimelineDrag | null>(null);
  const timelineDragRef = useRef<TimelineDrag | null>(null);
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
      setSelectedKey(draft.selectedKey ? { ...draft.selectedKey } : null);
      setSelectedEvent(draft.selectedEvent);
      playbackPhase.current = draft.time;
      setLoading(false);
      return () => { cancelled = true; };
    }
    setSelectedTrack(null);
    setSelectedKey(null);
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
            selectedEvent,
          });
        }
      }
      loadedClipPath.current = path;
      assignClip(path);
      setClip(next);
      setSavedText(serializeAnimationClip(next));
      setTime(0);
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
    setSelectedKey({ track: selectedTrack, key: result.keyIndex });
    setSelectedEvent(null);
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
    setSelectedKey(null);
    setClip({ ...clip, tracks });
  };

  const addEvent = () => {
    if (!clip) return;
    const result = addAnimationEvent(clip, time);
    setClip(result.clip);
    setSelectedTrack(null);
    setSelectedKey(null);
    setSelectedEvent(result.eventIndex);
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
    setSelectedKey({ track: selectedKey.track, key: result.keyIndex });
    const next = result.track.keyframes[result.keyIndex].time;
    playbackPhase.current = next;
    setTime(next);
  };

  const deleteSelectedKey = () => {
    if (!clip || !selectedKey) return;
    const track = clip.tracks[selectedKey.track];
    if (!track) return;
    setClip({
      ...clip,
      tracks: clip.tracks.map((candidate, index) => (
        index === selectedKey.track
          ? removeAnimationKeyframe(candidate, selectedKey.key)
          : candidate
      )),
    });
    setSelectedKey(null);
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
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlaying(false);
    const drag: TimelineDrag = {
      kind,
      pointerId: event.pointerId,
      track,
      index,
      time: authoredTime,
      left: rect.left,
      width: Math.max(1, rect.width),
    };
    timelineDragRef.current = drag;
    setTimelineDrag(drag);
    if (kind === 'key') {
      setSelectedTrack(track);
      setSelectedKey({ track, key: index });
      setSelectedEvent(null);
    } else {
      setSelectedTrack(null);
      setSelectedKey(null);
      setSelectedEvent(index);
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
    const updated = { ...drag, time: next };
    timelineDragRef.current = updated;
    setTimelineDrag(updated);
    playbackPhase.current = next;
    setTime(next);
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
    const track = clip.tracks[drag.track];
    const key = track?.keyframes[drag.index];
    if (!track || !key) return;
    const result = replaceAnimationKeyframe(
      track,
      drag.index,
      drag.time,
      key.value,
      clip.frame_rate,
      clip.duration,
    );
    if (!result) return;
    setClip({
      ...clip,
      tracks: clip.tracks.map((candidate, index) => index === drag.track ? result.track : candidate),
    });
    setSelectedTrack(drag.track);
    setSelectedKey({ track: drag.track, key: result.keyIndex });
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
      className="timeline-panel"
      onDragOver={(event) => event.preventDefault()}
      onDrop={dropClip}
    >
      {animator && (
        <div className="timeline-animator-state">
          Animator State: <strong>{animatorStateName}</strong>
        </div>
      )}
      <div className="timeline-toolbar">
        <button
          type="button"
          className={recording ? 'recording' : ''}
          title={recording ? 'Stop recording property changes' : 'Record property changes as keyframes'}
          disabled={!clip}
          onClick={toggleRecording}
        >
          {recording ? 'Stop' : 'Record'}
        </button>
        <button type="button" title="Previous frame" disabled={!clip} onClick={() => {
          if (!clip) return;
          setPlaying(false);
          setTime((value) => {
            const next = Math.max(0, value - 1 / clip.frame_rate);
            playbackPhase.current = next;
            return next;
          });
        }}>◀</button>
        <button type="button" className={playing ? 'active' : ''} disabled={!clip} onClick={() => setPlaying(!playing)}>
          {playing ? 'Ⅱ' : '▶'}
        </button>
        <button type="button" title="Next frame" disabled={!clip} onClick={() => {
          if (!clip) return;
          setPlaying(false);
          setTime((value) => {
            const next = Math.min(clip.duration, value + 1 / clip.frame_rate);
            playbackPhase.current = next;
            return next;
          });
        }}>▶|</button>
        <span className="timeline-time">{time.toFixed(3)} s</span>
        <span className="timeline-clip-path" title={clipPath}>{clipPath}{dirty ? ' *' : ''}</span>
        {!animator && <button type="button" onClick={() => setShowNewClip((value) => !value)} disabled={saving}>New</button>}
        <button type="button" onClick={() => void persist()} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
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
        <>
          <div className="timeline-settings">
            <label>Name <input value={clip.name} onChange={(event) => setClip({ ...clip, name: event.target.value })} /></label>
            <label>Duration <input type="number" min={0} step={0.1} value={clip.duration} onChange={(event) => setClip(normalizeAnimationClip({ ...clip, duration: Number(event.target.value) }))} /></label>
            <label>FPS <input type="number" min={1} step={1} value={clip.frame_rate} onChange={(event) => setClip(normalizeAnimationClip({ ...clip, frame_rate: Number(event.target.value) }))} /></label>
            <label>Wrap <select value={clip.wrap_mode} onChange={(event) => setClip({ ...clip, wrap_mode: event.target.value as AnimationClip['wrap_mode'] })}>
              <option value="once">Once</option>
              <option value="loop">Loop</option>
              <option value="ping_pong">Ping Pong</option>
            </select></label>
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
            <button type="button" onClick={addProperty}>+ Add Property</button>
            <button type="button" onClick={addEvent}>+ Add Event</button>
            <button type="button" disabled={selectedTrack == null} onClick={recordKey}>◆ Add Key</button>
            <button type="button" disabled={selectedTrack == null} onClick={deleteTrack}>Delete Track</button>
          </div>

          {selectedTrack != null && clip.tracks[selectedTrack] && (
            <div className="timeline-selection-editor">
              <label>
                Target
                <input
                  aria-label="Animation track target"
                  value={clip.tracks[selectedTrack].target}
                  onChange={(event) => setClip({
                    ...clip,
                    tracks: clip.tracks.map((track, index) => index === selectedTrack
                      ? { ...track, target: event.target.value }
                      : track),
                  })}
                />
              </label>
              <label>
                Interpolation
                <select
                  aria-label="Animation track interpolation"
                  value={clip.tracks[selectedTrack].interpolation}
                  onChange={(event) => setClip({
                    ...clip,
                    tracks: clip.tracks.map((track, index) => index === selectedTrack
                      ? { ...track, interpolation: event.target.value as AnimationTrack['interpolation'] }
                      : track),
                  })}
                >
                  <option value="step">Step</option>
                  <option value="linear">Linear</option>
                  <option value="smooth">Smooth</option>
                </select>
              </label>
              {selectedKeyframe ? (
                <>
                  <label>
                    Key Time
                    <input
                      aria-label="Keyframe time"
                      type="number"
                      min={0}
                      max={clip.duration}
                      step={1 / Math.max(1, clip.frame_rate)}
                      value={selectedKeyframe.time}
                      onChange={(event) => {
                        if (Number.isFinite(event.target.valueAsNumber)) {
                          updateSelectedKey({ time: event.target.valueAsNumber });
                        }
                      }}
                    />
                  </label>
                  <KeyframeValueEditor
                    value={selectedKeyframe.value}
                    onChange={(value) => updateSelectedKey({ value })}
                  />
                  <button type="button" className="danger" onClick={deleteSelectedKey}>Delete Key</button>
                </>
              ) : (
                <span className="timeline-selection-hint">Select a diamond to edit its time and value.</span>
              )}
            </div>
          )}

          {selectedAnimationEvent && (
            <div className="timeline-selection-editor timeline-event-editor">
              <label>
                Event
                <input
                  aria-label="Animation event function"
                  value={selectedAnimationEvent.function}
                  onChange={(event) => updateSelectedEvent({ function: event.target.value })}
                />
              </label>
              <label>
                Time
                <input
                  aria-label="Animation event time"
                  type="number"
                  min={0}
                  max={clip.duration}
                  step={1 / Math.max(1, clip.frame_rate)}
                  value={selectedAnimationEvent.time}
                  onChange={(event) => {
                    if (Number.isFinite(event.target.valueAsNumber)) {
                      updateSelectedEvent({ time: event.target.valueAsNumber });
                    }
                  }}
                />
              </label>
              <AnimationEventParameterEditor
                value={selectedAnimationEvent.parameter}
                onChange={(parameter) => updateSelectedEvent({ parameter })}
              />
              <button type="button" className="danger" onClick={deleteSelectedEvent}>Delete Event</button>
            </div>
          )}

          <div className="timeline-scrubber">
            <input
              aria-label="Animation time"
              type="range"
              min={0}
              max={Math.max(0.001, clip.duration)}
              step={1 / Math.max(1, clip.frame_rate)}
              value={Math.min(time, clip.duration)}
              onChange={(event) => {
                setPlaying(false);
                const next = Number(event.target.value);
                playbackPhase.current = next;
                setTime(next);
              }}
            />
          </div>

          <div className="timeline-grid">
            <div className="timeline-ruler-label">Target / Property</div>
            <div
              className="timeline-ruler"
              title="Click to move the playhead"
              onPointerDown={(event) => seekAtPointer(event, clip.duration, clip.frame_rate)}
            >
              {Array.from({ length: 11 }, (_unused, index) => (
                <span key={index} style={{ left: `${index * 10}%` }}>{(clip.duration * index / 10).toFixed(2)}</span>
              ))}
              <i style={{ left: `${clip.duration > 0 ? time / clip.duration * 100 : 0}%` }} />
            </div>
            <div className="timeline-ruler-value">Sample</div>

            <div className={`timeline-track-row timeline-event-row${selectedEvent != null ? ' selected' : ''}`}>
              <div className="timeline-track-label">
                <strong>Animation Events</strong>
                <span>{clip.events.length} event{clip.events.length === 1 ? '' : 's'}</span>
              </div>
              <div
                className="timeline-track-keys"
                onPointerDown={(event) => {
                  if ((event.target as HTMLElement).closest('.timeline-event-key')) return;
                  seekAtPointer(event, clip.duration, clip.frame_rate);
                }}
              >
                {clip.events.map((animationEvent, eventIndex) => {
                  const displayTime = timelineDrag?.kind === 'event' && timelineDrag.index === eventIndex
                    ? timelineDrag.time
                    : animationEvent.time;
                  return (
                    <button
                      type="button"
                      className={`timeline-event-key${selectedEvent === eventIndex ? ' selected' : ''}${timelineDrag?.kind === 'event' && timelineDrag.index === eventIndex ? ' dragging' : ''}`}
                      key={eventIndex}
                      title={`${displayTime.toFixed(3)} s - ${animationEvent.function}`}
                      style={{
                        left: `clamp(6px, ${clip.duration > 0 ? displayTime / clip.duration * 100 : 0}%, calc(100% - 6px))`,
                      }}
                      onPointerDown={(event) => beginTimelineDrag(event, 'event', -1, eventIndex, animationEvent.time)}
                      onPointerMove={moveTimelineDrag}
                      onPointerUp={(event) => finishTimelineDrag(event, true)}
                      onPointerCancel={(event) => finishTimelineDrag(event, false)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  );
                })}
                <i className="timeline-playhead" style={{ left: `${clip.duration > 0 ? time / clip.duration * 100 : 0}%` }} />
              </div>
              <div className="timeline-track-value">
                {clip.events
                  .filter((animationEvent) => Math.abs(animationEvent.time - time) < 0.5 / Math.max(1, clip.frame_rate))
                  .map((animationEvent) => animationEvent.function)
                  .join(', ') || '-'}
              </div>
            </div>

            {clip.tracks.map((track, index) => {
              const sample = samples.find((candidate) =>
                candidate.target === track.target
                && candidate.component === track.component
                && candidate.property === track.property
              )?.value;
              return (
                <div className={`timeline-track-row${selectedTrack === index ? ' selected' : ''}`} key={`${track.target}:${track.component}.${track.property}:${index}`} onClick={(event) => {
                  if ((event.target as HTMLElement).closest('.timeline-key')) return;
                  setSelectedTrack(index);
                  setSelectedKey(null);
                  setSelectedEvent(null);
                }}>
                  <div className="timeline-track-label">
                    <strong>{track.component}.{track.property}</strong>
                    <span>{track.target} · {track.interpolation}</span>
                  </div>
                  <div
                    className="timeline-track-keys"
                    onPointerDown={(event) => {
                      if ((event.target as HTMLElement).closest('.timeline-key')) return;
                      seekAtPointer(event, clip.duration, clip.frame_rate);
                    }}
                  >
                    {track.keyframes.map((key, keyIndex) => (
                      <button
                        type="button"
                        className={`timeline-key${selectedKey?.track === index && selectedKey.key === keyIndex ? ' selected' : ''}${timelineDrag?.kind === 'key' && timelineDrag.track === index && timelineDrag.index === keyIndex ? ' dragging' : ''}`}
                        key={keyIndex}
                        title={`${key.time.toFixed(3)} s · ${valueLabel(key.value)}`}
                        style={{
                          left: `clamp(6px, ${clip.duration > 0 ? (timelineDrag?.kind === 'key' && timelineDrag.track === index && timelineDrag.index === keyIndex ? timelineDrag.time : key.time) / clip.duration * 100 : 0}%, calc(100% - 6px))`,
                        }}
                        onPointerDown={(event) => beginTimelineDrag(event, 'key', index, keyIndex, key.time)}
                        onPointerMove={moveTimelineDrag}
                        onPointerUp={(event) => finishTimelineDrag(event, true)}
                        onPointerCancel={(event) => finishTimelineDrag(event, false)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ))}
                    <i className="timeline-playhead" style={{ left: `${clip.duration > 0 ? time / clip.duration * 100 : 0}%` }} />
                  </div>
                  <div className="timeline-track-value">{sample == null ? '—' : valueLabel(sample)}</div>
                </div>
              );
            })}
            {clip.tracks.length === 0 && (
              <div className="timeline-no-tracks">点击 “Add Property” 创建第一条属性轨道。</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
