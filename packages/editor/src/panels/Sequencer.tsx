import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ClipboardPaste,
  Copy,
  Crosshair,
  FolderTree,
  GripVertical,
  Link,
  Lock,
  Magnet,
  Maximize2,
  Minus,
  MoveHorizontal,
  Pause,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Redo2,
  Repeat2,
  Save,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  listProjectFiles,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerSaveAllParticipant } from '../saveAll';
import type {
  EditorUndoCheckpoint,
  EditorUndoService,
  EditorUndoToken,
} from '../editorUndoService';
import {
  assignTimelineTrackGroup,
  createTimelineAsset,
  parseTimelineAsset,
  serializeTimelineAsset,
  snapTimelineAssetTime,
  TIMELINE_MAX_PARTICLE_TIME,
  timelineHasSolo,
  timelineGroupForTrack,
  timelineTrackIsLocked,
  timelineTrackIsMuted,
  timelineTrackIsSolo,
  validateTimelineAsset,
  type TimelineAsset,
  type TimelineAnimationClip,
  type TimelineAudioClip,
  type TimelineTrackGroup,
} from '../timelineAsset';
import {
  openTimelineAsset,
  PROJECT_ASSETS_CHANGED_EVENT,
} from '../assetEditorEvents';
import { clearAudioWaveforms } from '../audioWaveform';
import {
  parseAnimationClip,
  type AnimationClip,
} from '../animationClip';
import {
  clearTimelineBinding,
  resolveTimelineBinding,
  setTimelineBinding,
} from '../timelineBindings';
import {
  buildTimelineScenePreview,
  type TimelineScenePreview,
} from '../timelineScenePreview';
import { AudioWaveform } from './AudioWaveform';
import {
  TimelineAudioPreviewController,
  type TimelineAudioPreviewStatus,
} from '../timelineAudioPreviewController';
import {
  SEQUENCER_MAX_ZOOM,
  SEQUENCER_MIN_ZOOM,
  advanceSequencerPreviewTime,
  clampSequencerZoom,
  combineSequencerMarqueeSelection,
  copySequencerItems,
  deleteSequencerItems,
  expandSequencerRippleSelection,
  findSequencerClipPlacement,
  lockedSequencerContentEnd,
  moveSequencerGroup,
  moveSequencerItems,
  moveSequencerTrack,
  normalizeSequencerPreviewRange,
  pasteSequencerClipboard,
  placeSequencerGroup,
  placeSequencerTrack,
  resizeSequencerAnimationBlend,
  resizeSequencerPreviewRange,
  rippleMoveSequencerItems,
  sequencerPanScrollLeft,
  sequencerRevealScrollLeft,
  sequencerSelectionTimeRange,
  sequencerShiftWheelDelta,
  sequencerSliderToZoom,
  sequencerTicks,
  sequencerZoomToSlider,
  selectSequencerItem,
  snapSequencerItemsDelta,
  trimSequencerCameraBlendIn,
  trimSequencerAnimationClip,
  trimSequencerClip,
  type SequencerClipboard,
  type SequencerGroupDropTarget,
  type SequencerItemSelection,
  type SequencerPreviewRange,
  type SequencerPreviewRangeEdge,
  type SequencerTrackDropTarget,
} from '../sequencerEditing';

const SEQUENCER_SNAPPING_KEY = 'mengine.sequencer.snapping';
const SEQUENCER_RIPPLE_KEY = 'mengine.sequencer.ripple';
const SEQUENCER_INSPECTOR_KEY = 'mengine.sequencer.inspector';
const SEQUENCER_LOOP_PREVIEW_KEY = 'mengine.sequencer.loop_preview';
const SEQUENCER_SNAP_THRESHOLD_PX = 8;
const EMPTY_PREVIEW_ANIMATION_CLIPS: ReadonlyMap<string, AnimationClip> = new Map();
const EMPTY_PREVIEW_CLIP_FAILURES: readonly string[] = [];
const EMPTY_AUDIO_PREVIEW_STATUS: TimelineAudioPreviewStatus = {
  mode: 'idle',
  voices: 0,
  diagnostics: [],
};

function clampTimelineAudioFades(clip: TimelineAudioClip): void {
  clip.fade_in = Math.max(0, Math.min(clip.duration, clip.fade_in));
  clip.fade_out = Math.max(0, Math.min(clip.duration, clip.fade_out));
}

function loadSequencerSnapping(): boolean {
  try {
    return localStorage.getItem(SEQUENCER_SNAPPING_KEY) !== '0';
  } catch {
    return true;
  }
}

function loadSequencerRipple(): boolean {
  try {
    return localStorage.getItem(SEQUENCER_RIPPLE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadSequencerInspector(): boolean {
  try {
    return localStorage.getItem(SEQUENCER_INSPECTOR_KEY) !== '0';
  } catch {
    return true;
  }
}

function loadSequencerLoopPreview(): boolean {
  try {
    return localStorage.getItem(SEQUENCER_LOOP_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

function safeName(raw: string): string {
  return raw.trim().replace(/\.mtimeline$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80);
}

function uniqueTimelinePath(baseName: string): string {
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  let index = 1;
  let path = `Assets/Timelines/${baseName}.mtimeline`;
  while (used.has(path.toLowerCase())) path = `Assets/Timelines/${baseName} ${++index}.mtimeline`;
  return path;
}

export async function createProjectTimeline(name = 'New Timeline'): Promise<string> {
  await refreshProjectFiles();
  const safe = safeName(name) || 'New Timeline';
  const path = uniqueTimelinePath(safe);
  await writeProjectAssetText(path, serializeTimelineAsset(createTimelineAsset(safe)));
  await refreshProjectFiles();
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
  openTimelineAsset(path);
  return path;
}

type SnapshotEntity = WorldSnapshotView['entities'][number];

function timelinePreviewEntitySignature(entity: SnapshotEntity): string {
  const source = entity.components.AudioSource;
  const audio = source && typeof source === 'object'
    ? source as { mute?: unknown; pan?: unknown }
    : null;
  return `${entity.entity}\0${entity.parent ?? ''}\0${entity.name ?? ''}`
    + `\0${entity.active === false ? '0' : '1'}`
    + `\0${entity.components.AnimationPlayer ? 'P' : ''}${entity.components.Animator ? 'A' : ''}`
    + `${entity.components.Camera2D ? '2' : ''}${entity.components.Camera3D ? '3' : ''}`
    + `${entity.components.ParticleEmitter2D ? 'E2' : ''}${entity.components.ParticleEmitter3D ? 'E3' : ''}`
    + `${audio ? `U${audio.mute ? '1' : '0'}:${Number(audio.pan) || 0}` : ''}`;
}

export type SequencerProps = {
  assetPath: string | null;
  selectedEntity: SnapshotEntity | null;
  entities: readonly SnapshotEntity[];
  playMode: boolean;
  previewEnabled: boolean;
  onClose: () => void;
  onAssignDirector: (entity: number, path: string) => void;
  onPatchDirector: (entity: number, patch: Record<string, unknown>) => void;
  onPreview: (preview: TimelineScenePreview) => void;
  onClearPreview: () => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  undoService: EditorUndoService;
  onGlobalUndo: () => void;
  onGlobalRedo: () => void;
};

type Selection = { track: number; marker: number | null; groupId?: string } | null;
type HistorySnapshot = {
  asset: TimelineAsset;
  selection: Selection;
  selectedItems: SequencerItemSelection[];
  time: number;
};
type InspectorEditTransaction = HistorySnapshot & {
  historyCheckpoint: EditorUndoCheckpoint;
  historyToken: EditorUndoToken | null;
};
type KeyboardNudgeTransaction = HistorySnapshot & {
  historyCheckpoint: EditorUndoCheckpoint;
  historyToken: EditorUndoToken | null;
  ripple: boolean;
};
type SequencerMarquee = {
  left: number;
  top: number;
  width: number;
  height: number;
};
type SequencerTrackDragVisual = {
  sourceTrackId: string;
  target: SequencerTrackDropTarget | null;
  valid: boolean;
};
type SequencerGroupDragVisual = {
  sourceGroupId: string;
  target: SequencerGroupDropTarget | null;
  valid: boolean;
};
type Draft = {
  asset: TimelineAsset;
  savedText: string;
  time: number;
  selection: Selection;
  selectedItems: SequencerItemSelection[];
  previewRange?: SequencerPreviewRange;
};

function isSequencerEditControl(target: EventTarget): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
}

function sequencerDraftDirty(draft: Pick<Draft, 'asset' | 'savedText'>): boolean {
  try {
    return JSON.stringify(draft.asset) !== JSON.stringify(parseTimelineAsset(draft.savedText));
  } catch {
    return true;
  }
}

function sequencerTrackDropKey(target: SequencerTrackDropTarget | null): string {
  if (!target) return '';
  if (target.kind === 'track') return `track:${target.trackId}:${target.edge}`;
  if (target.kind === 'group') return `group:${target.groupId}`;
  return 'root';
}

function sequencerGroupDropKey(target: SequencerGroupDropTarget | null): string {
  if (!target) return '';
  if (target.kind === 'track') return `track:${target.trackId}:${target.edge}`;
  if (target.kind === 'group') return `group:${target.groupId}:${target.edge}`;
  return 'root';
}

export function Sequencer(props: SequencerProps) {
  const [asset, setAsset] = useState<TimelineAsset | null>(null);
  const [savedText, setSavedText] = useState('');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioAuditionRevision, setAudioAuditionRevision] = useState(0);
  const [audioPreviewStatus, setAudioPreviewStatus] = useState(EMPTY_AUDIO_PREVIEW_STATUS);
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedItems, setSelectedItems] = useState<SequencerItemSelection[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadInvalid, setPayloadInvalid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [snapping, setSnapping] = useState(loadSequencerSnapping);
  const [rippleMode, setRippleMode] = useState(loadSequencerRipple);
  const [inspectorOpen, setInspectorOpen] = useState(loadSequencerInspector);
  const [loopPreview, setLoopPreview] = useState(loadSequencerLoopPreview);
  const [previewRange, setPreviewRange] = useState<SequencerPreviewRange>({ start: 0, end: 5 });
  const [draggingPreviewEdge, setDraggingPreviewEdge] = useState<SequencerPreviewRangeEdge | null>(null);
  const [panning, setPanning] = useState(false);
  const [snapGuide, setSnapGuide] = useState<number | null>(null);
  const [tracksWidth, setTracksWidth] = useState(720);
  const [clipboard, setClipboard] = useState<SequencerClipboard | null>(null);
  const [marquee, setMarquee] = useState<SequencerMarquee | null>(null);
  const [trackDragVisual, setTrackDragVisual] = useState<SequencerTrackDragVisual | null>(null);
  const [groupDragVisual, setGroupDragVisual] = useState<SequencerGroupDragVisual | null>(null);
  const [previewAnimationClips, setPreviewAnimationClips] = useState<ReadonlyMap<string, AnimationClip>>(new Map());
  const [previewClipFailures, setPreviewClipFailures] = useState<string[]>([]);
  const [previewAnimationLoadKey, setPreviewAnimationLoadKey] = useState('');
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);
  const [previewAssetEpoch, setPreviewAssetEpoch] = useState(0);
  const [, setDraftEpoch] = useState(0);
  const loadedPath = useRef('');
  const drafts = useRef(new Map<string, Draft>());
  const assetRef = useRef<TimelineAsset | null>(null);
  const selectionRef = useRef<Selection>(null);
  const selectedItemsRef = useRef<SequencerItemSelection[]>([]);
  const timeRef = useRef(0);
  const previewRangeRef = useRef<SequencerPreviewRange>({ start: 0, end: 5 });
  const inspectorEdit = useRef<InspectorEditTransaction | null>(null);
  const keyboardNudge = useRef<KeyboardNudgeTransaction | null>(null);
  const frame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const tracksViewport = useRef<HTMLDivElement | null>(null);
  const rulerScrubPointer = useRef<number | null>(null);
  const previewRangeDrag = useRef<{ pointerId: number; edge: SequencerPreviewRangeEdge } | null>(null);
  const panDrag = useRef<{ pointerId: number; clientX: number; scrollLeft: number } | null>(null);
  const trackDragCleanup = useRef<(() => void) | null>(null);
  const previewDuration = useRef(5);
  const audioPreviewController = useMemo(
    () => new TimelineAudioPreviewController(setAudioPreviewStatus),
    [],
  );
  assetRef.current = asset;
  selectionRef.current = selection;
  selectedItemsRef.current = selectedItems;
  timeRef.current = time;
  previewRangeRef.current = previewRange;

  const applySelection = (primary: Selection, items?: readonly SequencerItemSelection[]) => {
    const nextItems = items
      ? items.map((item) => ({ ...item }))
      : primary?.marker != null
        ? [{ track: primary.track, marker: primary.marker }]
        : [];
    selectionRef.current = primary ? { ...primary } : null;
    selectedItemsRef.current = nextItems;
    setSelection(primary);
    setSelectedItems(nextItems);
  };

  const replaceAsset = (next: TimelineAsset | null) => {
    assetRef.current = next;
    setAsset(next);
  };

  const replaceTime = (next: number) => {
    timeRef.current = next;
    setTime(next);
  };
  const replacePreviewRange = (next: SequencerPreviewRange) => {
    previewRangeRef.current = next;
    setPreviewRange(next);
  };

  const fingerprint = useMemo(() => asset ? JSON.stringify(asset) : '', [asset]);
  const savedFingerprint = useMemo(() => {
    if (!savedText) return '';
    try {
      return JSON.stringify(parseTimelineAsset(savedText));
    } catch {
      return '';
    }
  }, [savedText]);
  const dirty = Boolean(asset && fingerprint !== savedFingerprint);
  const anyDirty = dirty || [...drafts.current.values()].some(sequencerDraftDirty);
  const [directorEntityId, setDirectorEntityId] = useState<number | null>(null);
  const observedHierarchySelection = useRef<number | null | undefined>(undefined);
  const matchingDirectors = useMemo(() => props.entities.filter((entity) => {
    const value = entity.components.TimelineDirector;
    return value != null
      && typeof value === 'object'
      && String((value as { asset?: unknown }).asset ?? '') === props.assetPath;
  }), [props.assetPath, props.entities]);
  const selectedDirector = matchingDirectors.find((entity) => entity.entity === props.selectedEntity?.entity) ?? null;
  const directorEntity = matchingDirectors.find((entity) => entity.entity === directorEntityId)
    ?? selectedDirector
    ?? matchingDirectors[0]
    ?? null;
  const directorValue = directorEntity?.components.TimelineDirector;
  const director = directorValue != null && typeof directorValue === 'object'
    ? directorValue as { asset?: string; bindings_json?: string; playing?: boolean; time?: number }
    : null;
  const liveDirector = props.playMode && director?.asset === props.assetPath ? director : null;
  const displayTime = liveDirector && Number.isFinite(Number(liveDirector.time))
    ? Math.max(0, Math.min(asset?.duration ?? 0, Number(liveDirector.time)))
    : time;
  const previewAnimationPaths = useMemo(() => {
    if (!asset) return [];
    const paths = new Map<string, string>();
    const hasSolo = timelineHasSolo(asset);
    for (const track of asset.tracks) {
      if (track.type !== 'animation' || timelineTrackIsMuted(asset, track, hasSolo)) continue;
      for (const clip of track.clips) {
        const path = clip.clip.trim().replaceAll('\\', '/');
        if (path) paths.set(path.toLowerCase(), path);
      }
    }
    return [...paths.values()];
  }, [asset]);
  const previewAnimationPathKey = previewAnimationPaths.join('\n');
  const previewAnimationRequestKey = `${previewAssetEpoch}\0${previewAnimationPathKey}`;
  const previewAnimationResourcesReady = previewAnimationLoadKey === previewAnimationRequestKey;
  const loadedPreviewAnimationClips = previewAnimationResourcesReady
    ? previewAnimationClips
    : EMPTY_PREVIEW_ANIMATION_CLIPS;
  const loadedPreviewClipFailures = previewAnimationResourcesReady
    ? previewClipFailures
    : EMPTY_PREVIEW_CLIP_FAILURES;
  const previewHierarchyKey = props.entities
    .map(timelinePreviewEntitySignature)
    .join('\n');
  const previewBuild = useMemo(() => {
    if (!asset || props.playMode || !props.previewEnabled || !directorEntity) return null;
    return buildTimelineScenePreview(
      asset,
      props.entities,
      directorEntity.entity,
      director?.bindings_json ?? '{}',
      time,
      loadedPreviewAnimationClips,
    );
  }, [
    asset,
    director?.bindings_json,
    directorEntity?.entity,
    loadedPreviewAnimationClips,
    previewHierarchyKey,
    props.playMode,
    props.previewEnabled,
    time,
  ]);
  const previewClipFailuresKey = loadedPreviewClipFailures.join('\n');
  const audioPreviewDiagnosticsKey = audioPreviewStatus.diagnostics.join('\n');

  useEffect(() => {
    const selectedEntityId = props.selectedEntity?.entity ?? null;
    const hierarchySelectionChanged = observedHierarchySelection.current !== selectedEntityId;
    observedHierarchySelection.current = selectedEntityId;
    if (hierarchySelectionChanged && selectedDirector) {
      setDirectorEntityId(selectedDirector.entity);
    } else if (directorEntityId != null && !matchingDirectors.some((entity) => entity.entity === directorEntityId)) {
      setDirectorEntityId(matchingDirectors[0]?.entity ?? null);
    }
  }, [directorEntityId, matchingDirectors, props.selectedEntity?.entity, selectedDirector]);

  useEffect(() => {
    props.onDirtyChange(anyDirty);
  }, [anyDirty, props.onDirtyChange]);

  useEffect(() => {
    const clear = () => {
      clearAudioWaveforms();
      audioPreviewController.invalidate();
      setPreviewAssetEpoch((value) => value + 1);
    };
    window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, clear);
    return () => window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, clear);
  }, [audioPreviewController]);

  useEffect(() => {
    audioPreviewController.activate();
    return () => audioPreviewController.dispose();
  }, [audioPreviewController]);

  useEffect(() => {
    let cancelled = false;
    setPreviewAnimationClips(new Map());
    setPreviewClipFailures([]);
    if (!previewAnimationPaths.length) {
      setPreviewAnimationLoadKey(previewAnimationRequestKey);
      return () => { cancelled = true; };
    }
    void Promise.all(previewAnimationPaths.map(async (path) => {
      try {
        return { path, clip: parseAnimationClip(await readProjectAssetText(path)) };
      } catch (reason) {
        return {
          path,
          error: reason instanceof Error ? reason.message : String(reason),
        };
      }
    })).then((results) => {
      if (cancelled) return;
      const clips = new Map<string, AnimationClip>();
      const failures: string[] = [];
      for (const result of results) {
        if ('error' in result) failures.push(`Animation clip '${result.path}' failed to load: ${result.error}`);
        else clips.set(result.path.toLowerCase(), result.clip);
      }
      setPreviewAnimationClips(clips);
      setPreviewClipFailures(failures);
      setPreviewAnimationLoadKey(previewAnimationRequestKey);
    });
    return () => { cancelled = true; };
  }, [previewAnimationRequestKey]);

  useEffect(() => {
    if (!previewBuild) {
      setPreviewWarning(null);
      props.onClearPreview();
      return;
    }
    props.onPreview(previewBuild.preview);
    const diagnostics = previewBuild.diagnostics.filter((message) => (
      previewAnimationResourcesReady || !message.endsWith(' is not loaded.')
    ) && !(loadedPreviewClipFailures.length && message.endsWith(' is not loaded.')));
    const warnings = [
      ...loadedPreviewClipFailures,
      ...diagnostics,
      ...audioPreviewStatus.diagnostics,
    ];
    setPreviewWarning(warnings.length ? warnings.join(' ') : null);
  }, [
    audioPreviewDiagnosticsKey,
    previewAnimationResourcesReady,
    previewBuild,
    previewClipFailuresKey,
  ]);

  useEffect(() => {
    audioPreviewController.update(
      previewBuild?.audio ?? [],
      Boolean(playing && previewBuild),
      audioAuditionRevision,
    );
  }, [
    audioAuditionRevision,
    audioPreviewController,
    playing,
    previewBuild,
  ]);

  useEffect(() => () => props.onClearPreview(), [props.assetPath]);

  useEffect(() => {
    let cancelled = false;
    const activeTransaction = inspectorEdit.current;
    if (
      activeTransaction?.historyToken
      && asset
      && props.undoService.isUndoTop(activeTransaction.historyToken)
      && JSON.stringify(asset) === JSON.stringify(activeTransaction.asset)
    ) {
      props.undoService.restoreCheckpoint(activeTransaction.historyCheckpoint);
    }
    const activeNudge = keyboardNudge.current;
    if (
      activeNudge?.historyToken
      && asset
      && props.undoService.isUndoTop(activeNudge.historyToken)
      && JSON.stringify(asset) === JSON.stringify(activeNudge.asset)
    ) {
      props.undoService.restoreCheckpoint(activeNudge.historyCheckpoint);
    }
    keyboardNudge.current = null;
    trackDragCleanup.current?.();
    trackDragCleanup.current = null;
    setTrackDragVisual(null);
    setGroupDragVisual(null);
    const previous = loadedPath.current;
    if (previous && asset) {
      drafts.current.set(previous, {
        asset: structuredClone(asset), savedText, time,
        selection: selection ? { ...selection } : null,
        selectedItems: structuredClone(selectedItems),
        previewRange: { ...previewRange },
      });
    }
    loadedPath.current = props.assetPath ?? '';
    setPlaying(false);
    replaceAsset(null);
    setSavedText('');
    replaceTime(0);
    previewDuration.current = 1;
    replacePreviewRange({ start: 0, end: 1 });
    previewRangeDrag.current = null;
    setDraggingPreviewEdge(null);
    setZoom(1);
    setSnapGuide(null);
    applySelection(null);
    inspectorEdit.current = null;
    setError(null);
    setPayloadInvalid(false);
    if (!props.assetPath) return () => { cancelled = true; };
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      const restoredAsset = structuredClone(draft.asset);
      replaceAsset(restoredAsset);
      setSavedText(draft.savedText);
      replaceTime(draft.time);
      previewDuration.current = restoredAsset.duration;
      replacePreviewRange(normalizeSequencerPreviewRange(
        draft.previewRange ?? { start: 0, end: restoredAsset.duration },
        restoredAsset.duration,
        restoredAsset.frame_rate,
      ));
      applySelection(
        draft.selection ? { ...draft.selection } : null,
        draft.selectedItems ?? [],
      );
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const loaded = parseTimelineAsset(text);
        replaceAsset(loaded);
        setSavedText(serializeTimelineAsset(loaded));
        previewDuration.current = loaded.duration;
        replacePreviewRange({ start: 0, end: loaded.duration });
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [props.assetPath]);

  useEffect(() => {
    if (!asset) return;
    const previous = previewDuration.current;
    const current = previewRangeRef.current;
    replacePreviewRange(normalizeSequencerPreviewRange({
      start: current.start,
      end: Math.abs(current.end - previous) <= 1e-6 ? asset.duration : current.end,
    }, asset.duration, asset.frame_rate));
    previewDuration.current = asset.duration;
  }, [asset?.duration, asset?.frame_rate]);

  useEffect(() => {
    if (!asset || (timeRef.current >= previewRange.start && timeRef.current <= previewRange.end)) return;
    setPlaying(false);
    replaceTime(Math.max(previewRange.start, Math.min(previewRange.end, timeRef.current)));
  }, [asset?.duration, previewRange.end, previewRange.start]);

  useEffect(() => {
    if (!props.playMode) return;
    previewRangeDrag.current = null;
    setDraggingPreviewEdge(null);
  }, [props.playMode]);

  useEffect(() => () => {
    trackDragCleanup.current?.();
    trackDragCleanup.current = null;
  }, []);

  const applyUpdate = (mutate: (draft: TimelineAsset) => void) => {
    setAsset((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      assetRef.current = next;
      return next;
    });
  };

  const captureDocument = (path: string): HistorySnapshot => {
    if (loadedPath.current === path && assetRef.current) {
      return {
        asset: structuredClone(assetRef.current),
        selection: selectionRef.current ? { ...selectionRef.current } : null,
        selectedItems: structuredClone(selectedItemsRef.current),
        time: timeRef.current,
      };
    }
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Timeline history document '${path}' is no longer available.`);
    return {
      asset: structuredClone(draft.asset),
      selection: draft.selection ? { ...draft.selection } : null,
      selectedItems: structuredClone(draft.selectedItems),
      time: draft.time,
    };
  };

  const restoreDocument = (path: string, snapshot: HistorySnapshot) => {
    const restoredAsset = structuredClone(snapshot.asset);
    const restoredSelection = snapshot.selection ? { ...snapshot.selection } : null;
    const restoredItems = structuredClone(snapshot.selectedItems);
    const restoredTime = Math.max(0, Math.min(restoredAsset.duration, snapshot.time));
    if (loadedPath.current === path) {
      replaceAsset(restoredAsset);
      applySelection(restoredSelection, restoredItems);
      replaceTime(restoredTime);
      setPayloadInvalid(false);
      setError(null);
      return;
    }
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Timeline history document '${path}' is no longer available.`);
    drafts.current.set(path, {
      ...draft,
      asset: restoredAsset,
      selection: restoredSelection,
      selectedItems: restoredItems,
      time: restoredTime,
    });
    setDraftEpoch((value) => value + 1);
  };

  const pushHistory = (
    snapshotAsset: TimelineAsset,
    snapshotSelection: Selection = selection,
    snapshotTime = time,
    snapshotItems: readonly SequencerItemSelection[] = selectedItems,
    label = 'Edit Timeline',
  ) => {
    const path = loadedPath.current;
    if (!path) return null;
    return props.undoService.recordSnapshot({
      scope: `timeline:${path}`,
      label,
      state: {
        asset: structuredClone(snapshotAsset),
        selection: snapshotSelection ? { ...snapshotSelection } : null,
        selectedItems: snapshotItems.map((item) => ({ ...item })),
        time: snapshotTime,
      },
      capture: () => captureDocument(path),
      restore: (snapshot) => restoreDocument(path, snapshot),
    });
  };

  const update = (mutate: (draft: TimelineAsset) => void, label = 'Edit Timeline') => {
    if (!asset) return;
    const next = structuredClone(asset);
    mutate(next);
    if (JSON.stringify(next) === JSON.stringify(asset)) return;
    const transaction = inspectorEdit.current;
    if (transaction) {
      if (!transaction.historyToken) {
        transaction.historyToken = pushHistory(
          transaction.asset,
          transaction.selection,
          transaction.time,
          transaction.selectedItems,
          'Edit Timeline Inspector',
        );
      }
    } else {
      pushHistory(asset, selection, time, selectedItems, label);
    }
    replaceAsset(next);
  };

  const restoreHistory = (source: 'undo' | 'redo') => {
    if (source === 'undo') props.onGlobalUndo();
    else props.onGlobalRedo();
  };

  const beginInspectorEdit = (event: ReactFocusEvent<HTMLElement>) => {
    if (!asset || inspectorEdit.current || !isSequencerEditControl(event.target)) return;
    inspectorEdit.current = {
      asset: structuredClone(asset),
      selection: selection ? { ...selection } : null,
      selectedItems: structuredClone(selectedItems),
      time,
      historyCheckpoint: props.undoService.checkpoint(),
      historyToken: null,
    };
  };

  const finishInspectorEdit = () => {
    const transaction = inspectorEdit.current;
    inspectorEdit.current = null;
    if (!transaction?.historyToken) return;
    const current = assetRef.current;
    if (
      !current
      || JSON.stringify(current) !== JSON.stringify(transaction.asset)
      || !props.undoService.isUndoTop(transaction.historyToken)
    ) return;
    props.undoService.restoreCheckpoint(transaction.historyCheckpoint);
  };

  const endInspectorEdit = (event: ReactFocusEvent<HTMLElement>) => {
    if (!isSequencerEditControl(event.target)) return;
    finishInspectorEdit();
  };

  const save = async (): Promise<boolean> => {
    if (!asset || !props.assetPath) return false;
    if (payloadInvalid) {
      setError('Payload JSON 无效，请修正后再保存');
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      validateTimelineAsset(asset);
      const text = serializeTimelineAsset(asset);
      await writeProjectAssetText(props.assetPath, text);
      replaceAsset(parseTimelineAsset(text));
      setSavedText(text);
      drafts.current.delete(props.assetPath);
      await refreshProjectFiles();
      props.onAssetsChanged();
      props.onLog(`Saved ${props.assetPath}`);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Timeline 保存失败：${message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => registerSaveAllParticipant('Timelines', () => {
    if (!anyDirty) return null;
    return async () => {
      if (dirty && !await save()) throw new Error('Current Timeline could not be saved');
      for (const [path, draft] of [...drafts.current]) {
        if (!sequencerDraftDirty(draft)) continue;
        validateTimelineAsset(draft.asset);
        const text = serializeTimelineAsset(draft.asset);
        await writeProjectAssetText(path, text);
        drafts.current.set(path, {
          ...draft,
          asset: parseTimelineAsset(text),
          savedText: text,
        });
      }
      setDraftEpoch((value) => value + 1);
      await refreshProjectFiles();
      props.onAssetsChanged();
    };
  }), [anyDirty, asset, dirty, payloadInvalid, props.assetPath, savedText]);

  useEffect(() => {
    if (!props.previewEnabled || !playing || !asset) return;
    const tick = (now: number) => {
      const previous = previousFrame.current ?? now;
      previousFrame.current = now;
      setTime((current) => {
        const advanced = advanceSequencerPreviewTime(
          current,
          Math.min(0.1, Math.max(0, (now - previous) / 1000)),
          previewRange,
          loopPreview,
        );
        if (!advanced.playing) setPlaying(false);
        timeRef.current = advanced.time;
        return advanced.time;
      });
      frame.current = requestAnimationFrame(tick);
    };
    previousFrame.current = null;
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      frame.current = null;
      previousFrame.current = null;
    };
  }, [asset, loopPreview, playing, previewRange, props.previewEnabled]);

  useEffect(() => {
    const viewport = tracksViewport.current;
    if (!viewport) return;
    const updateWidth = () => setTracksWidth(Math.max(540, viewport.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [asset != null]);

  useEffect(() => {
    const viewport = tracksViewport.current;
    if (!viewport || !asset || !(playing || liveDirector?.playing) || zoom <= 1) return;
    const visibleWidth = Math.max(1, viewport.clientWidth - 180);
    const width = Math.max(360, visibleWidth * zoom);
    const playhead = displayTime / asset.duration * width;
    const margin = Math.min(80, visibleWidth * 0.15);
    if (playhead < viewport.scrollLeft + margin
      || playhead > viewport.scrollLeft + visibleWidth - margin) {
      viewport.scrollLeft = Math.max(0, playhead - visibleWidth * 0.35);
    }
  }, [asset, displayTime, liveDirector?.playing, playing, zoom]);

  const addSignalTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `signals-${index}`;
    while (used.has(id)) id = `signals-${++index}`;
    update((draft) => draft.tracks.push({ type: 'signal', id, name: `Signal Track ${index}`, solo: false, muted: false, locked: false, markers: [] }));
    applySelection({ track: asset.tracks.length, marker: null });
  };

  const addActivationTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `activation-${index}`;
    while (used.has(id)) id = `activation-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'activation', id, name: `Activation Track ${index}`, solo: false, muted: false, locked: false, target: 'Child', clips: [],
    }));
    applySelection({ track: asset.tracks.length, marker: null });
  };

  const addAudioTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `audio-${index}`;
    while (used.has(id)) id = `audio-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'audio', id, name: `Audio Track ${index}`, solo: false, muted: false, locked: false, target: 'AudioSource', clips: [],
    }));
    applySelection({ track: asset.tracks.length, marker: null });
  };

  const addAnimationTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `animation-${index}`;
    while (used.has(id)) id = `animation-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'animation', id, name: `Animation Track ${index}`, solo: false, muted: false, locked: false, target: 'Animated', clips: [],
    }));
    applySelection({ track: asset.tracks.length, marker: null });
  };

  const addParticleTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `particle-${index}`;
    while (used.has(id)) id = `particle-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'particle', id, name: `Particle Track ${index}`, solo: false, muted: false, locked: false, target: 'Particles', clips: [],
    }));
    applySelection({ track: asset.tracks.length, marker: null });
  };

  const addCameraTrack = () => {
    if (!asset) return;
    if (asset.tracks.some((track) => track.type === 'camera')) {
      setError('A Timeline asset can contain only one Camera Track.');
      return;
    }
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `camera-${index}`;
    while (used.has(id)) id = `camera-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'camera', id, name: `Camera Track ${index}`, solo: false, muted: false, locked: false, clips: [],
    }));
    applySelection({ track: asset.tracks.length, marker: null });
  };

  const addTrackGroup = () => {
    if (!asset) return;
    const used = new Set(asset.groups.map((group) => group.id));
    let index = asset.groups.length + 1;
    let id = `group-${index}`;
    while (used.has(id)) id = `group-${++index}`;
    const selectedTrackIndexes = selectedItems.length > 0
      ? [...new Set(selectedItems.map((item) => item.track))]
      : selection && selection.track >= 0
        ? [selection.track]
        : [];
    const trackIds = selectedTrackIndexes
      .map((trackIndex) => asset.tracks[trackIndex]?.id)
      .filter((trackId): trackId is string => Boolean(trackId));
    const lockedTrack = selectedTrackIndexes
      .map((trackIndex) => asset.tracks[trackIndex])
      .find((track) => track && timelineTrackIsLocked(asset, track));
    if (lockedTrack) {
      setError(`Track '${lockedTrack.name}' is locked. Unlock it before grouping.`);
      return;
    }
    update((draft) => {
      for (const group of draft.groups) {
        group.track_ids = group.track_ids.filter((trackId) => !trackIds.includes(trackId));
      }
      draft.groups.push({
        id,
        name: `Group ${index}`,
        solo: false,
        muted: false,
        locked: false,
        collapsed: false,
        track_ids: trackIds,
      });
    }, 'Create Timeline Track Group');
    applySelection({ track: -1, marker: null, groupId: id });
  };

  const addMarker = (trackIndex = selection?.track ?? 0, requestedTime = time) => {
    if (!asset || asset.tracks[trackIndex]?.type !== 'signal') return;
    const markerTime = snapTimelineAssetTime(requestedTime, asset);
    update((draft) => {
      const track = draft.tracks[trackIndex];
      if (track.type === 'signal') track.markers.push({ time: markerTime, name: 'Signal' });
    });
    const track = asset.tracks[trackIndex];
    applySelection({ track: trackIndex, marker: track.type === 'signal' ? track.markers.length : null });
  };

  const addActivationClip = (trackIndex: number, requestedTime = time) => {
    if (!asset || asset.tracks[trackIndex]?.type !== 'activation') return;
    const track = asset.tracks[trackIndex];
    const placement = findSequencerClipPlacement(
      track.clips,
      requestedTime,
      Math.min(1, asset.duration),
      asset.duration,
      asset.frame_rate,
    );
    if (!placement) {
      setError('Activation Track has no free space for another clip.');
      return;
    }
    const marker = track.clips.filter((clip) => clip.start < placement.start).length;
    update((draft) => {
      const target = draft.tracks[trackIndex];
      if (target.type === 'activation') {
        target.clips.push({ ...placement, active: true });
        target.clips.sort((left, right) => left.start - right.start);
      }
    });
    setError(null);
    applySelection({ track: trackIndex, marker });
  };

  const addAudioClip = (trackIndex: number, requestedTime = time) => {
    if (!asset || asset.tracks[trackIndex]?.type !== 'audio') return;
    const defaultClip = listProjectFiles().find((entry) => entry.kind === 'audio')?.relPath ?? 'Assets/Audio/clip.ogg';
    const track = asset.tracks[trackIndex];
    const placement = findSequencerClipPlacement(
      track.clips,
      requestedTime,
      Math.min(1, asset.duration),
      asset.duration,
      asset.frame_rate,
    );
    if (!placement) {
      setError('Audio Track has no free space for another clip.');
      return;
    }
    const marker = track.clips.filter((clip) => clip.start < placement.start).length;
    update((draft) => {
      const target = draft.tracks[trackIndex];
      if (target.type === 'audio') target.clips.push({
        ...placement,
        clip: defaultClip,
        clip_in: 0,
        volume: 1,
        pitch: 1,
        looped: false,
        fade_in: 0,
        fade_out: 0,
        fade_curve: 'linear',
      });
      if (target.type === 'audio') target.clips.sort((left, right) => left.start - right.start);
    });
    setError(null);
    applySelection({ track: trackIndex, marker });
  };

  const addAnimationClip = (trackIndex: number, requestedTime = time) => {
    if (!asset || asset.tracks[trackIndex]?.type !== 'animation') return;
    const defaultClip = listProjectFiles().find((entry) => entry.kind === 'animation')?.relPath ?? 'Assets/Animations/clip.manim';
    const track = asset.tracks[trackIndex];
    const placement = findSequencerClipPlacement(
      track.clips,
      requestedTime,
      Math.min(1, asset.duration),
      asset.duration,
      asset.frame_rate,
    );
    if (!placement) {
      setError('Animation Track has no free space for another clip.');
      return;
    }
    const marker = track.clips.filter((clip) => clip.start < placement.start).length;
    update((draft) => {
      const target = draft.tracks[trackIndex];
      if (target.type === 'animation') target.clips.push({
        ...placement,
        clip: defaultClip,
        clip_in: 0,
        speed: 1,
        blend_in: 0,
        blend_curve: 'ease_in_out',
      });
      if (target.type === 'animation') target.clips.sort((left, right) => left.start - right.start);
    });
    setError(null);
    applySelection({ track: trackIndex, marker });
  };

  const addParticleClip = (trackIndex: number, requestedTime = time) => {
    if (!asset || asset.tracks[trackIndex]?.type !== 'particle') return;
    const track = asset.tracks[trackIndex];
    const placement = findSequencerClipPlacement(
      track.clips,
      requestedTime,
      Math.min(1, asset.duration),
      asset.duration,
      asset.frame_rate,
    );
    if (!placement) {
      setError('Particle Track has no free space for another clip.');
      return;
    }
    const marker = track.clips.filter((clip) => clip.start < placement.start).length;
    update((draft) => {
      const target = draft.tracks[trackIndex];
      if (target.type === 'particle') {
        target.clips.push({ ...placement, clip_in: 0 });
        target.clips.sort((left, right) => left.start - right.start);
      }
    });
    setError(null);
    applySelection({ track: trackIndex, marker });
  };

  const addCameraClip = (trackIndex: number, requestedTime = time) => {
    if (!asset || asset.tracks[trackIndex]?.type !== 'camera') return;
    const track = asset.tracks[trackIndex];
    const placement = findSequencerClipPlacement(
      track.clips,
      requestedTime,
      Math.min(1, asset.duration),
      asset.duration,
      asset.frame_rate,
    );
    if (!placement) {
      setError('Camera Track has no free space for another shot.');
      return;
    }
    const marker = track.clips.filter((clip) => clip.start < placement.start).length;
    update((draft) => {
      const target = draft.tracks[trackIndex];
      if (target.type === 'camera') {
        target.clips.push({
          ...placement,
          target: 'Cameras/Main Camera',
          blend_in: 0,
          blend_curve: 'ease_in_out',
        });
        target.clips.sort((left, right) => left.start - right.start);
      }
    });
    setError(null);
    applySelection({ track: trackIndex, marker });
  };

  const addTrackItem = (trackIndex: number, requestedTime: number) => {
    const track = asset?.tracks[trackIndex];
    if (asset && track && timelineTrackIsLocked(asset, track)) {
      setError(`Track '${track.name}' is locked. Unlock it before adding items.`);
      return;
    }
    if (track?.type === 'signal') addMarker(trackIndex, requestedTime);
    else if (track?.type === 'activation') addActivationClip(trackIndex, requestedTime);
    else if (track?.type === 'audio') addAudioClip(trackIndex, requestedTime);
    else if (track?.type === 'animation') addAnimationClip(trackIndex, requestedTime);
    else if (track?.type === 'particle') addParticleClip(trackIndex, requestedTime);
    else if (track?.type === 'camera') addCameraClip(trackIndex, requestedTime);
  };

  const selectedClipboard = () => {
    if (!asset || !selection || selection.marker == null) return null;
    return copySequencerItems(asset, selectedItems, {
      track: selection.track,
      marker: selection.marker,
    });
  };

  const copySelectedItem = (): SequencerClipboard | null => {
    const copied = selectedClipboard();
    if (!copied) return null;
    if (!copied.ok) {
      setError(copied.error);
      return null;
    }
    setClipboard(copied.clipboard);
    setError(null);
    return copied.clipboard;
  };

  const cutSelectedItems = () => {
    if (!asset || !selection || selection.marker == null) return;
    const copied = selectedClipboard();
    if (!copied) return;
    if (!copied.ok) {
      setError(copied.error);
      return;
    }
    const deleted = deleteSequencerItems(asset, selectedItems);
    if (!deleted.ok) {
      setError(deleted.error);
      return;
    }
    pushHistory(asset, selection, time, selectedItems, 'Cut Timeline Items');
    setClipboard(copied.clipboard);
    replaceAsset(deleted.asset);
    applySelection({ track: selection.track, marker: null });
    setPayloadInvalid(false);
    setError(null);
  };

  const deleteSelection = (ripple = false) => {
    if (!asset || !selection) return;
    if (selection.groupId) {
      const group = asset.groups.find((candidate) => candidate.id === selection.groupId);
      if (group?.locked) {
        setError(`Group '${group.name}' is locked. Unlock it before deleting.`);
        return;
      }
      update((draft) => {
        draft.groups = draft.groups.filter((group) => group.id !== selection.groupId);
      }, 'Delete Timeline Track Group');
      applySelection(null);
      setError(null);
      return;
    }
    if (selectedItems.length > 0) {
      const deleted = deleteSequencerItems(asset, selectedItems, ripple);
      if (!deleted.ok) {
        setError(deleted.error);
        return;
      }
      pushHistory(asset, selection, time, selectedItems, ripple ? 'Ripple Delete Timeline Items' : 'Delete Timeline Items');
      replaceAsset(deleted.asset);
      applySelection({ track: selection.track, marker: null });
      setPayloadInvalid(false);
      setError(null);
      return;
    }
    const selectedTrackIndex = selection.track;
    const track = asset.tracks[selectedTrackIndex];
    if (!track || timelineTrackIsLocked(asset, track)) {
      if (track) setError(`Track '${track.name}' is locked. Unlock it before deleting.`);
      return;
    }
    update((draft) => {
      for (const group of draft.groups) {
        group.track_ids = group.track_ids.filter((trackId) => trackId !== track.id);
      }
      draft.tracks.splice(selectedTrackIndex, 1);
    });
    setPayloadInvalid(false);
    applySelection(null);
  };

  const moveSelectedTrack = (direction: -1 | 1) => {
    if (!asset || !selection) return;
    const moved = moveSequencerTrack(asset, selection.track, direction);
    if (!moved.ok) {
      setError(moved.error);
      return;
    }
    pushHistory(asset, selection, time, selectedItems, 'Reorder Timeline Track');
    replaceAsset(moved.asset);
    applySelection({ track: moved.trackIndex, marker: selection.marker });
    setError(null);
  };

  const moveSelectedGroup = (direction: -1 | 1) => {
    if (!asset || !selection?.groupId) return;
    const moved = moveSequencerGroup(asset, selection.groupId, direction);
    if (!moved.ok) {
      setError(moved.error);
      return;
    }
    if (moved.changed) {
      pushHistory(asset, selection, time, selectedItems, 'Reorder Timeline Track Group');
      replaceAsset(moved.asset);
      setPayloadInvalid(false);
    }
    applySelection({ track: -1, marker: null, groupId: selection.groupId });
    setError(null);
  };

  const startTrackDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    trackIndex: number,
  ) => {
    if (event.button !== 0 || !asset) return;
    const track = asset.tracks[trackIndex];
    if (!track || timelineTrackIsLocked(asset, track)) return;
    event.preventDefault();
    event.stopPropagation();
    finishKeyboardNudge();
    finishInspectorEdit();
    trackDragCleanup.current?.();
    setTrackDragVisual(null);
    setGroupDragVisual(null);

    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const selectionBefore = selection ? { ...selection } : null;
    const selectedItemsBefore = structuredClone(selectedItems);
    const timeBefore = time;
    let dragged = false;
    let lastClientX = startX;
    let lastClientY = startY;
    let lastTarget: SequencerTrackDropTarget | null = null;
    let autoScrollFrame: number | null = null;

    const resolveTarget = (clientX: number, clientY: number): SequencerTrackDropTarget | null => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const root = element?.closest<HTMLElement>('[data-sequencer-track-root-drop]');
      if (root) return { kind: 'root' };
      const groupRow = element?.closest<HTMLElement>('[data-sequencer-group-id]');
      if (groupRow?.dataset.sequencerGroupId) {
        return { kind: 'group', groupId: groupRow.dataset.sequencerGroupId };
      }
      const trackRow = element?.closest<HTMLElement>('[data-sequencer-track-id]');
      const targetTrackId = trackRow?.dataset.sequencerTrackId;
      if (!trackRow || !targetTrackId || targetTrackId === track.id) return null;
      const bounds = trackRow.getBoundingClientRect();
      return {
        kind: 'track',
        trackId: targetTrackId,
        edge: clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
      };
    };
    const targetIsValid = (target: SequencerTrackDropTarget | null): boolean => {
      if (!target || target.kind === 'root') return true;
      const group = target.kind === 'group'
        ? asset.groups.find((candidate) => candidate.id === target.groupId)
        : timelineGroupForTrack(asset, target.trackId);
      return !group?.locked;
    };
    const publishTarget = (target: SequencerTrackDropTarget | null) => {
      lastTarget = target;
      const valid = targetIsValid(target);
      setTrackDragVisual((current) => (
        current?.sourceTrackId === track.id
        && current.valid === valid
        && sequencerTrackDropKey(current.target) === sequencerTrackDropKey(target)
          ? current
          : { sourceTrackId: track.id, target, valid }
      ));
    };
    const updateTarget = (clientX: number, clientY: number, allowScroll: boolean): boolean => {
      const viewport = tracksViewport.current;
      let scrolled = false;
      if (allowScroll && viewport) {
        const bounds = viewport.getBoundingClientRect();
        const edge = 28;
        const before = viewport.scrollTop;
        if (clientY < bounds.top + 32 + edge) viewport.scrollTop -= 12;
        else if (clientY > bounds.bottom - edge) viewport.scrollTop += 12;
        scrolled = viewport.scrollTop !== before;
      }
      publishTarget(resolveTarget(clientX, clientY));
      return scrolled;
    };
    const continueAutoScroll = () => {
      autoScrollFrame = null;
      if (!dragged) return;
      if (updateTarget(lastClientX, lastClientY, true)) {
        autoScrollFrame = window.requestAnimationFrame(continueAutoScroll);
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', cancelWithEscape, true);
      if (autoScrollFrame != null) window.cancelAnimationFrame(autoScrollFrame);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      if (trackDragCleanup.current === cleanup) trackDragCleanup.current = null;
    };
    const cancel = () => {
      cleanup();
      setTrackDragVisual(null);
      applySelection(selectionBefore, selectedItemsBefore);
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      lastClientX = moveEvent.clientX;
      lastClientY = moveEvent.clientY;
      if (!dragged && Math.hypot(lastClientX - startX, lastClientY - startY) >= 4) {
        dragged = true;
      }
      if (!dragged) return;
      moveEvent.preventDefault();
      const scrolled = updateTarget(lastClientX, lastClientY, true);
      if (scrolled && autoScrollFrame == null) {
        autoScrollFrame = window.requestAnimationFrame(continueAutoScroll);
      }
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      if (dragged) finishEvent.preventDefault();
      cleanup();
      setTrackDragVisual(null);
      if (finishEvent.type === 'pointercancel') {
        applySelection(selectionBefore, selectedItemsBefore);
        return;
      }
      if (!dragged || !lastTarget) return;
      const placed = placeSequencerTrack(asset, track.id, lastTarget);
      if (!placed.ok) {
        setError(placed.error);
        return;
      }
      if (placed.changed) {
        pushHistory(asset, selectionBefore, timeBefore, selectedItemsBefore, 'Move Timeline Track');
        replaceAsset(placed.asset);
        setPayloadInvalid(false);
      }
      applySelection({ track: placed.trackIndex, marker: null });
      setError(null);
    };
    const cancelWithEscape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancel();
    };

    applySelection({ track: trackIndex, marker: null });
    handle.setPointerCapture(pointerId);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', cancelWithEscape, true);
    trackDragCleanup.current = cleanup;
  };

  const startGroupDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    groupId: string,
  ) => {
    if (event.button !== 0 || !asset) return;
    const group = asset.groups.find((candidate) => candidate.id === groupId);
    if (!group || group.locked) return;
    event.preventDefault();
    event.stopPropagation();
    finishKeyboardNudge();
    finishInspectorEdit();
    trackDragCleanup.current?.();
    setTrackDragVisual(null);
    setGroupDragVisual(null);

    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const selectionBefore = selection ? { ...selection } : null;
    const selectedItemsBefore = structuredClone(selectedItems);
    const timeBefore = time;
    let dragged = false;
    let lastClientX = startX;
    let lastClientY = startY;
    let lastTarget: SequencerGroupDropTarget | null = null;
    let lastTargetKey: string | null = null;
    let autoScrollFrame: number | null = null;

    const resolveTarget = (clientX: number, clientY: number): SequencerGroupDropTarget | null => {
      const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const root = element?.closest<HTMLElement>('[data-sequencer-track-root-drop]');
      if (root) return { kind: 'root' };
      const groupRow = element?.closest<HTMLElement>('[data-sequencer-group-id]');
      const targetGroupId = groupRow?.dataset.sequencerGroupId;
      if (groupRow && targetGroupId) {
        if (targetGroupId === group.id) return null;
        const bounds = groupRow.getBoundingClientRect();
        return {
          kind: 'group',
          groupId: targetGroupId,
          edge: clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
        };
      }
      const trackRow = element?.closest<HTMLElement>('[data-sequencer-track-id]');
      const targetTrackId = trackRow?.dataset.sequencerTrackId;
      if (!trackRow || !targetTrackId) return null;
      const owner = timelineGroupForTrack(asset, targetTrackId);
      if (owner?.id === group.id) return null;
      const bounds = trackRow.getBoundingClientRect();
      const edge = clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
      return owner
        ? { kind: 'group', groupId: owner.id, edge }
        : { kind: 'track', trackId: targetTrackId, edge };
    };
    const publishTarget = (target: SequencerGroupDropTarget | null) => {
      const key = sequencerGroupDropKey(target);
      if (lastTargetKey === key) return;
      lastTargetKey = key;
      lastTarget = target;
      const valid = !target || placeSequencerGroup(asset, group.id, target).ok;
      setGroupDragVisual((current) => (
        current?.sourceGroupId === group.id
        && current.valid === valid
        && sequencerGroupDropKey(current.target) === sequencerGroupDropKey(target)
          ? current
          : { sourceGroupId: group.id, target, valid }
      ));
    };
    const updateTarget = (clientX: number, clientY: number, allowScroll: boolean): boolean => {
      const viewport = tracksViewport.current;
      let scrolled = false;
      if (allowScroll && viewport) {
        const bounds = viewport.getBoundingClientRect();
        const edge = 28;
        const before = viewport.scrollTop;
        if (clientY < bounds.top + 32 + edge) viewport.scrollTop -= 12;
        else if (clientY > bounds.bottom - edge) viewport.scrollTop += 12;
        scrolled = viewport.scrollTop !== before;
      }
      publishTarget(resolveTarget(clientX, clientY));
      return scrolled;
    };
    const continueAutoScroll = () => {
      autoScrollFrame = null;
      if (!dragged) return;
      if (updateTarget(lastClientX, lastClientY, true)) {
        autoScrollFrame = window.requestAnimationFrame(continueAutoScroll);
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('keydown', cancelWithEscape, true);
      if (autoScrollFrame != null) window.cancelAnimationFrame(autoScrollFrame);
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
      if (trackDragCleanup.current === cleanup) trackDragCleanup.current = null;
    };
    const cancel = () => {
      cleanup();
      setGroupDragVisual(null);
      applySelection(selectionBefore, selectedItemsBefore);
    };
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      lastClientX = moveEvent.clientX;
      lastClientY = moveEvent.clientY;
      if (!dragged && Math.hypot(lastClientX - startX, lastClientY - startY) >= 4) dragged = true;
      if (!dragged) return;
      moveEvent.preventDefault();
      const scrolled = updateTarget(lastClientX, lastClientY, true);
      if (scrolled && autoScrollFrame == null) {
        autoScrollFrame = window.requestAnimationFrame(continueAutoScroll);
      }
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointerId) return;
      if (dragged) finishEvent.preventDefault();
      cleanup();
      setGroupDragVisual(null);
      if (finishEvent.type === 'pointercancel') {
        applySelection(selectionBefore, selectedItemsBefore);
        return;
      }
      if (!dragged || !lastTarget) return;
      const placed = placeSequencerGroup(asset, group.id, lastTarget);
      if (!placed.ok) {
        setError(placed.error);
        return;
      }
      if (placed.changed) {
        pushHistory(asset, selectionBefore, timeBefore, selectedItemsBefore, 'Move Timeline Track Group');
        replaceAsset(placed.asset);
        setPayloadInvalid(false);
      }
      applySelection({ track: -1, marker: null, groupId: group.id });
      setError(null);
    };
    const cancelWithEscape = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key !== 'Escape') return;
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      cancel();
    };

    applySelection({ track: -1, marker: null, groupId: group.id });
    handle.setPointerCapture(pointerId);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    window.addEventListener('keydown', cancelWithEscape, true);
    trackDragCleanup.current = cleanup;
  };

  const pasteItem = (
    source: SequencerClipboard | null = clipboard,
    requestedTime = time,
    preferredTrack = selection?.track ?? null,
  ) => {
    if (!asset || !source) return;
    const pasted = pasteSequencerClipboard(asset, preferredTrack, requestedTime, source);
    if (!pasted.ok) {
      setError(pasted.error);
      return;
    }
    pushHistory(asset, selection, time, selectedItems, source.type === 'group' ? 'Paste Timeline Items' : 'Paste Timeline Item');
    replaceAsset(pasted.asset);
    applySelection(pasted.primary, pasted.selections);
    const pastedTrack = pasted.asset.tracks[pasted.primary.track];
    replaceTime(pastedTrack.type === 'signal'
      ? pastedTrack.markers[pasted.primary.marker].time
      : pastedTrack.clips[pasted.primary.marker].start);
    setError(null);
  };

  const duplicateSelectedItem = () => {
    if (!asset || !selection || selection.marker == null) return;
    const copied = selectedClipboard();
    if (!copied) return;
    if (!copied.ok) {
      setError(copied.error);
      return;
    }
    const selectedTracks = [...new Set(selectedItems.map((item) => item.track))];
    const lockedTrack = selectedTracks.map((index) => asset.tracks[index]).find((track) => track && timelineTrackIsLocked(asset, track));
    if (lockedTrack) {
      setError(`Track '${lockedTrack.name}' is locked. Unlock it before duplicating.`);
      return;
    }
    const requestedTime = copied.clipboard.type === 'group'
      ? Math.max(...copied.clipboard.items.map((entry) => (
        entry.type === 'signal' ? entry.item.time : entry.item.start + entry.item.duration
      ))) + 1 / asset.frame_rate
      : copied.clipboard.type === 'signal'
        ? copied.clipboard.item.time + 1 / asset.frame_rate
        : copied.clipboard.item.start + copied.clipboard.item.duration;
    pasteItem(copied.clipboard, requestedTime, selection.track);
  };

  const startAnimationBlendDrag = (
    event: ReactPointerEvent<HTMLElement>,
    trackIndex: number,
    clipIndex: number,
  ) => {
    if (!asset || event.button !== 0) return;
    const track = asset.tracks[trackIndex];
    if (track?.type !== 'animation') return;
    if (timelineTrackIsLocked(asset, track)) {
      setError(`Track '${track.name}' is locked. Unlock it before editing the crossfade.`);
      return;
    }
    const lane = event.currentTarget.parentElement?.parentElement;
    const clip = track.clips[clipIndex];
    if (!lane || !clip) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = lane.getBoundingClientRect();
    const pointer = event.pointerId;
    const historyCheckpoint = props.undoService.checkpoint();
    const selectionBeforeDrag = selection ? { ...selection } : null;
    const selectedItemsBeforeDrag = structuredClone(selectedItems);
    const timeBeforeDrag = time;
    let historyToken: EditorUndoToken | null = null;
    applySelection({ track: trackIndex, marker: clipIndex }, [{ track: trackIndex, marker: clipIndex }]);
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointer) return;
      const pointerTime = (moveEvent.clientX - bounds.left) / Math.max(1, bounds.width) * asset.duration;
      const blendIn = resizeSequencerAnimationBlend(
        track.clips,
        clipIndex,
        pointerTime - clip.start,
        asset.frame_rate,
      );
      if (!historyToken && Math.abs(blendIn - clip.blend_in) < 0.5 / asset.frame_rate) return;
      if (!historyToken) {
        historyToken = pushHistory(
          asset,
          selectionBeforeDrag,
          timeBeforeDrag,
          selectedItemsBeforeDrag,
          'Resize Timeline Animation Crossfade',
        );
      }
      const next = structuredClone(asset);
      const nextTrack = next.tracks[trackIndex];
      if (nextTrack.type !== 'animation' || !nextTrack.clips[clipIndex]) return;
      nextTrack.clips[clipIndex].blend_in = blendIn;
      replaceAsset(next);
      setError(null);
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (finishEvent.type === 'pointercancel') {
        if (historyToken && props.undoService.isUndoTop(historyToken)) {
          props.undoService.restoreCheckpoint(historyCheckpoint);
        }
        replaceAsset(structuredClone(asset));
        applySelection(selectionBeforeDrag, selectedItemsBeforeDrag);
        replaceTime(timeBeforeDrag);
      } else if (
        historyToken
        && props.undoService.isUndoTop(historyToken)
        && assetRef.current
        && JSON.stringify(assetRef.current) === JSON.stringify(asset)
      ) {
        props.undoService.restoreCheckpoint(historyCheckpoint);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const startMarkerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    trackIndex: number,
    markerIndex: number,
  ) => {
    if (!asset) return;
    event.stopPropagation();
    const lane = event.currentTarget.parentElement;
    if (!lane) return;
    const bounds = lane.getBoundingClientRect();
    const originalTrack = asset.tracks[trackIndex];
    if (!originalTrack) return;
    const targetBounds = event.currentTarget.getBoundingClientRect();
    const edgeDistance = event.clientX - targetBounds.left;
    const trimEdge = originalTrack.type === 'signal'
      ? null
      : edgeDistance <= 7
        ? 'start'
        : targetBounds.width - edgeDistance <= 7
          ? 'end'
          : null;
    const rippleGesture = rippleMode !== event.altKey;
    const clicked = { track: trackIndex, marker: markerIndex };
    const selectionAnchor = selection?.marker != null
      ? { track: selection.track, marker: selection.marker }
      : null;
    if (!trimEdge && (event.ctrlKey || event.metaKey)) {
      const next = selectSequencerItem(
        selectedItems,
        selectionAnchor,
        clicked,
        'toggle',
      );
      applySelection(
        next.primary ? { ...next.primary } : { track: trackIndex, marker: null },
        next.items,
      );
      return;
    }
    if (!trimEdge && event.shiftKey) {
      const next = selectSequencerItem(
        selectedItems,
        selectionAnchor,
        clicked,
        'range',
      );
      applySelection(next.primary, next.items);
      return;
    }
    const dragItems = !trimEdge && selectedItems.length > 1 && selectedItems.some(
      (item) => item.track === trackIndex && item.marker === markerIndex,
    )
      ? structuredClone(selectedItems)
      : [clicked];
    const lockedDragTrack = dragItems
      .map((item) => asset.tracks[item.track])
      .find((track) => track && timelineTrackIsLocked(asset, track));
    if (lockedDragTrack) {
      applySelection(clicked, dragItems);
      setError(`Track '${lockedDragTrack.name}' is locked. Unlock it before moving items.`);
      return;
    }
    const pointerStartTime = (event.clientX - bounds.left) / Math.max(1, bounds.width) * asset.duration;
    const pointer = event.pointerId;
    const selectionBeforeDrag = selection ? { ...selection } : null;
    const selectedItemsBeforeDrag = structuredClone(selectedItems);
    const timeBeforeDrag = time;
    const historyCheckpoint = props.undoService.checkpoint();
    let historyToken: EditorUndoToken | null = null;
    const snapThreshold = asset.duration / Math.max(1, bounds.width) * SEQUENCER_SNAP_THRESHOLD_PX;
    const snapPlayhead = displayTime;
    setSnapGuide(null);
    event.currentTarget.setPointerCapture(pointer);
    applySelection(clicked, dragItems);
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointer) return;
      const position = Math.max(0, Math.min(1, (moveEvent.clientX - bounds.left) / Math.max(1, bounds.width)));
      const requestedDelta = position * asset.duration - pointerStartTime;
      const snappingItems = rippleGesture && !trimEdge
        ? expandSequencerRippleSelection(asset, dragItems)
        : dragItems;
      const magnetic = snapping
        ? snapSequencerItemsDelta(
          asset,
          snappingItems,
          requestedDelta,
          snapPlayhead,
          snapThreshold,
          trimEdge ?? 'both',
        )
        : { delta: requestedDelta, guideTime: null };
      if (!trimEdge) {
        const moved = rippleGesture
          ? rippleMoveSequencerItems(asset, dragItems, magnetic.delta)
          : moveSequencerItems(asset, dragItems, magnetic.delta);
        if (!moved.ok) {
          setSnapGuide(null);
          setError(moved.error);
          return;
        }
        if (!historyToken && Math.abs(moved.delta) >= 0.5 / asset.frame_rate) {
          historyToken = pushHistory(
            asset,
            selectionBeforeDrag,
            timeBeforeDrag,
            selectedItemsBeforeDrag,
            rippleGesture
              ? (dragItems.length > 1 ? 'Ripple Move Timeline Items' : 'Ripple Move Timeline Item')
              : (dragItems.length > 1 ? 'Move Timeline Items' : 'Move Timeline Item'),
          );
        }
        replaceAsset(moved.asset);
        setSnapGuide(
          magnetic.guideTime != null
          && Math.abs(moved.delta - magnetic.delta) < 0.5 / asset.frame_rate
            ? magnetic.guideTime
            : null,
        );
        setError(null);
        return;
      }

      if (originalTrack.type === 'signal') return;
      const originalClip = originalTrack.clips[markerIndex];
      if (!originalClip) return;
      const range = originalTrack.type === 'animation'
        ? trimSequencerAnimationClip(
          originalTrack.clips,
          markerIndex,
          trimEdge,
          magnetic.delta,
          asset.duration,
          asset.frame_rate,
        )
        : trimSequencerClip(
          originalTrack.clips,
          markerIndex,
          trimEdge,
          magnetic.delta,
          asset.duration,
          asset.frame_rate,
          trimEdge === 'start' && originalTrack.type === 'audio'
            ? { offset: originalTrack.clips[markerIndex].clip_in, rate: originalTrack.clips[markerIndex].pitch }
            : trimEdge === 'start' && originalTrack.type === 'particle'
              ? { offset: originalTrack.clips[markerIndex].clip_in, rate: 1 }
              : undefined,
        );
      const rangeBlendIn = 'blendIn' in range && typeof range.blendIn === 'number'
        ? range.blendIn
        : null;
      const resolvedDuration = originalTrack.type === 'particle'
        ? Math.min(
          range.duration,
          TIMELINE_MAX_PARTICLE_TIME - Math.max(
            0,
            originalTrack.clips[markerIndex].clip_in
              + (trimEdge === 'start' ? range.sourceOffsetDelta : 0),
          ),
        )
        : range.duration;
      const originalEdge = trimEdge === 'start'
        ? originalClip.start
        : originalClip.start + originalClip.duration;
      const movedEdge = trimEdge === 'start' ? range.start : range.start + resolvedDuration;
      if (!historyToken && Math.abs(movedEdge - originalEdge) >= 0.5 / asset.frame_rate) {
        historyToken = pushHistory(
          asset,
          selectionBeforeDrag,
          timeBeforeDrag,
          selectedItemsBeforeDrag,
          'Trim Timeline Clip',
        );
      }
      const next = structuredClone(asset);
      const track = next.tracks[trackIndex];
      if (track.type === 'signal') return;
      const clip = track.clips[markerIndex];
      if (!clip) return;
      clip.start = range.start;
      clip.duration = resolvedDuration;
      if (track.type === 'audio') clampTimelineAudioFades(track.clips[markerIndex]);
      if (trimEdge === 'start' && track.type === 'audio' && originalTrack.type === 'audio') {
        const original = originalTrack.clips[markerIndex];
        track.clips[markerIndex].clip_in = Math.max(0, original.clip_in + range.sourceOffsetDelta * original.pitch);
      }
      if (trimEdge === 'start' && track.type === 'animation' && originalTrack.type === 'animation') {
        const original = originalTrack.clips[markerIndex];
        track.clips[markerIndex].clip_in = Math.max(0, original.clip_in + range.sourceOffsetDelta * original.speed);
        track.clips[markerIndex].blend_in = rangeBlendIn ?? original.blend_in;
      } else if (track.type === 'animation') {
        track.clips[markerIndex].blend_in = rangeBlendIn
          ?? Math.min(track.clips[markerIndex].blend_in, clip.duration);
      }
      if (trimEdge === 'start' && track.type === 'particle' && originalTrack.type === 'particle') {
        const original = originalTrack.clips[markerIndex];
        track.clips[markerIndex].clip_in = Math.max(0, original.clip_in + range.sourceOffsetDelta);
      }
      if (track.type === 'camera') {
        const original = originalTrack.type === 'camera' ? originalTrack.clips[markerIndex] : null;
        track.clips[markerIndex].blend_in = trimEdge === 'start' && original
          ? trimSequencerCameraBlendIn(original.blend_in, clip.duration, range.sourceOffsetDelta)
          : Math.min(track.clips[markerIndex].blend_in, clip.duration);
      }
      replaceAsset(next);
      setSnapGuide(
        magnetic.guideTime != null
        && Math.abs(movedEdge - magnetic.guideTime) < 0.5 / asset.frame_rate
          ? magnetic.guideTime
          : null,
      );
      setError(null);
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      setSnapGuide(null);
      if (finishEvent.type === 'pointercancel') {
        if (historyToken && props.undoService.isUndoTop(historyToken)) {
          props.undoService.restoreCheckpoint(historyCheckpoint);
        }
        replaceAsset(structuredClone(asset));
        applySelection(selectionBeforeDrag, selectedItemsBeforeDrag);
        replaceTime(timeBeforeDrag);
      } else if (
        historyToken
        && props.undoService.isUndoTop(historyToken)
        && assetRef.current
        && JSON.stringify(assetRef.current) === JSON.stringify(asset)
      ) {
        props.undoService.restoreCheckpoint(historyCheckpoint);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const startMarquee = (
    event: ReactPointerEvent<HTMLDivElement>,
    trackIndex: number,
  ) => {
    if (!asset || event.button !== 0 || event.target !== event.currentTarget) return;
    const container = tracksViewport.current;
    if (!container) return;
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget;
    const pointer = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const initialViewport = container.getBoundingClientRect();
    const startContentX = startX - initialViewport.left + container.scrollLeft;
    const startContentY = startY - initialViewport.top + container.scrollTop;
    const laneBounds = lane.getBoundingClientRect();
    const trackHeader = lane.previousElementSibling as HTMLElement | null;
    const selectionBefore = selectionRef.current ? { ...selectionRef.current } : null;
    const itemsBefore = structuredClone(selectedItemsRef.current);
    const mode = event.ctrlKey || event.metaKey ? 'toggle' : event.shiftKey ? 'add' : 'replace';
    let dragged = false;
    let lastClientX = startX;
    let lastClientY = startY;
    let autoScrollFrame: number | null = null;
    lane.setPointerCapture(pointer);

    const updateMarquee = (clientX: number, clientY: number, allowScroll = true): boolean => {
      const viewport = container.getBoundingClientRect();
      const headerRight = trackHeader?.getBoundingClientRect().right ?? viewport.left;
      const rulerBottom = container.querySelector<HTMLElement>('.sequencer-ruler-row')
        ?.getBoundingClientRect().bottom ?? viewport.top;
      const laneLeft = Math.max(viewport.left, Math.min(viewport.right, headerRight));
      const laneTop = Math.max(viewport.top, Math.min(viewport.bottom, rulerBottom));
      const edge = 28;
      const scrollStep = 22;
      const scrollLeftBefore = container.scrollLeft;
      const scrollTopBefore = container.scrollTop;
      if (allowScroll) {
        if (clientX > viewport.right - edge) container.scrollLeft += scrollStep;
        else if (clientX < laneLeft + edge) container.scrollLeft -= scrollStep;
        if (clientY > viewport.bottom - edge) container.scrollTop += scrollStep;
        else if (clientY < laneTop + edge) container.scrollTop -= scrollStep;
      }

      const currentX = Math.max(laneLeft, Math.min(viewport.right, clientX));
      const currentY = Math.max(laneTop, Math.min(viewport.bottom, clientY));
      const anchorX = viewport.left + startContentX - container.scrollLeft;
      const anchorY = viewport.top + startContentY - container.scrollTop;
      const selectionLeft = Math.min(anchorX, currentX);
      const selectionTop = Math.min(anchorY, currentY);
      const selectionRight = Math.max(anchorX, currentX);
      const selectionBottom = Math.max(anchorY, currentY);
      const left = Math.max(laneLeft, selectionLeft);
      const top = Math.max(laneTop, selectionTop);
      const right = Math.min(viewport.right, selectionRight);
      const bottom = Math.min(viewport.bottom, selectionBottom);
      const nextMarquee = {
        left,
        top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      };
      setMarquee(nextMarquee);

      const hits: SequencerItemSelection[] = [];
      for (const element of container.querySelectorAll<HTMLElement>('[data-sequencer-item]')) {
        const bounds = element.getBoundingClientRect();
        if (
          bounds.right < selectionLeft
          || bounds.left > selectionRight
          || bounds.bottom < selectionTop
          || bounds.top > selectionBottom
        ) continue;
        const track = Number(element.dataset.track);
        const marker = Number(element.dataset.marker);
        if (Number.isInteger(track) && Number.isInteger(marker)) hits.push({ track, marker });
      }
      const nextItems = combineSequencerMarqueeSelection(itemsBefore, hits, mode);
      const primary = nextItems.at(-1) ?? null;
      applySelection(primary ? { ...primary } : null, nextItems);
      return container.scrollLeft !== scrollLeftBefore || container.scrollTop !== scrollTopBefore;
    };

    const continueAutoScroll = () => {
      autoScrollFrame = null;
      if (!dragged) return;
      if (updateMarquee(lastClientX, lastClientY)) {
        autoScrollFrame = window.requestAnimationFrame(continueAutoScroll);
      }
    };

    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointer) return;
      lastClientX = moveEvent.clientX;
      lastClientY = moveEvent.clientY;
      if (!dragged && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) >= 4) {
        dragged = true;
      }
      if (dragged) {
        moveEvent.preventDefault();
        const scrolled = updateMarquee(moveEvent.clientX, moveEvent.clientY);
        if (scrolled && autoScrollFrame == null) {
          autoScrollFrame = window.requestAnimationFrame(continueAutoScroll);
        }
      }
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (autoScrollFrame != null) window.cancelAnimationFrame(autoScrollFrame);
      if (lane.hasPointerCapture(pointer)) lane.releasePointerCapture(pointer);
      setMarquee(null);
      if (finishEvent.type === 'pointercancel') {
        applySelection(selectionBefore, itemsBefore);
        return;
      }
      if (dragged) {
        updateMarquee(finishEvent.clientX, finishEvent.clientY, false);
        setMarquee(null);
        return;
      }
      const markerTime = snapTimelineAssetTime(
        (finishEvent.clientX - laneBounds.left) / Math.max(1, laneBounds.width) * asset.duration,
        asset,
      );
      scrub(markerTime);
      applySelection({ track: trackIndex, marker: null });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const finishKeyboardNudge = () => {
    const transaction = keyboardNudge.current;
    keyboardNudge.current = null;
    if (
      !transaction?.historyToken
      || !props.undoService.isUndoTop(transaction.historyToken)
      || !assetRef.current
      || JSON.stringify(assetRef.current) !== JSON.stringify(transaction.asset)
    ) return;
    props.undoService.restoreCheckpoint(transaction.historyCheckpoint);
  };

  const nudgeSelectedItems = (frames: number, useRipple = rippleMode) => {
    const current = assetRef.current;
    const items = selectedItemsRef.current;
    if (!current || items.length === 0) return false;
    const activeTransaction = keyboardNudge.current;
    if (
      activeTransaction
      && (
        (activeTransaction.historyToken != null && !props.undoService.isUndoTop(activeTransaction.historyToken))
        || JSON.stringify(activeTransaction.selectedItems) !== JSON.stringify(items)
        || activeTransaction.ripple !== useRipple
      )
    ) {
      finishKeyboardNudge();
    }
    const requestedDelta = frames / current.frame_rate;
    const moved = useRipple
      ? rippleMoveSequencerItems(current, items, requestedDelta)
      : moveSequencerItems(current, items, requestedDelta);
    if (!moved.ok) {
      setError(moved.error);
      return true;
    }
    if (Math.abs(moved.delta) < 0.5 / current.frame_rate) {
      setError(`Selected Timeline items cannot move any farther ${frames < 0 ? 'left' : 'right'}.`);
      return true;
    }
    let transaction = keyboardNudge.current;
    if (!transaction) {
      transaction = {
        asset: structuredClone(current),
        selection: selectionRef.current ? { ...selectionRef.current } : null,
        selectedItems: structuredClone(items),
        time: timeRef.current,
        historyCheckpoint: props.undoService.checkpoint(),
        historyToken: null,
        ripple: useRipple,
      };
      keyboardNudge.current = transaction;
    }
    if (!transaction.historyToken) {
      transaction.historyToken = pushHistory(
        transaction.asset,
        transaction.selection,
        transaction.time,
        transaction.selectedItems,
        useRipple ? 'Ripple Nudge Timeline Items' : 'Nudge Timeline Items',
      );
    }
    replaceAsset(moved.asset);
    setError(null);
    return true;
  };

  useEffect(() => {
    const finish = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') finishKeyboardNudge();
    };
    const cancel = () => finishKeyboardNudge();
    window.addEventListener('keyup', finish);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keyup', finish);
      window.removeEventListener('blur', cancel);
      finishKeyboardNudge();
    };
  }, [props.undoService]);

  if (!props.assetPath) return null;
  if (!asset) {
    return (
      <div className="timeline-panel sequencer-panel">
        <div className="timeline-empty">
          <strong>{loading ? 'Loading Timeline…' : 'Timeline Sequencer'}</strong>
          <span>{error ?? '双击 Project 中的 .mtimeline，或从 Assets/Create/Timeline 创建。'}</span>
          <button type="button" onClick={props.onClose}><X size={14} /> Back to Animation</button>
        </div>
      </div>
    );
  }

  const selectedGroup = selection?.groupId
    ? asset.groups.find((group) => group.id === selection.groupId) ?? null
    : null;
  const selectedTrack = selection && selection.track >= 0 ? asset.tracks[selection.track] : null;
  const selectedTrackLocked = Boolean(selectedTrack && timelineTrackIsLocked(asset, selectedTrack));
  const hasSolo = timelineHasSolo(asset);
  const groupByTrackId = new Map<string, TimelineTrackGroup>();
  const firstTrackByGroupId = new Map<string, number>();
  const lastTrackByGroupId = new Map<string, number>();
  for (const group of asset.groups) {
    for (const trackId of group.track_ids) groupByTrackId.set(trackId, group);
    const firstTrack = asset.tracks.findIndex((track) => group.track_ids.includes(track.id));
    if (firstTrack >= 0) firstTrackByGroupId.set(group.id, firstTrack);
    for (let trackIndex = asset.tracks.length - 1; trackIndex >= 0; trackIndex -= 1) {
      if (group.track_ids.includes(asset.tracks[trackIndex].id)) {
        lastTrackByGroupId.set(group.id, trackIndex);
        break;
      }
    }
  }
  const selectedMarker = selection?.marker != null && selectedTrack?.type === 'signal'
    ? selectedTrack.markers[selection.marker]
    : null;
  const selectedActivationClip = selection?.marker != null && selectedTrack?.type === 'activation'
    ? selectedTrack.clips[selection.marker]
    : null;
  const selectedAudioClip = selection?.marker != null && selectedTrack?.type === 'audio'
    ? selectedTrack.clips[selection.marker]
    : null;
  const selectedAnimationClip = selection?.marker != null && selectedTrack?.type === 'animation'
    ? selectedTrack.clips[selection.marker]
    : null;
  const selectedAnimationRequiredBlend = selectedAnimationClip && selectedTrack?.type === 'animation'
    ? Math.max(0, (selectedTrack.clips[selection!.marker! - 1]?.start ?? 0)
      + (selectedTrack.clips[selection!.marker! - 1]?.duration ?? 0) - selectedAnimationClip.start)
    : 0;
  const selectedParticleClip = selection?.marker != null && selectedTrack?.type === 'particle'
    ? selectedTrack.clips[selection.marker]
    : null;
  const selectedCameraClip = selection?.marker != null && selectedTrack?.type === 'camera'
    ? selectedTrack.clips[selection.marker]
    : null;
  const selectedClip = selectedActivationClip ?? selectedAudioClip ?? selectedAnimationClip ?? selectedParticleClip ?? selectedCameraClip;
  const isItemSelected = (track: number, marker: number) => selectedItems.some(
    (item) => item.track === track && item.marker === marker,
  );
  const rippleEligible = selectedItems.some((item) => {
    const track = asset.tracks[item.track];
    return Boolean(track && track.type !== 'signal');
  });
  const audioAssets = listProjectFiles().filter((entry) => entry.kind === 'audio');
  const animationAssets = listProjectFiles().filter((entry) => entry.kind === 'animation');
  const laneViewportWidth = Math.max(360, tracksWidth - 180);
  const laneWidth = Math.max(360, Math.round(laneViewportWidth * zoom));
  const ticks = sequencerTicks(asset.duration, laneWidth);
  const previewRangeStartMaximum = resizeSequencerPreviewRange(
    previewRange,
    'start',
    asset.duration,
    asset.duration,
    asset.frame_rate,
  ).start;
  const previewRangeEndMinimum = resizeSequencerPreviewRange(
    previewRange,
    'end',
    0,
    asset.duration,
    asset.frame_rate,
  ).end;
  const transportPlaying = liveDirector ? Boolean(liveDirector.playing) : playing;
  const bindingsJson = director?.bindings_json ?? '{}';
  const renderBindingEditor = (target: string) => {
    let resolution: ReturnType<typeof resolveTimelineBinding> | null = null;
    let bindingError: string | null = null;
    try {
      resolution = resolveTimelineBinding(bindingsJson, target, props.entities);
    } catch (reason) {
      bindingError = reason instanceof Error ? reason.message : String(reason);
    }
    const status = bindingError
      ? bindingError
      : !directorEntity
        ? 'No TimelineDirector is assigned to this asset.'
        : resolution?.status === 'bound'
          ? `Bound to ${resolution.entity.name ?? `Entity ${resolution.entity.entity}`} (${resolution.binding.entity})`
          : resolution?.status === 'stale'
            ? `Stale binding: ${resolution.binding.name || 'Unnamed entity'} (${resolution.binding.entity})`
            : 'Legacy child-path lookup. Bind an entity to survive rename and reparent operations.';
    return <fieldset className="sequencer-inspector-fields sequencer-binding-editor">
      <legend>Stable Binding</legend>
      <p className={`sequencer-field-help${bindingError || resolution?.status === 'stale' ? ' error' : ''}`}>{status}</p>
      <div className="sequencer-track-order">
        <button type="button" disabled={!directorEntity || !props.selectedEntity || Boolean(bindingError)} onClick={() => {
          if (!directorEntity || !props.selectedEntity) return;
          try {
            const next = setTimelineBinding(bindingsJson, target, props.selectedEntity);
            props.onPatchDirector(directorEntity.entity, { bindings_json: next });
            props.onLog(`Bound Timeline target ${target} to ${props.selectedEntity.name ?? props.selectedEntity.entity}`);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        }}><Link size={13} /> Bind Selected</button>
        <button type="button" disabled={!directorEntity || (!bindingError && resolution?.status === 'legacy')} onClick={() => {
          if (!directorEntity) return;
          try {
            props.onPatchDirector(directorEntity.entity, {
              bindings_json: bindingError ? '{}' : clearTimelineBinding(bindingsJson, target),
            });
            props.onLog(bindingError
              ? 'Reset invalid Timeline binding table; legacy child-path lookup is active.'
              : `Cleared stable Timeline binding for ${target}; legacy child-path lookup is active.`);
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        }}>{bindingError ? 'Reset Binding Table' : 'Use Child Path'}</button>
      </div>
    </fieldset>;
  };
  const clearBindingBeforeTargetEdit = (target: string) => {
    if (!directorEntity) return;
    try {
      if (resolveTimelineBinding(bindingsJson, target, props.entities).status === 'legacy') return;
      props.onPatchDirector(directorEntity.entity, {
        bindings_json: clearTimelineBinding(bindingsJson, target),
      });
    } catch {
      // Invalid authoring input is surfaced by the binding editor and runtime validator.
    }
  };
  const scrub = (next: number) => {
    if (liveDirector && directorEntity) props.onPatchDirector(directorEntity.entity, { time: next });
    else {
      void audioPreviewController.unlock();
      replaceTime(next);
      setAudioAuditionRevision((value) => value + 1);
    }
  };
  const changePreviewRange = (next: SequencerPreviewRange) => {
    if (!asset || props.playMode) return;
    const normalized = normalizeSequencerPreviewRange(next, asset.duration, asset.frame_rate);
    setPlaying(false);
    replacePreviewRange(normalized);
    if (timeRef.current < normalized.start || timeRef.current > normalized.end) {
      scrub(Math.max(normalized.start, Math.min(normalized.end, timeRef.current)));
    }
  };
  const changePreviewRangeEdge = (edge: SequencerPreviewRangeEdge, requestedTime: number) => {
    if (!asset || props.playMode) return;
    changePreviewRange(resizeSequencerPreviewRange(
      previewRangeRef.current,
      edge,
      requestedTime,
      asset.duration,
      asset.frame_rate,
    ));
  };
  const previewRangeTimeAtPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!asset) return null;
    const ruler = event.currentTarget.closest<HTMLElement>('.sequencer-ruler');
    if (!ruler) return null;
    const bounds = ruler.getBoundingClientRect();
    if (bounds.width <= 0) return null;
    return (event.clientX - bounds.left) / bounds.width * asset.duration;
  };
  const beginPreviewRangeDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    edge: SequencerPreviewRangeEdge,
  ) => {
    if (event.button !== 0 || props.playMode) return;
    event.preventDefault();
    event.stopPropagation();
    previewRangeDrag.current = { pointerId: event.pointerId, edge };
    setDraggingPreviewEdge(edge);
    setPlaying(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePreviewRangeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = previewRangeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const requestedTime = previewRangeTimeAtPointer(event);
    if (requestedTime != null) changePreviewRangeEdge(drag.edge, requestedTime);
  };
  const finishPreviewRangeDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = previewRangeDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    previewRangeDrag.current = null;
    setDraggingPreviewEdge(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const revealPreviewRangeEdge = (edge: SequencerPreviewRangeEdge) => {
    requestAnimationFrame(() => {
      const viewport = tracksViewport.current;
      if (!viewport || !assetRef.current) return;
      const targetTime = edge === 'start' ? previewRangeRef.current.start : previewRangeRef.current.end;
      const visibleLaneWidth = Math.max(1, viewport.clientWidth - 180);
      viewport.scrollLeft = sequencerRevealScrollLeft(
        viewport.scrollLeft,
        targetTime / assetRef.current.duration * laneWidth,
        laneWidth,
        visibleLaneWidth,
      );
    });
  };
  const previewRangeHandleKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    edge: SequencerPreviewRangeEdge,
  ) => {
    if (!asset || props.playMode) return;
    const current = edge === 'start' ? previewRangeRef.current.start : previewRangeRef.current.end;
    const frames = event.shiftKey ? 10 : 1;
    let requested: number | null = null;
    if (event.key === 'ArrowLeft') requested = current - frames / asset.frame_rate;
    else if (event.key === 'ArrowRight') requested = current + frames / asset.frame_rate;
    else if (event.key === 'Home') requested = 0;
    else if (event.key === 'End') requested = asset.duration;
    if (requested == null) return;
    event.preventDefault();
    event.stopPropagation();
    changePreviewRangeEdge(edge, requested);
    revealPreviewRangeEdge(edge);
  };
  const toggleLoopPreview = () => {
    const next = !loopPreview;
    setLoopPreview(next);
    try {
      localStorage.setItem(SEQUENCER_LOOP_PREVIEW_KEY, next ? '1' : '0');
    } catch {
      /* ignore unavailable storage */
    }
  };
  const toggleEditPlayback = () => {
    void audioPreviewController.unlock();
    if (!playing && asset && (timeRef.current < previewRange.start || timeRef.current >= previewRange.end)) {
      replaceTime(previewRange.start);
    }
    setPlaying((value) => !value);
  };
  const scrubRulerPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!asset) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    scrub(snapTimelineAssetTime((event.clientX - bounds.left) / bounds.width * asset.duration, asset));
  };
  const changeZoom = (requested: number, anchorClientX?: number) => {
    const next = clampSequencerZoom(requested);
    const viewport = tracksViewport.current;
    if (!viewport || next === zoom) {
      setZoom(next);
      return;
    }
    const visibleLaneWidth = Math.max(1, viewport.clientWidth - 180);
    const viewportBounds = viewport.getBoundingClientRect();
    const anchor = anchorClientX == null
      ? visibleLaneWidth / 2
      : Math.max(0, Math.min(visibleLaneWidth, anchorClientX - viewportBounds.left - 180));
    const timeRatio = Math.max(0, viewport.scrollLeft + anchor) / Math.max(1, laneWidth);
    setZoom(next);
    requestAnimationFrame(() => {
      const nextLaneWidth = Math.max(360, Math.round(visibleLaneWidth * next));
      viewport.scrollLeft = Math.max(0, timeRatio * nextLaneWidth - anchor);
    });
  };
  const frameSelectedItems = () => {
    const range = sequencerSelectionTimeRange(asset, selectedItems);
    const viewport = tracksViewport.current;
    if (!range || !viewport) return;
    const visibleLaneWidth = Math.max(1, viewport.clientWidth - 180);
    const rangeDuration = Math.max(0, range.end - range.start);
    const padding = rangeDuration <= 1e-9
      ? Math.max(2 / asset.frame_rate, asset.duration / 16)
      : Math.max(2 / asset.frame_rate, rangeDuration * 0.12);
    const visibleDuration = Math.max(1 / asset.frame_rate, Math.min(
      asset.duration,
      rangeDuration + padding * 2,
    ));
    const nextZoom = clampSequencerZoom(asset.duration / visibleDuration);
    const center = (range.start + range.end) / 2;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      const nextLaneWidth = Math.max(360, Math.round(visibleLaneWidth * nextZoom));
      const maximumScroll = Math.max(0, nextLaneWidth - visibleLaneWidth);
      viewport.scrollLeft = Math.max(0, Math.min(
        maximumScroll,
        center / asset.duration * nextLaneWidth - visibleLaneWidth / 2,
      ));
    });
  };
  const toggleSnapping = () => {
    const next = !snapping;
    setSnapping(next);
    if (!next) setSnapGuide(null);
    try {
      localStorage.setItem(SEQUENCER_SNAPPING_KEY, next ? '1' : '0');
    } catch {
      /* ignore unavailable storage */
    }
  };
  const toggleRippleMode = () => {
    finishKeyboardNudge();
    const next = !rippleMode;
    setRippleMode(next);
    try {
      localStorage.setItem(SEQUENCER_RIPPLE_KEY, next ? '1' : '0');
    } catch {
      /* ignore unavailable storage */
    }
  };
  const toggleInspector = () => {
    const next = !inspectorOpen;
    if (!next) finishInspectorEdit();
    setInspectorOpen(next);
    try {
      localStorage.setItem(SEQUENCER_INSPECTOR_KEY, next ? '1' : '0');
    } catch {
      /* ignore unavailable storage */
    }
  };
  const beginTrackPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    finishKeyboardNudge();
    panDrag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      scrollLeft: event.currentTarget.scrollLeft,
    };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveTrackPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.currentTarget.scrollLeft = sequencerPanScrollLeft(
      drag.scrollLeft,
      drag.clientX,
      event.clientX,
      event.currentTarget.scrollWidth,
      event.currentTarget.clientWidth,
    );
  };
  const finishTrackPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    panDrag.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const renderGroupRow = (group: TimelineTrackGroup) => {
    const selectedCount = selectedItems.filter((item) => {
      const trackId = asset.tracks[item.track]?.id;
      return Boolean(trackId && group.track_ids.includes(trackId));
    }).length;
    const dropInside = trackDragVisual?.target?.kind === 'group'
      && trackDragVisual.target.groupId === group.id;
    const groupDrop = groupDragVisual?.target?.kind === 'group'
      && groupDragVisual.target.groupId === group.id
      ? groupDragVisual.target
      : null;
    const groupDropOnRow = groupDrop?.edge === 'before'
      ? 'before'
      : groupDrop?.edge === 'after' && (group.collapsed || !lastTrackByGroupId.has(group.id))
        ? 'after'
        : null;
    const dragSource = groupDragVisual?.sourceGroupId === group.id;
    return <div
      className={`sequencer-group-row${selection?.groupId === group.id ? ' selected' : ''}${group.solo ? ' solo' : ''}${group.muted ? ' muted' : ''}${group.locked ? ' locked' : ''}${dragSource ? ' group-drag-source' : ''}${dropInside ? ` drop-inside${trackDragVisual.valid ? '' : ' invalid'}` : ''}${groupDropOnRow ? ` drop-${groupDropOnRow}${groupDragVisual?.valid ? '' : ' invalid'}` : ''}`}
      data-sequencer-group-id={group.id}
      key={`group-${group.id}`}
    >
      <div className="sequencer-track-header sequencer-group-header">
        <button
          type="button"
          className="sequencer-track-drag-handle sequencer-group-drag-handle"
          aria-label={`Drag ${group.name} group`}
          title={group.locked ? `Unlock ${group.name} before moving it` : `Drag ${group.name} with all member tracks`}
          disabled={group.locked}
          onPointerDown={(event) => startGroupDrag(event, group.id)}
        ><GripVertical size={12} /></button>
        <button
          type="button"
          className="sequencer-group-disclosure"
          aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
          onClick={() => update((draft) => {
            const target = draft.groups.find((candidate) => candidate.id === group.id);
            if (target) target.collapsed = !target.collapsed;
          }, group.collapsed ? 'Expand Timeline Track Group' : 'Collapse Timeline Track Group')}
        >{group.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button>
        <button type="button" className="sequencer-group-name" onClick={() => applySelection({ track: -1, marker: null, groupId: group.id })}>
          <FolderTree size={13} /> <span>{group.name}</span>
        </button>
        <button
          type="button"
          className={group.solo ? 'active solo' : ''}
          aria-pressed={group.solo}
          title={`${group.solo ? 'Disable' : 'Enable'} group Solo`}
          onClick={() => update((draft) => {
            const target = draft.groups.find((candidate) => candidate.id === group.id);
            if (target) target.solo = !target.solo;
          }, group.solo ? 'Disable Timeline Track Group Solo' : 'Solo Timeline Track Group')}
        >S</button>
        <button
          type="button"
          className={group.muted ? 'active' : ''}
          aria-pressed={group.muted}
          title={`${group.muted ? 'Unmute' : 'Mute'} group`}
          onClick={() => update((draft) => {
            const target = draft.groups.find((candidate) => candidate.id === group.id);
            if (target) target.muted = !target.muted;
          }, group.muted ? 'Unmute Timeline Track Group' : 'Mute Timeline Track Group')}
        >M</button>
        <button
          type="button"
          className={group.locked ? 'active' : ''}
          aria-pressed={group.locked}
          title={`${group.locked ? 'Unlock' : 'Lock'} group`}
          onClick={() => update((draft) => {
            const target = draft.groups.find((candidate) => candidate.id === group.id);
            if (target) target.locked = !target.locked;
          }, group.locked ? 'Unlock Timeline Track Group' : 'Lock Timeline Track Group')}
        ><Lock size={11} /></button>
      </div>
      <div className="sequencer-lane sequencer-group-lane" onClick={() => applySelection({ track: -1, marker: null, groupId: group.id })}>
        <span>{group.track_ids.length} track{group.track_ids.length === 1 ? '' : 's'}{selectedCount > 0 ? ` · ${selectedCount} selected` : ''}{group.solo ? ' · SOLO' : ''}{group.muted ? ' · MUTED' : ''}{group.locked ? ' · LOCKED' : ''}</span>
        {snapGuide != null && <i className="sequencer-snap-guide" style={{ left: `${snapGuide / asset.duration * 100}%` }} />}
        <i className="sequencer-playhead" style={{ left: `${displayTime / asset.duration * 100}%` }} />
      </div>
    </div>;
  };

  return (
    <div
      className={`timeline-panel sequencer-panel${trackDragVisual || groupDragVisual ? ' track-dragging' : ''}`}
      tabIndex={0}
      onPointerDownCapture={(event) => {
        finishKeyboardNudge();
        const target = event.target as HTMLElement;
        if (!target.closest('input, textarea, select, button, summary')) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      onKeyDown={(event) => {
        const modified = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (modified && key === 's') {
          event.preventDefault();
          event.stopPropagation();
          void save();
          return;
        }
        const eventTarget = event.target as HTMLElement;
        const tag = eventTarget.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || eventTarget.isContentEditable) return;
        if (modified && key === 'z') {
          event.preventDefault();
          event.stopPropagation();
          restoreHistory(event.shiftKey ? 'redo' : 'undo');
          return;
        }
        if (modified && key === 'y') {
          event.preventDefault();
          event.stopPropagation();
          restoreHistory('redo');
          return;
        }
        if (modified && key === 'a') {
          event.preventDefault();
          event.stopPropagation();
          const items = asset.tracks.flatMap((track, trackIndex) => {
            const count = track.type === 'signal' ? track.markers.length : track.clips.length;
            return Array.from({ length: count }, (_, marker) => ({ track: trackIndex, marker }));
          });
          const primary = items[items.length - 1] ?? null;
          applySelection(primary, items);
          return;
        }
        if (modified && key === 'c') {
          event.preventDefault();
          event.stopPropagation();
          copySelectedItem();
          return;
        }
        if (modified && key === 'x') {
          event.preventDefault();
          event.stopPropagation();
          cutSelectedItems();
          return;
        }
        if (modified && key === 'v') {
          event.preventDefault();
          event.stopPropagation();
          pasteItem(clipboard, displayTime);
          return;
        }
        if (modified && key === 'd') {
          event.preventDefault();
          event.stopPropagation();
          duplicateSelectedItem();
          return;
        }
        if (!modified && key === 'f' && selectedItems.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          frameSelectedItems();
          return;
        }
        if (['BUTTON', 'SUMMARY'].includes(tag)) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          applySelection(null);
          setError(null);
          return;
        }
        if (event.code === 'Space') {
          event.preventDefault();
          if (liveDirector && directorEntity) {
            props.onPatchDirector(directorEntity.entity, { playing: !transportPlaying });
          } else {
            toggleEditPlayback();
          }
          return;
        }
        if (!modified && event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          const direction = event.key === 'ArrowUp' ? -1 : 1;
          if (selection?.groupId || (selection && selection.track >= 0 && selection.marker == null)) {
            event.preventDefault();
            event.stopPropagation();
            if (selection.groupId) moveSelectedGroup(direction);
            else moveSelectedTrack(direction);
          }
          return;
        }
        if (!modified && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
          event.preventDefault();
          event.stopPropagation();
          const frames = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1);
          if (!nudgeSelectedItems(frames, rippleMode !== event.altKey)) {
            scrub(snapTimelineAssetTime(displayTime + frames / asset.frame_rate, asset));
          }
          return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
          event.preventDefault();
          event.stopPropagation();
          deleteSelection(event.shiftKey);
        }
      }}
    >
      <div className="timeline-toolbar sequencer-toolbar">
        <div className="sequencer-toolbar-primary">
          <div className="timeline-transport">
            <button type="button" className={transportPlaying ? 'active' : ''} title={transportPlaying ? 'Pause' : 'Play'} onClick={() => {
              if (liveDirector && directorEntity) props.onPatchDirector(directorEntity.entity, { playing: !transportPlaying });
              else toggleEditPlayback();
            }}>
              {transportPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button type="button" title="Stop" onClick={() => {
              if (liveDirector && directorEntity) props.onPatchDirector(directorEntity.entity, { playing: false, time: 0 });
              else { setPlaying(false); replaceTime(previewRange.start); }
            }}><Square size={13} /></button>
          </div>
          <label className="timeline-time">Time <input type="number" min={0} max={asset.duration} step={1 / asset.frame_rate} value={Number(displayTime.toFixed(4))} onChange={(event) => {
            const next = snapTimelineAssetTime(Number(event.target.value), asset);
            scrub(next);
          }} /></label>
          <span className="timeline-clip-path" title={props.assetPath}>{asset.name} — {props.assetPath}{dirty ? ' *' : ''}</span>
          {selectedItems.length > 0 && <span className="sequencer-selection-count" title="Arrow keys nudge by one frame; Shift+Arrow nudges by ten frames.">{selectedItems.length} selected</span>}
          {liveDirector && <span className={`sequencer-live-status${liveDirector.playing ? ' playing' : ''}`}>{liveDirector.playing ? 'LIVE PLAYING' : 'LIVE PAUSED'} · {displayTime.toFixed(2)}s</span>}
          {!props.playMode && props.previewEnabled && directorEntity && <span className="sequencer-live-status edit-preview">EDIT PREVIEW · Activation + Animation + Camera + Audio + Particle</span>}
          {!props.playMode && audioPreviewStatus.mode !== 'idle' && <span className="sequencer-live-status edit-preview">AUDIO {audioPreviewStatus.mode.toUpperCase()}{audioPreviewStatus.voices ? ` · ${audioPreviewStatus.voices}` : ''}</span>}
          <button type="button" className={`timeline-icon-button sequencer-inspector-toggle${inspectorOpen ? ' active' : ''}`} aria-label={inspectorOpen ? 'Hide Timeline Inspector' : 'Show Timeline Inspector'} title={inspectorOpen ? 'Hide Timeline Inspector' : 'Show Timeline Inspector'} onClick={toggleInspector}>
            {inspectorOpen ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />}
          </button>
          <button type="button" className="timeline-icon-button" aria-label="Save Timeline" title={saving ? 'Saving' : 'Save Timeline (Ctrl+S)'} disabled={!dirty || saving || payloadInvalid} onClick={() => void save()}><Save size={14} /></button>
          <button type="button" className="timeline-icon-button" aria-label="Back to Animation Clip editor" title="Back to Animation Clip editor" onClick={props.onClose}><X size={14} /></button>
        </div>
        <div className="sequencer-toolbar-tools">
          <div className="sequencer-edit-controls">
            <button type="button" aria-label="Undo" title={`Undo${props.undoService.undoLabel ? ` ${props.undoService.undoLabel}` : ''} (Ctrl+Z)`} disabled={!props.undoService.canUndo} onClick={() => restoreHistory('undo')}><Undo2 size={13} /></button>
            <button type="button" aria-label="Redo" title={`Redo${props.undoService.redoLabel ? ` ${props.undoService.redoLabel}` : ''} (Ctrl+Y)`} disabled={!props.undoService.canRedo} onClick={() => restoreHistory('redo')}><Redo2 size={13} /></button>
            <button type="button" aria-label="Copy selected items" title="Copy selected items (Ctrl+C)" disabled={!selectedMarker && !selectedClip} onClick={() => copySelectedItem()}><Copy size={13} /></button>
            <button type="button" aria-label="Paste at playhead" title="Paste at playhead (Ctrl+V)" disabled={!clipboard} onClick={() => pasteItem(clipboard, displayTime)}><ClipboardPaste size={13} /></button>
            <button type="button" aria-label="Delete Timeline selection" title="Delete selected group, track, or items (Delete)" disabled={!selection} onClick={() => deleteSelection()}><Trash2 size={13} /></button>
            <button type="button" aria-label="Ripple delete selected clips" title="Ripple Delete per affected track (Shift+Delete)" disabled={!rippleEligible} onClick={() => deleteSelection(true)}><ChevronsLeft size={13} /></button>
            <button type="button" className={rippleMode ? 'active' : ''} aria-pressed={rippleMode} aria-label="Toggle Timeline Ripple Move" title={`Ripple Move ${rippleMode ? 'on' : 'off'} · shifts the affected track suffix · Alt temporarily inverts`} onClick={toggleRippleMode}><MoveHorizontal size={13} /></button>
            <button type="button" className={snapping ? 'active' : ''} aria-pressed={snapping} aria-label="Toggle Timeline snapping" title={`Magnetic snapping ${snapping ? 'on' : 'off'} (${SEQUENCER_SNAP_THRESHOLD_PX}px)`} onClick={toggleSnapping}><Magnet size={13} /></button>
          </div>
          {!props.playMode && <div className="sequencer-preview-range" role="group" aria-label="Edit preview range">
            <button type="button" className={loopPreview ? 'active' : ''} aria-pressed={loopPreview} aria-label="Toggle preview loop" title={`Loop Edit Preview ${loopPreview ? 'on' : 'off'}`} onClick={toggleLoopPreview}><Repeat2 size={13} /></button>
            <label>In<input type="number" min={0} max={previewRangeStartMaximum} step={1 / asset.frame_rate} value={Number(previewRange.start.toFixed(4))} onChange={(event) => changePreviewRangeEdge('start', Number(event.target.value))} /></label>
            <label>Out<input type="number" min={previewRangeEndMinimum} max={asset.duration} step={1 / asset.frame_rate} value={Number(previewRange.end.toFixed(4))} onChange={(event) => changePreviewRangeEdge('end', Number(event.target.value))} /></label>
            <button type="button" aria-label="Reset preview range" title="Reset Edit Preview to the complete Timeline" disabled={previewRange.start === 0 && previewRange.end === asset.duration} onClick={() => changePreviewRange({ start: 0, end: asset.duration })}>All</button>
          </div>}
          <div className="sequencer-zoom-controls">
            <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoom <= SEQUENCER_MIN_ZOOM} onClick={() => changeZoom(zoom / 1.5)}><Minus size={13} /></button>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              aria-label="Timeline zoom"
              title={`Timeline zoom ${zoom.toFixed(zoom < 10 ? 1 : 0)}x`}
              value={sequencerZoomToSlider(zoom)}
              onChange={(event) => changeZoom(sequencerSliderToZoom(Number(event.target.value)))}
            />
            <button type="button" aria-label="Fit entire Timeline" title="Fit entire Timeline" disabled={zoom === 1} onClick={() => {
              setZoom(1);
              if (tracksViewport.current) tracksViewport.current.scrollLeft = 0;
            }}><Maximize2 size={12} /></button>
            <button type="button" aria-label="Frame selected items" title="Frame selected items (F)" disabled={selectedItems.length === 0} onClick={frameSelectedItems}><Crosshair size={12} /></button>
            <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoom >= SEQUENCER_MAX_ZOOM} onClick={() => changeZoom(zoom * 1.5)}><Plus size={13} /></button>
            <span>{zoom.toFixed(zoom < 10 ? 1 : 0)}x</span>
          </div>
          <details className="sequencer-add-track">
            <summary><Plus size={14} /> Track</summary>
            <div>
              <button type="button" onClick={(event) => { addSignalTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Signal</button>
              <button type="button" onClick={(event) => { addActivationTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Activation</button>
              <button type="button" onClick={(event) => { addAudioTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Audio</button>
              <button type="button" onClick={(event) => { addAnimationTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Animation</button>
              <button type="button" onClick={(event) => { addParticleTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Particle</button>
              <button type="button" disabled={asset.tracks.some((track) => track.type === 'camera')} onClick={(event) => { addCameraTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Camera</button>
              <button type="button" onClick={(event) => { addTrackGroup(); event.currentTarget.closest('details')?.removeAttribute('open'); }}><FolderTree size={12} /> Group</button>
            </div>
          </details>
          <button type="button" disabled={!selectedTrack || selectedTrackLocked} title={selectedTrackLocked ? 'Unlock the track or its group to add items' : undefined} onClick={() => selectedTrack && addTrackItem(selection!.track, displayTime)}>
            <Plus size={14} /> {selectedTrack?.type === 'signal' ? 'Signal' : 'Clip'}
          </button>
          <select className="sequencer-director-select" aria-label="Timeline Director" title="Active TimelineDirector for playback and stable track bindings" value={directorEntity?.entity ?? ''} onChange={(event) => setDirectorEntityId(event.target.value ? Number(event.target.value) : null)}>
            <option value="">No Director</option>
            {matchingDirectors.map((entity) => <option value={entity.entity} key={entity.entity}>{entity.name ?? `Entity ${entity.entity}`}</option>)}
          </select>
          <button type="button" className="timeline-icon-button" aria-label="Assign Timeline Director" title="Assign this Timeline asset to the selected entity as its Director" disabled={!props.selectedEntity} onClick={() => {
            if (!props.selectedEntity) return;
            props.onAssignDirector(props.selectedEntity.entity, props.assetPath!);
            setDirectorEntityId(props.selectedEntity.entity);
          }}><Link size={14} /></button>
        </div>
      </div>

      {error && <div className="timeline-message error">{error}</div>}
      {previewWarning && !props.playMode && <div className="timeline-message warning">Edit Preview: {previewWarning}</div>}
      <div className={`sequencer-workspace${inspectorOpen ? ' inspector-open' : ''}`}>
        <div
          className={`sequencer-tracks${panning ? ' panning' : ''}`}
          ref={tracksViewport}
          title="Drag empty lanes to marquee-select. Shift adds; Ctrl/Cmd toggles. Middle-drag pans horizontally."
          style={{ '--sequencer-lane-width': `${laneWidth}px` } as CSSProperties}
          onWheel={(event) => {
            if (event.ctrlKey || event.metaKey) {
              event.preventDefault();
              changeZoom(zoom * (event.deltaY > 0 ? 0.8 : 1.25), event.clientX);
              return;
            }
            if (event.shiftKey) {
              event.preventDefault();
              event.currentTarget.scrollLeft += sequencerShiftWheelDelta(event.deltaX, event.deltaY);
            }
          }}
          onPointerDownCapture={beginTrackPan}
          onPointerMoveCapture={moveTrackPan}
          onPointerUpCapture={finishTrackPan}
          onPointerCancelCapture={finishTrackPan}
          onLostPointerCapture={finishTrackPan}
          onAuxClick={(event) => {
            if (event.button === 1) event.preventDefault();
          }}
        >
          <div className="sequencer-ruler-row">
            <div className="sequencer-track-header">Tracks</div>
            <div
              className="sequencer-ruler"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                rulerScrubPointer.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                scrubRulerPointer(event);
              }}
              onPointerMove={(event) => {
                if (rulerScrubPointer.current === event.pointerId) scrubRulerPointer(event);
              }}
              onPointerUp={(event) => {
                if (rulerScrubPointer.current !== event.pointerId) return;
                rulerScrubPointer.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                if (rulerScrubPointer.current === event.pointerId) rulerScrubPointer.current = null;
              }}
            >
              {!props.playMode && <i className="sequencer-preview-range-band" style={{ left: `${previewRange.start / asset.duration * 100}%`, width: `${(previewRange.end - previewRange.start) / asset.duration * 100}%` }} />}
              {!props.playMode && <>
                <button
                  type="button"
                  role="slider"
                  className={`sequencer-preview-range-handle start${previewRange.start <= 1e-9 ? ' boundary' : ''}${draggingPreviewEdge === 'start' ? ' dragging' : ''}`}
                  aria-label="Edit preview in point"
                  aria-valuemin={0}
                  aria-valuemax={previewRangeStartMaximum}
                  aria-valuenow={previewRange.start}
                  aria-valuetext={`${previewRange.start.toFixed(3)} seconds`}
                  title={`Preview In · ${previewRange.start.toFixed(3)}s · drag or use arrows (Shift = 10 frames)`}
                  style={{ left: `${previewRange.start / asset.duration * 100}%` }}
                  onPointerDown={(event) => beginPreviewRangeDrag(event, 'start')}
                  onPointerMove={movePreviewRangeDrag}
                  onPointerUp={finishPreviewRangeDrag}
                  onPointerCancel={finishPreviewRangeDrag}
                  onLostPointerCapture={finishPreviewRangeDrag}
                  onKeyDown={(event) => previewRangeHandleKeyDown(event, 'start')}
                  onFocus={() => revealPreviewRangeEdge('start')}
                />
                <button
                  type="button"
                  role="slider"
                  className={`sequencer-preview-range-handle end${Math.abs(previewRange.end - asset.duration) <= 1e-9 ? ' boundary' : ''}${draggingPreviewEdge === 'end' ? ' dragging' : ''}`}
                  aria-label="Edit preview out point"
                  aria-valuemin={previewRangeEndMinimum}
                  aria-valuemax={asset.duration}
                  aria-valuenow={previewRange.end}
                  aria-valuetext={`${previewRange.end.toFixed(3)} seconds`}
                  title={`Preview Out · ${previewRange.end.toFixed(3)}s · drag or use arrows (Shift = 10 frames)`}
                  style={{ left: `${previewRange.end / asset.duration * 100}%` }}
                  onPointerDown={(event) => beginPreviewRangeDrag(event, 'end')}
                  onPointerMove={movePreviewRangeDrag}
                  onPointerUp={finishPreviewRangeDrag}
                  onPointerCancel={finishPreviewRangeDrag}
                  onLostPointerCapture={finishPreviewRangeDrag}
                  onKeyDown={(event) => previewRangeHandleKeyDown(event, 'end')}
                  onFocus={() => revealPreviewRangeEdge('end')}
                />
              </>}
              {ticks.map((tick) => <span key={tick.time} style={{ left: `${tick.position * 100}%` }}>{tick.time.toFixed(tick.time < 1 ? 2 : 1)}</span>)}
              {snapGuide != null && <i className="sequencer-snap-guide ruler-guide" style={{ left: `${snapGuide / asset.duration * 100}%` }}><b>{snapGuide.toFixed(3)}s</b></i>}
              <i className="sequencer-playhead" style={{ left: `${displayTime / asset.duration * 100}%` }} />
            </div>
          </div>
          {asset.tracks.map((track, trackIndex) => {
            const group = groupByTrackId.get(track.id) ?? null;
            const effectivelyLocked = timelineTrackIsLocked(asset, track);
            const effectivelyMuted = timelineTrackIsMuted(asset, track, hasSolo);
            const effectivelySolo = timelineTrackIsSolo(asset, track);
            const dropTarget = trackDragVisual?.target?.kind === 'track'
              && trackDragVisual.target.trackId === track.id
              ? trackDragVisual.target
              : null;
            const dragSource = trackDragVisual?.sourceTrackId === track.id;
            const groupTrackDrop = groupDragVisual?.target?.kind === 'track'
              && groupDragVisual.target.trackId === track.id
              ? groupDragVisual.target
              : null;
            const groupAfterDrop = group
              && !group.collapsed
              && lastTrackByGroupId.get(group.id) === trackIndex
              && groupDragVisual?.target?.kind === 'group'
              && groupDragVisual.target.groupId === group.id
              && groupDragVisual.target.edge === 'after';
            const groupDropEdge = groupTrackDrop?.edge ?? (groupAfterDrop ? 'after' : null);
            const groupDragMember = Boolean(group && groupDragVisual?.sourceGroupId === group.id);
            const effectiveMuteLabel = track.muted
              ? 'Muted'
              : group?.muted
                ? 'Group Muted'
                : effectivelyMuted
                  ? 'Solo Filter'
                  : null;
            return <Fragment key={track.id}>
              {group && firstTrackByGroupId.get(group.id) === trackIndex && renderGroupRow(group)}
              {!group?.collapsed && <div
                className={`sequencer-track-row${group ? ' grouped' : ''}${selection?.track === trackIndex ? ' selected' : ''}${selectedItems.some((item) => item.track === trackIndex) ? ' contains-selection' : ''}${effectivelyLocked ? ' locked' : ''}${effectivelySolo ? ' effectively-solo' : ''}${effectivelyMuted ? ' effectively-muted' : ''}${dragSource ? ' drag-source' : ''}${groupDragMember ? ' group-drag-member' : ''}${dropTarget ? ` drop-${dropTarget.edge}${trackDragVisual?.valid ? '' : ' invalid'}` : ''}${groupDropEdge ? ` drop-${groupDropEdge}${groupDragVisual?.valid ? '' : ' invalid'}` : ''}`}
                data-sequencer-track-id={track.id}
              >
              <div className="sequencer-track-header">
                <button
                  type="button"
                  className="sequencer-track-drag-handle"
                  aria-label={`Drag ${track.name} track`}
                  title={effectivelyLocked ? `Unlock ${track.name} before moving it` : `Drag ${track.name} to reorder or change its group`}
                  disabled={effectivelyLocked}
                  onPointerDown={(event) => startTrackDrag(event, trackIndex)}
                ><GripVertical size={12} /></button>
                <button type="button" className="sequencer-track-select" onClick={() => applySelection({ track: trackIndex, marker: null })}>
                  <span className={`sequencer-track-icon ${track.type}`}>{track.type === 'signal' ? 'S' : track.type === 'activation' ? 'A' : track.type === 'audio' ? '♪' : track.type === 'animation' ? 'M' : track.type === 'particle' ? 'P' : 'C'}</span>
                  <span>{track.name}</span>
                  {effectiveMuteLabel && <small>{effectiveMuteLabel}</small>}
                  {effectivelyLocked && <Lock className="sequencer-track-lock" size={11} aria-label={track.locked ? 'Locked' : 'Group locked'} />}
                </button>
                <button
                  type="button"
                  className={`sequencer-track-state${track.solo ? ' active solo' : ''}${!track.solo && group?.solo ? ' inherited' : ''}`}
                  aria-pressed={track.solo}
                  title={group?.solo && !track.solo ? 'Solo inherited from group' : `${track.solo ? 'Disable' : 'Enable'} track Solo`}
                  onClick={() => update((draft) => { draft.tracks[trackIndex].solo = !draft.tracks[trackIndex].solo; }, track.solo ? 'Disable Timeline Track Solo' : 'Solo Timeline Track')}
                >S</button>
                <button
                  type="button"
                  className={`sequencer-track-state${track.muted ? ' active muted' : ''}${!track.muted && group?.muted ? ' inherited' : ''}`}
                  aria-pressed={track.muted}
                  title={group?.muted && !track.muted ? 'Mute inherited from group' : `${track.muted ? 'Unmute' : 'Mute'} track`}
                  onClick={() => update((draft) => { draft.tracks[trackIndex].muted = !draft.tracks[trackIndex].muted; }, track.muted ? 'Unmute Timeline Track' : 'Mute Timeline Track')}
                >M</button>
              </div>
              <div className="sequencer-lane" onDoubleClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const markerTime = snapTimelineAssetTime((event.clientX - bounds.left) / bounds.width * asset.duration, asset);
                scrub(markerTime);
                addTrackItem(trackIndex, markerTime);
              }} onPointerDown={(event) => startMarquee(event, trackIndex)}>
                {ticks.map((tick) => <i className="sequencer-grid-line" key={tick.time} style={{ left: `${tick.position * 100}%` }} />)}
                {track.type === 'signal' && track.markers.map((marker, markerIndex) => (
                  <button
                    type="button"
                    data-sequencer-item="true"
                    data-track={trackIndex}
                    data-marker={markerIndex}
                    className={`sequencer-marker${isItemSelected(trackIndex, markerIndex) ? ' selected' : ''}`}
                    style={{ left: `${marker.time / asset.duration * 100}%` }}
                    title={`${marker.name} @ ${marker.time.toFixed(3)}s`}
                    key={`${marker.name}-${markerIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, markerIndex)}
                  />
                ))}
                {track.type === 'activation' && track.clips.map((clip, clipIndex) => (
                  <button
                    type="button"
                    data-sequencer-item="true"
                    data-track={trackIndex}
                    data-marker={clipIndex}
                    className={`sequencer-activation-clip${isItemSelected(trackIndex, clipIndex) ? ' selected' : ''}${clip.active ? ' active-state' : ' inactive-state'}`}
                    style={{
                      left: `${clip.start / asset.duration * 100}%`,
                      width: `${clip.duration / asset.duration * 100}%`,
                    }}
                    title={`${clip.active ? 'Active' : 'Inactive'} · ${clip.start.toFixed(3)}s + ${clip.duration.toFixed(3)}s`}
                    key={`${clip.start}-${clipIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, clipIndex)}
                  >{clip.active ? 'ACTIVE' : 'INACTIVE'}</button>
                ))}
                {track.type === 'audio' && track.clips.map((clip, clipIndex) => (
                  <button
                    type="button"
                    data-sequencer-item="true"
                    data-track={trackIndex}
                    data-marker={clipIndex}
                    className={`sequencer-audio-clip${isItemSelected(trackIndex, clipIndex) ? ' selected' : ''}`}
                    style={{
                      left: `${clip.start / asset.duration * 100}%`,
                      width: `${clip.duration / asset.duration * 100}%`,
                    }}
                    title={`${clip.clip} · ${clip.start.toFixed(3)}s + ${clip.duration.toFixed(3)}s · fade ${clip.fade_in.toFixed(3)}s/${clip.fade_out.toFixed(3)}s`}
                    key={`${clip.start}-${clip.clip}-${clipIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, clipIndex)}
                  >
                    <AudioWaveform
                      path={clip.clip}
                      clipIn={clip.clip_in}
                      pitch={clip.pitch}
                      duration={clip.duration}
                      looped={clip.looped}
                    />
                    {clip.fade_in > 0 && <span
                      className="sequencer-audio-fade in"
                      style={{ width: `${clip.fade_in / clip.duration * 100}%` }}
                    />}
                    {clip.fade_out > 0 && <span
                      className="sequencer-audio-fade out"
                      style={{ width: `${clip.fade_out / clip.duration * 100}%` }}
                    />}
                    <span className="sequencer-clip-label">♪ {clip.clip.split('/').at(-1)}</span>
                  </button>
                ))}
                {track.type === 'animation' && track.clips.map((clip, clipIndex) => (
                  <button
                    type="button"
                    data-sequencer-item="true"
                    data-track={trackIndex}
                    data-marker={clipIndex}
                    className={`sequencer-animation-clip${isItemSelected(trackIndex, clipIndex) ? ' selected' : ''}`}
                    style={{
                      left: `${clip.start / asset.duration * 100}%`,
                      width: `${clip.duration / asset.duration * 100}%`,
                    }}
                    title={`${clip.clip} · ${clip.start.toFixed(3)}s + ${clip.duration.toFixed(3)}s · blend ${clip.blend_in.toFixed(3)}s`}
                    key={`${clip.start}-${clip.clip}-${clipIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, clipIndex)}
                  >
                    <i className="sequencer-animation-blend" style={{ width: `${clip.blend_in / clip.duration * 100}%` }} />
                    {isItemSelected(trackIndex, clipIndex) && <span
                      className="sequencer-animation-blend-handle"
                      style={{ left: `${clip.blend_in / clip.duration * 100}%` }}
                      title={`Drag Blend In handle · ${clip.blend_in.toFixed(3)}s`}
                      onPointerDown={(event) => startAnimationBlendDrag(event, trackIndex, clipIndex)}
                    />}
                    <span className="sequencer-clip-label">M {clip.clip.split('/').at(-1)}</span>
                  </button>
                ))}
                {track.type === 'particle' && track.clips.map((clip, clipIndex) => (
                  <button
                    type="button"
                    data-sequencer-item="true"
                    data-track={trackIndex}
                    data-marker={clipIndex}
                    className={`sequencer-particle-clip${isItemSelected(trackIndex, clipIndex) ? ' selected' : ''}`}
                    style={{
                      left: `${clip.start / asset.duration * 100}%`,
                      width: `${clip.duration / asset.duration * 100}%`,
                    }}
                    title={`Particle simulation · ${clip.start.toFixed(3)}s + ${clip.duration.toFixed(3)}s · prewarm ${clip.clip_in.toFixed(3)}s`}
                    key={`${clip.start}-${clip.clip_in}-${clipIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, clipIndex)}
                  >P PARTICLES</button>
                ))}
                {track.type === 'camera' && track.clips.map((clip, clipIndex) => (
                  <button
                    type="button"
                    data-sequencer-item="true"
                    data-track={trackIndex}
                    data-marker={clipIndex}
                    className={`sequencer-camera-clip${isItemSelected(trackIndex, clipIndex) ? ' selected' : ''}`}
                    style={{
                      left: `${clip.start / asset.duration * 100}%`,
                      width: `${clip.duration / asset.duration * 100}%`,
                    }}
                    title={`${clip.target} · ${clip.start.toFixed(3)}s + ${clip.duration.toFixed(3)}s · blend ${clip.blend_in.toFixed(3)}s`}
                    key={`${clip.start}-${clip.target}-${clipIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, clipIndex)}
                  ><i className="sequencer-camera-blend" style={{ width: `${clip.blend_in / clip.duration * 100}%` }} />C {clip.target.split('/').at(-1)}</button>
                ))}
                {snapGuide != null && <i className="sequencer-snap-guide" style={{ left: `${snapGuide / asset.duration * 100}%` }} />}
                <i className="sequencer-playhead" style={{ left: `${displayTime / asset.duration * 100}%` }} />
              </div>
              </div>}
            </Fragment>;
          })}
          {asset.groups.filter((group) => !firstTrackByGroupId.has(group.id)).map(renderGroupRow)}
          {(trackDragVisual || groupDragVisual) && <div
            className={`sequencer-track-root-drop${trackDragVisual?.target?.kind === 'root' || groupDragVisual?.target?.kind === 'root' ? ' active' : ''}${groupDragVisual && !groupDragVisual.valid ? ' invalid' : ''}`}
            data-sequencer-track-root-drop="true"
          ><GripVertical size={12} /> {groupDragVisual ? 'Move group block to end' : 'Move to root · place at end'}</div>}
          {asset.tracks.length === 0 && asset.groups.length === 0 && <div className="sequencer-empty-track">Add a Signal, Activation, Audio, Animation, Particle, Camera Track, or Group to begin authoring.</div>}
          {marquee && <i className="sequencer-marquee" style={marquee} aria-hidden="true" />}
        </div>

        {inspectorOpen && <aside className="sequencer-inspector" onFocusCapture={beginInspectorEdit} onBlurCapture={endInspectorEdit}>
          <h3>{selectedMarker ? 'Signal Marker' : selectedActivationClip ? 'Activation Clip' : selectedAudioClip ? 'Audio Clip' : selectedAnimationClip ? 'Animation Clip' : selectedParticleClip ? 'Particle Clip' : selectedCameraClip ? 'Camera Shot' : selectedTrack ? `${selectedTrack.type === 'signal' ? 'Signal' : selectedTrack.type === 'activation' ? 'Activation' : selectedTrack.type === 'audio' ? 'Audio' : selectedTrack.type === 'animation' ? 'Animation' : selectedTrack.type === 'particle' ? 'Particle' : 'Camera'} Track` : selectedGroup ? 'Track Group' : 'Timeline Asset'}</h3>
          {selectedItems.length > 1 && <p className="sequencer-multi-selection-notice">{selectedItems.length} items selected. Inspector edits and edge trims apply to the primary item; drag, clipboard, duplicate, Delete and Ripple Delete apply to the full selection.</p>}
          {!selectedTrack && !selectedGroup && <>
            <label>Name <input value={asset.name} onChange={(event) => update((draft) => { draft.name = event.target.value; })} /></label>
            <label>Duration <input type="number" min={0.001} step={0.1} value={asset.duration} onChange={(event) => update((draft) => {
              const requested = Math.max(0.001, Number(event.target.value) || 0.001);
              const lockedEnd = lockedSequencerContentEnd(draft);
              draft.duration = Math.max(requested, lockedEnd);
              if (lockedEnd > requested) {
                setError(`Timeline duration cannot be shorter than locked content ending at ${lockedEnd.toFixed(3)}s.`);
              }
              for (const track of draft.tracks) {
                if (timelineTrackIsLocked(draft, track)) continue;
                if (track.type === 'signal') {
                  for (const marker of track.markers) marker.time = Math.min(marker.time, draft.duration);
                } else {
                  const minimum = Math.min(1 / draft.frame_rate, draft.duration);
                  for (const clip of track.clips) {
                    clip.start = Math.min(clip.start, draft.duration - minimum);
                    clip.duration = Math.max(minimum, Math.min(clip.duration, draft.duration - clip.start));
                  }
                  if (track.type === 'camera' || track.type === 'animation') {
                    for (const clip of track.clips) clip.blend_in = Math.min(clip.blend_in, clip.duration);
                  } else if (track.type === 'audio') {
                    for (const clip of track.clips) clampTimelineAudioFades(clip);
                  }
                }
              }
            })} /></label>
            <label>Frame Rate <input type="number" min={1} max={240} step={1} value={asset.frame_rate} onChange={(event) => update((draft) => { draft.frame_rate = Math.max(1, Math.min(240, Number(event.target.value) || 1)); })} /></label>
          </>}
          {selectedGroup && <>
            {selectedGroup.locked && <p className="sequencer-lock-notice"><Lock size={12} /> Group structure editing is disabled. Unlock the group to rename it, change members, or delete it.</p>}
            <label>Name <input disabled={selectedGroup.locked} value={selectedGroup.name} onChange={(event) => update((draft) => {
              const group = draft.groups.find((candidate) => candidate.id === selectedGroup.id);
              if (group) group.name = event.target.value;
            })} /></label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedGroup.solo} onChange={(event) => update((draft) => {
              const group = draft.groups.find((candidate) => candidate.id === selectedGroup.id);
              if (group) group.solo = event.target.checked;
            })} /> Solo all member tracks</label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedGroup.muted} onChange={(event) => update((draft) => {
              const group = draft.groups.find((candidate) => candidate.id === selectedGroup.id);
              if (group) group.muted = event.target.checked;
            })} /> Mute all member tracks</label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedGroup.locked} onChange={(event) => update((draft) => {
              const group = draft.groups.find((candidate) => candidate.id === selectedGroup.id);
              if (group) group.locked = event.target.checked;
            })} /> Lock all member tracks</label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedGroup.collapsed} onChange={(event) => update((draft) => {
              const group = draft.groups.find((candidate) => candidate.id === selectedGroup.id);
              if (group) group.collapsed = event.target.checked;
            })} /> Collapsed</label>
            <fieldset className="sequencer-inspector-fields sequencer-group-members" disabled={selectedGroup.locked}>
              <legend>Member Tracks</legend>
              {asset.tracks.map((track) => {
                const owner = timelineGroupForTrack(asset, track.id);
                return <label className="sequencer-check" key={track.id}>
                  <input type="checkbox" disabled={Boolean(owner?.locked && owner.id !== selectedGroup.id)} checked={owner?.id === selectedGroup.id} onChange={(event) => update((draft) => {
                    draft.groups = assignTimelineTrackGroup(
                      draft.groups,
                      track.id,
                      event.target.checked ? selectedGroup.id : null,
                    );
                  }, event.target.checked ? 'Add Timeline Track To Group' : 'Remove Timeline Track From Group')} />
                  {track.name}{owner && owner.id !== selectedGroup.id ? ` (move from ${owner.name})` : ''}
                </label>;
              })}
              {asset.tracks.length === 0 && <p>No tracks are available.</p>}
            </fieldset>
            <div className="sequencer-track-order">
              <button type="button" disabled={selectedGroup.locked} title="Move group up (Alt+ArrowUp)" onClick={() => moveSelectedGroup(-1)}><ArrowUp size={13} /> Move Up</button>
              <button type="button" disabled={selectedGroup.locked} title="Move group down (Alt+ArrowDown)" onClick={() => moveSelectedGroup(1)}><ArrowDown size={13} /> Move Down</button>
            </div>
            <button type="button" className="sequencer-danger" disabled={selectedGroup.locked} onClick={() => deleteSelection()}><Trash2 size={14} /> Delete Group (Keep Tracks)</button>
          </>}
          {selectedTrack && !selectedMarker && !selectedClip && <>
            <label className="sequencer-check"><input type="checkbox" checked={selectedTrack.solo} onChange={(event) => update((draft) => { draft.tracks[selection!.track].solo = event.target.checked; })} /> Solo</label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedTrack.muted} onChange={(event) => update((draft) => { draft.tracks[selection!.track].muted = event.target.checked; })} /> Muted</label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedTrack.locked} onChange={(event) => update((draft) => { draft.tracks[selection!.track].locked = event.target.checked; })} /> Locked</label>
            <label>Group <select disabled={selectedTrackLocked} value={timelineGroupForTrack(asset, selectedTrack.id)?.id ?? ''} onChange={(event) => update((draft) => {
              draft.groups = assignTimelineTrackGroup(draft.groups, selectedTrack.id, event.target.value || null);
            }, 'Change Timeline Track Group')}>
              <option value="">None</option>
              {asset.groups.map((group) => <option value={group.id} disabled={group.locked} key={group.id}>{group.name}</option>)}
            </select></label>
            {selectedTrackLocked && <p className="sequencer-lock-notice"><Lock size={12} /> Content editing is disabled by this track or its group.</p>}
            <fieldset className="sequencer-inspector-fields" disabled={selectedTrackLocked}>
              <label>Name <input value={selectedTrack.name} onChange={(event) => update((draft) => { draft.tracks[selection!.track].name = event.target.value; })} /></label>
              {selectedTrack.type !== 'signal' && selectedTrack.type !== 'camera' && <label>Target (binding key / child path)<input value={selectedTrack.target} placeholder={selectedTrack.type === 'audio' ? 'Audio/Music' : selectedTrack.type === 'animation' ? 'Characters/Hero' : selectedTrack.type === 'particle' ? 'Effects/Burst' : 'Canvas/Dialog'} onChange={(event) => {
                clearBindingBeforeTargetEdit(selectedTrack.target);
                update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type !== 'signal' && track.type !== 'camera') track.target = event.target.value.replaceAll('\\', '/');
                });
              }} /></label>}
              {selectedTrack.type !== 'signal' && selectedTrack.type !== 'camera' && renderBindingEditor(selectedTrack.target)}
              <div className="sequencer-track-order">
                <button type="button" title="Move track up (Alt+ArrowUp)" disabled={selection!.track === 0} onClick={() => moveSelectedTrack(-1)}><ArrowUp size={13} /> Move Up</button>
                <button type="button" title="Move track down (Alt+ArrowDown)" disabled={selection!.track === asset.tracks.length - 1} onClick={() => moveSelectedTrack(1)}><ArrowDown size={13} /> Move Down</button>
              </div>
              <button type="button" className="sequencer-danger" onClick={() => deleteSelection()}><Trash2 size={14} /> Delete Track</button>
            </fieldset>
          </>}
          {selectedMarker && <fieldset className="sequencer-inspector-fields" disabled={selectedTrackLocked}>
            {selectedTrackLocked && <p className="sequencer-lock-notice"><Lock size={12} /> Unlock the track or its group to edit this signal.</p>}
            <label>Name <input value={selectedMarker.name} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'signal') track.markers[selection!.marker!].name = event.target.value;
            })} /></label>
            <label>Time <input type="number" min={0} max={asset.duration} step={1 / asset.frame_rate} value={selectedMarker.time} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'signal') track.markers[selection!.marker!].time = snapTimelineAssetTime(Number(event.target.value), draft);
            })} /></label>
            <label>Payload (JSON)<textarea key={`${selection!.track}-${selection!.marker}`} defaultValue={selectedMarker.payload === undefined ? '' : JSON.stringify(selectedMarker.payload, null, 2)} onBlur={(event) => {
              try {
                const text = event.target.value.trim();
                update((draft) => {
                  const track = draft.tracks[selection!.track];
                  if (track.type !== 'signal') return;
                  const marker = track.markers[selection!.marker!];
                  if (text) marker.payload = JSON.parse(text);
                  else delete marker.payload;
                });
                setPayloadInvalid(false);
                setError(null);
              } catch (reason) {
                setPayloadInvalid(true);
                setError(`Payload JSON 无效：${reason instanceof Error ? reason.message : String(reason)}`);
              }
            }} /></label>
            <button type="button" className="sequencer-danger" onClick={() => deleteSelection()}><Trash2 size={14} /> Delete {selectedItems.length > 1 ? `${selectedItems.length} Items` : 'Signal'}</button>
          </fieldset>}
          {selectedClip && <fieldset className="sequencer-inspector-fields" disabled={selectedTrackLocked}>
            {selectedTrackLocked && <p className="sequencer-lock-notice"><Lock size={12} /> Unlock the track or its group to edit this clip.</p>}
            <label>Start <input type="number" min={0} max={asset.duration - selectedClip.duration} step={1 / asset.frame_rate} value={selectedClip.start} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'signal') return;
              const clip = track.clips[selection!.marker!];
              const moved = moveSequencerItems(
                draft,
                [{ track: selection!.track, marker: selection!.marker! }],
                Number(event.target.value) - clip.start,
              );
              if (moved.ok) Object.assign(draft, moved.asset);
              else setError(moved.error);
            })} /></label>
            <label>Duration <input type="number" min={1 / asset.frame_rate} max={selectedParticleClip ? Math.min(asset.duration - selectedClip.start, TIMELINE_MAX_PARTICLE_TIME - selectedParticleClip.clip_in) : asset.duration - selectedClip.start} step={1 / asset.frame_rate} value={selectedClip.duration} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'signal') return;
              const clip = track.clips[selection!.marker!];
              const range = track.type === 'animation'
                ? trimSequencerAnimationClip(
                  track.clips,
                  selection!.marker!,
                  'end',
                  Number(event.target.value) - clip.duration,
                  draft.duration,
                  draft.frame_rate,
                )
                : trimSequencerClip(
                  track.clips,
                  selection!.marker!,
                  'end',
                  Number(event.target.value) - clip.duration,
                  draft.duration,
                  draft.frame_rate,
                );
              const rangeBlendIn = 'blendIn' in range && typeof range.blendIn === 'number'
                ? range.blendIn
                : null;
              if (track.type === 'particle') {
                const particleClip = track.clips[selection!.marker!];
                particleClip.duration = Math.min(
                  range.duration,
                  TIMELINE_MAX_PARTICLE_TIME - particleClip.clip_in,
                );
              } else {
                clip.duration = range.duration;
                if (track.type === 'audio') clampTimelineAudioFades(track.clips[selection!.marker!]);
                if (track.type === 'camera' || track.type === 'animation') {
                  track.clips[selection!.marker!].blend_in = track.type === 'animation' && rangeBlendIn != null
                    ? rangeBlendIn
                    : Math.min(track.clips[selection!.marker!].blend_in, range.duration);
                }
              }
            })} /></label>
            {selectedActivationClip && <label className="sequencer-check"><input type="checkbox" checked={selectedActivationClip.active} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'activation') track.clips[selection!.marker!].active = event.target.checked;
            })} /> Target active inside clip</label>}
            {selectedAudioClip && <>
              <label>Audio Clip <input list="sequencer-audio-assets" value={selectedAudioClip.clip} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'audio') track.clips[selection!.marker!].clip = event.target.value.replaceAll('\\', '/');
              })} /></label>
              <datalist id="sequencer-audio-assets">{audioAssets.map((entry) => <option value={entry.relPath} key={entry.relPath} />)}</datalist>
              <label>Clip In <input type="number" min={0} step={1 / asset.frame_rate} value={selectedAudioClip.clip_in} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'audio') track.clips[selection!.marker!].clip_in = Math.max(0, Number(event.target.value) || 0);
              })} /></label>
              <label>Volume <input type="number" min={0} max={4} step={0.01} value={selectedAudioClip.volume} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'audio') track.clips[selection!.marker!].volume = Math.max(0, Math.min(4, Number(event.target.value) || 0));
              })} /></label>
              <label>Pitch <input type="number" min={0.05} max={4} step={0.01} value={selectedAudioClip.pitch} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'audio') track.clips[selection!.marker!].pitch = Math.max(0.05, Math.min(4, Number(event.target.value) || 1));
              })} /></label>
              <label>Fade In <input type="number" min={0} max={selectedAudioClip.duration} step={1 / asset.frame_rate} value={selectedAudioClip.fade_in} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'audio') track.clips[selection!.marker!].fade_in = Math.max(0, Math.min(track.clips[selection!.marker!].duration, Number(event.target.value) || 0));
              })} /></label>
              <label>Fade Out <input type="number" min={0} max={selectedAudioClip.duration} step={1 / asset.frame_rate} value={selectedAudioClip.fade_out} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'audio') track.clips[selection!.marker!].fade_out = Math.max(0, Math.min(track.clips[selection!.marker!].duration, Number(event.target.value) || 0));
              })} /></label>
              <label>Fade Curve <select value={selectedAudioClip.fade_curve} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'audio') track.clips[selection!.marker!].fade_curve = event.target.value as TimelineAudioClip['fade_curve'];
              })}>
                <option value="linear">Linear</option>
                <option value="ease_in_out">Ease In Out</option>
              </select></label>
              <label className="sequencer-check"><input type="checkbox" checked={selectedAudioClip.looped} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'audio') track.clips[selection!.marker!].looped = event.target.checked;
              })} /> Loop audio inside clip</label>
            </>}
            {selectedAnimationClip && <>
              <label>Animation Clip <input list="sequencer-animation-assets" value={selectedAnimationClip.clip} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'animation') track.clips[selection!.marker!].clip = event.target.value.replaceAll('\\', '/');
              })} /></label>
              <datalist id="sequencer-animation-assets">{animationAssets.map((entry) => <option value={entry.relPath} key={entry.relPath} />)}</datalist>
              <label>Clip In <input type="number" min={0} step={1 / asset.frame_rate} value={selectedAnimationClip.clip_in} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'animation') track.clips[selection!.marker!].clip_in = Math.max(0, Number(event.target.value) || 0);
              })} /></label>
              <label>Speed <input type="number" min={-4} max={4} step={0.05} value={selectedAnimationClip.speed} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'animation') track.clips[selection!.marker!].speed = Math.max(-4, Math.min(4, Number(event.target.value) || 0));
              })} /></label>
              <label>Blend In <input type="number" min={selectedAnimationRequiredBlend} max={selectedAnimationClip.duration} step={1 / asset.frame_rate} value={selectedAnimationClip.blend_in} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'animation') {
                  const clip = track.clips[selection!.marker!];
                  clip.blend_in = Math.max(selectedAnimationRequiredBlend, Math.min(clip.duration, Number(event.target.value) || 0));
                }
              })} /></label>
              <label>Blend Curve <select value={selectedAnimationClip.blend_curve} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'animation') track.clips[selection!.marker!].blend_curve = event.target.value as TimelineAnimationClip['blend_curve'];
              })}>
                <option value="ease_in_out">Ease In / Out</option>
                <option value="linear">Linear</option>
              </select></label>
              <p className="sequencer-field-help">Overlap the incoming clip with the previous clip for a live two-clip crossfade. Any remaining Blend In time holds the previous final pose; gaps remain hard cuts.</p>
            </>}
            {selectedParticleClip && <>
              <label>Prewarm / Clip In <input type="number" min={0} max={TIMELINE_MAX_PARTICLE_TIME - selectedParticleClip.duration} step={1 / asset.frame_rate} value={selectedParticleClip.clip_in} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'particle') {
                  const clip = track.clips[selection!.marker!];
                  clip.clip_in = Math.max(0, Math.min(TIMELINE_MAX_PARTICLE_TIME - clip.duration, Number(event.target.value) || 0));
                }
              })} /></label>
              <p className="sequencer-field-help">Particle state is rebuilt deterministically from this local simulation time when entering or seeking the clip.</p>
            </>}
            {selectedCameraClip && <>
              <label>Camera (binding key / child path)<input value={selectedCameraClip.target} placeholder="Cameras/Main Camera" onChange={(event) => {
                clearBindingBeforeTargetEdit(selectedCameraClip.target);
                update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'camera') track.clips[selection!.marker!].target = event.target.value.replaceAll('\\', '/');
                });
              }} /></label>
              {renderBindingEditor(selectedCameraClip.target)}
              <label>Blend In <input type="number" min={0} max={selectedCameraClip.duration} step={1 / asset.frame_rate} value={selectedCameraClip.blend_in} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'camera') {
                  const clip = track.clips[selection!.marker!];
                  clip.blend_in = Math.max(0, Math.min(clip.duration, Number(event.target.value) || 0));
                }
              })} /></label>
              <label>Blend Curve <select value={selectedCameraClip.blend_curve} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'camera') track.clips[selection!.marker!].blend_curve = event.target.value as 'linear' | 'ease_in_out';
              })}>
                <option value="ease_in_out">Ease In / Out</option>
                <option value="linear">Linear</option>
              </select></label>
              <p className="sequencer-field-help">Blend uses the adjacent previous shot, or the authored primary camera. Incompatible perspective/orthographic projections switch at the blend midpoint.</p>
            </>}
            <button type="button" className="sequencer-danger" onClick={() => deleteSelection()}><Trash2 size={14} /> Delete {selectedItems.length > 1 ? `${selectedItems.length} Items` : 'Clip'}</button>
          </fieldset>}
        </aside>}
      </div>
    </div>
  );
}
