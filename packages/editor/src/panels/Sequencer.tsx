import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Copy,
  Link,
  Lock,
  Maximize2,
  Minus,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { registerMenuItem } from '../editorWindow';
import {
  listProjectFiles,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerSaveAllParticipant } from '../saveAll';
import {
  createTimelineAsset,
  parseTimelineAsset,
  serializeTimelineAsset,
  snapTimelineAssetTime,
  validateTimelineAsset,
  type TimelineAsset,
} from '../timelineAsset';
import { PROJECT_ASSETS_CHANGED_EVENT } from './Material';
import {
  SEQUENCER_MAX_ZOOM,
  SEQUENCER_MIN_ZOOM,
  clampSequencerZoom,
  copySequencerItem,
  findSequencerClipPlacement,
  lockedSequencerContentEnd,
  moveSequencerClip,
  moveSequencerTrack,
  pasteSequencerItem,
  sequencerTicks,
  trimSequencerClip,
  type SequencerClipboard,
} from '../sequencerEditing';

export const OPEN_TIMELINE_ASSET_EVENT = 'mengine:open-timeline-asset';

export function openTimelineAsset(path: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_TIMELINE_ASSET_EVENT, { detail: path }));
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'timeline' }));
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

registerMenuItem(
  'Assets/Create/Timeline',
  async (context) => {
    try {
      context.log(`Created ${await createProjectTimeline()}`);
    } catch (reason) {
      context.log(`Timeline 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 215 },
);

type SnapshotEntity = WorldSnapshotView['entities'][number];

export type SequencerProps = {
  assetPath: string | null;
  selectedEntity: SnapshotEntity | null;
  playMode: boolean;
  onClose: () => void;
  onAssignDirector: (entity: number, path: string) => void;
  onPatchDirector: (entity: number, patch: Record<string, unknown>) => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
};

type Selection = { track: number; marker: number | null } | null;
type HistorySnapshot = {
  asset: TimelineAsset;
  selection: Selection;
  time: number;
};
type InspectorEditTransaction = HistorySnapshot & {
  undo: HistorySnapshot[];
  redo: HistorySnapshot[];
  historyRecorded: boolean;
};
type Draft = {
  asset: TimelineAsset;
  savedText: string;
  time: number;
  selection: Selection;
  undo: HistorySnapshot[];
  redo: HistorySnapshot[];
};

function isSequencerEditControl(target: EventTarget): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  if (target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
}

export function Sequencer(props: SequencerProps) {
  const [asset, setAsset] = useState<TimelineAsset | null>(null);
  const [savedText, setSavedText] = useState('');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payloadInvalid, setPayloadInvalid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [tracksWidth, setTracksWidth] = useState(720);
  const [clipboard, setClipboard] = useState<SequencerClipboard | null>(null);
  const [, setHistoryEpoch] = useState(0);
  const loadedPath = useRef('');
  const drafts = useRef(new Map<string, Draft>());
  const assetRef = useRef<TimelineAsset | null>(null);
  const undoHistory = useRef<HistorySnapshot[]>([]);
  const redoHistory = useRef<HistorySnapshot[]>([]);
  const inspectorEdit = useRef<InspectorEditTransaction | null>(null);
  const frame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);
  const tracksViewport = useRef<HTMLDivElement | null>(null);
  assetRef.current = asset;

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
  const anyDirty = dirty || drafts.current.size > 0;
  const directorValue = props.selectedEntity?.components.TimelineDirector;
  const director = directorValue != null && typeof directorValue === 'object'
    ? directorValue as { asset?: string; playing?: boolean; time?: number }
    : null;
  const liveDirector = props.playMode && director?.asset === props.assetPath ? director : null;
  const displayTime = liveDirector && Number.isFinite(Number(liveDirector.time))
    ? Math.max(0, Math.min(asset?.duration ?? 0, Number(liveDirector.time)))
    : time;

  useEffect(() => {
    props.onDirtyChange(anyDirty);
  }, [anyDirty, props.onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    const previous = loadedPath.current;
    if (previous && asset) {
      if (JSON.stringify(asset) !== savedFingerprint) {
        drafts.current.set(previous, {
          asset: structuredClone(asset), savedText, time,
          selection: selection ? { ...selection } : null,
          undo: structuredClone(undoHistory.current),
          redo: structuredClone(redoHistory.current),
        });
      } else {
        drafts.current.delete(previous);
      }
    }
    loadedPath.current = props.assetPath ?? '';
    setPlaying(false);
    setAsset(null);
    setSavedText('');
    setTime(0);
    setZoom(1);
    setSelection(null);
    undoHistory.current = [];
    redoHistory.current = [];
    inspectorEdit.current = null;
    setHistoryEpoch((value) => value + 1);
    setError(null);
    setPayloadInvalid(false);
    if (!props.assetPath) return () => { cancelled = true; };
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      setAsset(structuredClone(draft.asset));
      setSavedText(draft.savedText);
      setTime(draft.time);
      setSelection(draft.selection ? { ...draft.selection } : null);
      undoHistory.current = structuredClone(draft.undo);
      redoHistory.current = structuredClone(draft.redo);
      setHistoryEpoch((value) => value + 1);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const loaded = parseTimelineAsset(text);
        setAsset(loaded);
        setSavedText(serializeTimelineAsset(loaded));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [props.assetPath]);

  const applyUpdate = (mutate: (draft: TimelineAsset) => void) => {
    setAsset((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  const pushHistory = (
    snapshotAsset: TimelineAsset,
    snapshotSelection: Selection = selection,
    snapshotTime = time,
  ) => {
    undoHistory.current.push({
      asset: structuredClone(snapshotAsset),
      selection: snapshotSelection ? { ...snapshotSelection } : null,
      time: snapshotTime,
    });
    if (undoHistory.current.length > 100) undoHistory.current.shift();
    redoHistory.current = [];
    setHistoryEpoch((value) => value + 1);
  };

  const update = (mutate: (draft: TimelineAsset) => void) => {
    if (!asset) return;
    const next = structuredClone(asset);
    mutate(next);
    if (JSON.stringify(next) === JSON.stringify(asset)) return;
    const transaction = inspectorEdit.current;
    if (transaction) {
      if (!transaction.historyRecorded) {
        pushHistory(transaction.asset, transaction.selection, transaction.time);
        transaction.historyRecorded = true;
      }
    } else {
      pushHistory(asset);
    }
    setAsset(next);
  };

  const restoreHistory = (source: 'undo' | 'redo') => {
    if (!asset) return;
    const from = source === 'undo' ? undoHistory.current : redoHistory.current;
    const to = source === 'undo' ? redoHistory.current : undoHistory.current;
    const snapshot = from.pop();
    if (!snapshot) return;
    to.push({
      asset: structuredClone(asset),
      selection: selection ? { ...selection } : null,
      time,
    });
    setAsset(structuredClone(snapshot.asset));
    setSelection(snapshot.selection ? { ...snapshot.selection } : null);
    setTime(Math.max(0, Math.min(snapshot.asset.duration, snapshot.time)));
    setPayloadInvalid(false);
    setError(null);
    setHistoryEpoch((value) => value + 1);
  };

  const beginInspectorEdit = (event: ReactFocusEvent<HTMLElement>) => {
    if (!asset || inspectorEdit.current || !isSequencerEditControl(event.target)) return;
    inspectorEdit.current = {
      asset: structuredClone(asset),
      selection: selection ? { ...selection } : null,
      time,
      undo: structuredClone(undoHistory.current),
      redo: structuredClone(redoHistory.current),
      historyRecorded: false,
    };
  };

  const endInspectorEdit = (event: ReactFocusEvent<HTMLElement>) => {
    if (!isSequencerEditControl(event.target)) return;
    const transaction = inspectorEdit.current;
    inspectorEdit.current = null;
    if (!transaction?.historyRecorded) return;
    const current = assetRef.current;
    if (!current || JSON.stringify(current) !== JSON.stringify(transaction.asset)) return;
    undoHistory.current = transaction.undo;
    redoHistory.current = transaction.redo;
    setHistoryEpoch((value) => value + 1);
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
      setAsset(parseTimelineAsset(text));
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
        validateTimelineAsset(draft.asset);
        await writeProjectAssetText(path, serializeTimelineAsset(draft.asset));
        drafts.current.delete(path);
      }
      await refreshProjectFiles();
      props.onAssetsChanged();
    };
  }), [anyDirty, asset, dirty, payloadInvalid, props.assetPath, savedText]);

  useEffect(() => {
    if (!playing || !asset) return;
    const tick = (now: number) => {
      const previous = previousFrame.current ?? now;
      previousFrame.current = now;
      setTime((current) => {
        const next = current + Math.min(0.1, Math.max(0, (now - previous) / 1000));
        if (next >= asset.duration) {
          setPlaying(false);
          return asset.duration;
        }
        return next;
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
  }, [asset, playing]);

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
    update((draft) => draft.tracks.push({ type: 'signal', id, name: `Signal Track ${index}`, muted: false, locked: false, markers: [] }));
    setSelection({ track: asset.tracks.length, marker: null });
  };

  const addActivationTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `activation-${index}`;
    while (used.has(id)) id = `activation-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'activation', id, name: `Activation Track ${index}`, muted: false, locked: false, target: 'Child', clips: [],
    }));
    setSelection({ track: asset.tracks.length, marker: null });
  };

  const addAudioTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `audio-${index}`;
    while (used.has(id)) id = `audio-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'audio', id, name: `Audio Track ${index}`, muted: false, locked: false, target: 'AudioSource', clips: [],
    }));
    setSelection({ track: asset.tracks.length, marker: null });
  };

  const addAnimationTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `animation-${index}`;
    while (used.has(id)) id = `animation-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'animation', id, name: `Animation Track ${index}`, muted: false, locked: false, target: 'Animated', clips: [],
    }));
    setSelection({ track: asset.tracks.length, marker: null });
  };

  const addMarker = (trackIndex = selection?.track ?? 0, requestedTime = time) => {
    if (!asset || asset.tracks[trackIndex]?.type !== 'signal') return;
    const markerTime = snapTimelineAssetTime(requestedTime, asset);
    update((draft) => {
      const track = draft.tracks[trackIndex];
      if (track.type === 'signal') track.markers.push({ time: markerTime, name: 'Signal' });
    });
    const track = asset.tracks[trackIndex];
    setSelection({ track: trackIndex, marker: track.type === 'signal' ? track.markers.length : null });
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
    setSelection({ track: trackIndex, marker });
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
        ...placement, clip: defaultClip, clip_in: 0, volume: 1, pitch: 1, looped: false,
      });
      if (target.type === 'audio') target.clips.sort((left, right) => left.start - right.start);
    });
    setError(null);
    setSelection({ track: trackIndex, marker });
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
        ...placement, clip: defaultClip, clip_in: 0, speed: 1,
      });
      if (target.type === 'animation') target.clips.sort((left, right) => left.start - right.start);
    });
    setError(null);
    setSelection({ track: trackIndex, marker });
  };

  const addTrackItem = (trackIndex: number, requestedTime: number) => {
    const track = asset?.tracks[trackIndex];
    if (track?.locked) {
      setError(`Track '${track.name}' is locked. Unlock it before adding items.`);
      return;
    }
    if (track?.type === 'signal') addMarker(trackIndex, requestedTime);
    else if (track?.type === 'activation') addActivationClip(trackIndex, requestedTime);
    else if (track?.type === 'audio') addAudioClip(trackIndex, requestedTime);
    else if (track?.type === 'animation') addAnimationClip(trackIndex, requestedTime);
  };

  const copySelectedItem = (): SequencerClipboard | null => {
    if (!asset || !selection || selection.marker == null) return null;
    const copied = copySequencerItem(asset, selection.track, selection.marker);
    if (copied) {
      setClipboard(copied);
      setError(null);
    }
    return copied;
  };

  const deleteSelection = () => {
    if (!asset || !selection) return;
    const selectedTrackIndex = selection.track;
    const selectedItemIndex = selection.marker;
    const track = asset.tracks[selectedTrackIndex];
    if (!track || track.locked) {
      if (track) setError(`Track '${track.name}' is locked. Unlock it before deleting.`);
      return;
    }
    update((draft) => {
      if (selectedItemIndex == null) {
        draft.tracks.splice(selectedTrackIndex, 1);
        return;
      }
      const track = draft.tracks[selectedTrackIndex];
      if (track.type === 'signal') track.markers.splice(selectedItemIndex, 1);
      else track.clips.splice(selectedItemIndex, 1);
    });
    setPayloadInvalid(false);
    setSelection(selectedItemIndex == null
      ? null
      : { track: selectedTrackIndex, marker: null });
  };

  const moveSelectedTrack = (direction: -1 | 1) => {
    if (!asset || !selection) return;
    const moved = moveSequencerTrack(asset, selection.track, direction);
    if (!moved.ok) {
      setError(moved.error);
      return;
    }
    pushHistory(asset);
    setAsset(moved.asset);
    setSelection({ track: moved.trackIndex, marker: selection.marker });
    setError(null);
  };

  const pasteItem = (
    source: SequencerClipboard | null = clipboard,
    requestedTime = time,
    preferredTrack = selection?.track ?? null,
  ) => {
    if (!asset || !source) return;
    const pasted = pasteSequencerItem(asset, preferredTrack, requestedTime, source);
    if (!pasted.ok) {
      setError(pasted.error);
      return;
    }
    pushHistory(asset);
    setAsset(pasted.asset);
    setSelection({ track: pasted.trackIndex, marker: pasted.itemIndex });
    const pastedTrack = pasted.asset.tracks[pasted.trackIndex];
    setTime(pastedTrack.type === 'signal'
      ? pastedTrack.markers[pasted.itemIndex].time
      : pastedTrack.clips[pasted.itemIndex].start);
    setError(null);
  };

  const duplicateSelectedItem = () => {
    if (!asset || !selection || selection.marker == null) return;
    if (asset.tracks[selection.track]?.locked) {
      setError(`Track '${asset.tracks[selection.track].name}' is locked. Unlock it before duplicating.`);
      return;
    }
    const copied = copySequencerItem(asset, selection.track, selection.marker);
    if (!copied) return;
    const track = asset.tracks[selection.track];
    const requestedTime = track.type === 'signal'
      ? track.markers[selection.marker].time + 1 / asset.frame_rate
      : track.clips[selection.marker].start + track.clips[selection.marker].duration;
    pasteItem(copied, requestedTime, selection.track);
  };

  const startMarkerDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    trackIndex: number,
    markerIndex: number,
  ) => {
    if (!asset) return;
    event.preventDefault();
    event.stopPropagation();
    const lane = event.currentTarget.parentElement;
    if (!lane) return;
    const bounds = lane.getBoundingClientRect();
    const originalTrack = asset.tracks[trackIndex];
    if (!originalTrack) return;
    if (originalTrack.locked) {
      setSelection({ track: trackIndex, marker: markerIndex });
      setError(`Track '${originalTrack.name}' is locked. Unlock it before moving items.`);
      return;
    }
    const targetBounds = event.currentTarget.getBoundingClientRect();
    const edgeDistance = event.clientX - targetBounds.left;
    const trimEdge = originalTrack.type === 'signal'
      ? null
      : edgeDistance <= 7
        ? 'start'
        : targetBounds.width - edgeDistance <= 7
          ? 'end'
          : null;
    const pointerStartTime = (event.clientX - bounds.left) / Math.max(1, bounds.width) * asset.duration;
    const pointer = event.pointerId;
    const selectionBeforeDrag = selection ? { ...selection } : null;
    const timeBeforeDrag = time;
    const undoBeforeDrag = structuredClone(undoHistory.current);
    const redoBeforeDrag = structuredClone(redoHistory.current);
    let historyRecorded = false;
    event.currentTarget.setPointerCapture(pointer);
    setSelection({ track: trackIndex, marker: markerIndex });
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointer) return;
      const position = Math.max(0, Math.min(1, (moveEvent.clientX - bounds.left) / Math.max(1, bounds.width)));
      const delta = position * asset.duration - pointerStartTime;
      if (!historyRecorded && Math.abs(delta) >= 0.5 / asset.frame_rate) {
        pushHistory(asset, selectionBeforeDrag, timeBeforeDrag);
        historyRecorded = true;
      }
      applyUpdate((draft) => {
        const track = draft.tracks[trackIndex];
        if (track.type === 'signal') {
          if (originalTrack.type !== 'signal') return;
          const originalMarker = originalTrack.markers[markerIndex];
          track.markers[markerIndex].time = snapTimelineAssetTime(originalMarker.time + delta, draft);
        } else {
          const clip = track.clips[markerIndex];
          if (!clip || originalTrack.type === 'signal') return;
          if (trimEdge) {
            const range = trimSequencerClip(
              originalTrack.clips,
              markerIndex,
              trimEdge,
              delta,
              draft.duration,
              draft.frame_rate,
              trimEdge === 'start' && originalTrack.type === 'audio'
                ? { offset: originalTrack.clips[markerIndex].clip_in, rate: originalTrack.clips[markerIndex].pitch }
                : trimEdge === 'start' && originalTrack.type === 'animation'
                  ? { offset: originalTrack.clips[markerIndex].clip_in, rate: originalTrack.clips[markerIndex].speed }
                  : undefined,
            );
            clip.start = range.start;
            clip.duration = range.duration;
            if (trimEdge === 'start' && track.type === 'audio' && originalTrack.type === 'audio') {
              const original = originalTrack.clips[markerIndex];
              track.clips[markerIndex].clip_in = Math.max(0, original.clip_in + range.sourceOffsetDelta * original.pitch);
            }
            if (trimEdge === 'start' && track.type === 'animation' && originalTrack.type === 'animation') {
              const original = originalTrack.clips[markerIndex];
              track.clips[markerIndex].clip_in = Math.max(0, original.clip_in + range.sourceOffsetDelta * original.speed);
            }
          } else {
            const range = moveSequencerClip(
              originalTrack.clips,
              markerIndex,
              delta,
              draft.duration,
              draft.frame_rate,
            );
            clip.start = range.start;
          }
        }
      });
    };
    const finish = (finishEvent: PointerEvent) => {
      if (finishEvent.pointerId !== pointer) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      if (finishEvent.type === 'pointercancel' && historyRecorded) {
        undoHistory.current = undoBeforeDrag;
        redoHistory.current = redoBeforeDrag;
        setAsset(structuredClone(asset));
        setSelection(selectionBeforeDrag);
        setTime(timeBeforeDrag);
        setHistoryEpoch((value) => value + 1);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

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

  const selectedTrack = selection ? asset.tracks[selection.track] : null;
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
  const selectedClip = selectedActivationClip ?? selectedAudioClip ?? selectedAnimationClip;
  const audioAssets = listProjectFiles().filter((entry) => entry.kind === 'audio');
  const animationAssets = listProjectFiles().filter((entry) => entry.kind === 'animation');
  const laneViewportWidth = Math.max(360, tracksWidth - 180);
  const laneWidth = Math.max(360, Math.round(laneViewportWidth * zoom));
  const ticks = sequencerTicks(asset.duration, laneWidth);
  const transportPlaying = liveDirector ? Boolean(liveDirector.playing) : playing;
  const scrub = (next: number) => {
    if (liveDirector && props.selectedEntity) props.onPatchDirector(props.selectedEntity.entity, { time: next });
    else setTime(next);
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

  return (
    <div
      className="timeline-panel sequencer-panel"
      tabIndex={0}
      onPointerDownCapture={(event) => {
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
          restoreHistory(event.shiftKey ? 'redo' : 'undo');
          return;
        }
        if (modified && key === 'y') {
          event.preventDefault();
          restoreHistory('redo');
          return;
        }
        if (modified && key === 'c') {
          event.preventDefault();
          copySelectedItem();
          return;
        }
        if (modified && key === 'x') {
          event.preventDefault();
          if (selectedTrack?.locked) {
            setError(`Track '${selectedTrack.name}' is locked. Unlock it before cutting.`);
            return;
          }
          if (copySelectedItem()) deleteSelection();
          return;
        }
        if (modified && key === 'v') {
          event.preventDefault();
          pasteItem(clipboard, displayTime);
          return;
        }
        if (modified && key === 'd') {
          event.preventDefault();
          duplicateSelectedItem();
          return;
        }
        if (['BUTTON', 'SUMMARY'].includes(tag)) return;
        if (event.code === 'Space') {
          event.preventDefault();
          if (liveDirector && props.selectedEntity) {
            props.onPatchDirector(props.selectedEntity.entity, { playing: !transportPlaying });
          } else {
            setPlaying((value) => !value);
          }
          return;
        }
        if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
          event.preventDefault();
          deleteSelection();
        }
      }}
    >
      <div className="timeline-toolbar sequencer-toolbar">
        <div className="timeline-transport">
          <button type="button" className={transportPlaying ? 'active' : ''} title={transportPlaying ? 'Pause' : 'Play'} onClick={() => {
            if (liveDirector && props.selectedEntity) props.onPatchDirector(props.selectedEntity.entity, { playing: !transportPlaying });
            else setPlaying((value) => !value);
          }}>
            {transportPlaying ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button type="button" title="Stop" onClick={() => {
            if (liveDirector && props.selectedEntity) props.onPatchDirector(props.selectedEntity.entity, { playing: false, time: 0 });
            else { setPlaying(false); setTime(0); }
          }}><Square size={13} /></button>
        </div>
        <div className="sequencer-edit-controls">
          <button type="button" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={undoHistory.current.length === 0} onClick={() => restoreHistory('undo')}><Undo2 size={13} /></button>
          <button type="button" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={redoHistory.current.length === 0} onClick={() => restoreHistory('redo')}><Redo2 size={13} /></button>
          <button type="button" aria-label="Copy selected item" title="Copy selected item (Ctrl+C)" disabled={!selectedMarker && !selectedClip} onClick={() => copySelectedItem()}><Copy size={13} /></button>
          <button type="button" aria-label="Paste at playhead" title="Paste at playhead (Ctrl+V)" disabled={!clipboard} onClick={() => pasteItem(clipboard, displayTime)}><ClipboardPaste size={13} /></button>
        </div>
        <label className="timeline-time">Time <input type="number" min={0} max={asset.duration} step={1 / asset.frame_rate} value={Number(displayTime.toFixed(4))} onChange={(event) => {
          const next = snapTimelineAssetTime(Number(event.target.value), asset);
          scrub(next);
        }} /></label>
        <span className="timeline-clip-path" title={props.assetPath}>{asset.name} — {props.assetPath}{dirty ? ' *' : ''}</span>
        {liveDirector && <span className={`sequencer-live-status${liveDirector.playing ? ' playing' : ''}`}>{liveDirector.playing ? 'LIVE PLAYING' : 'LIVE PAUSED'} · {displayTime.toFixed(2)}s</span>}
        <div className="sequencer-zoom-controls">
          <button type="button" title="Zoom out" disabled={zoom <= SEQUENCER_MIN_ZOOM} onClick={() => changeZoom(zoom / 1.5)}><Minus size={13} /></button>
          <button type="button" title="Fit entire Timeline" disabled={zoom === 1} onClick={() => {
            setZoom(1);
            if (tracksViewport.current) tracksViewport.current.scrollLeft = 0;
          }}><Maximize2 size={12} /> Fit</button>
          <button type="button" title="Zoom in" disabled={zoom >= SEQUENCER_MAX_ZOOM} onClick={() => changeZoom(zoom * 1.5)}><Plus size={13} /></button>
          <span>{zoom.toFixed(zoom < 10 ? 1 : 0)}x</span>
        </div>
        <details className="sequencer-add-track">
          <summary><Plus size={14} /> Track</summary>
          <div>
            <button type="button" onClick={(event) => { addSignalTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Signal</button>
            <button type="button" onClick={(event) => { addActivationTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Activation</button>
            <button type="button" onClick={(event) => { addAudioTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Audio</button>
            <button type="button" onClick={(event) => { addAnimationTrack(); event.currentTarget.closest('details')?.removeAttribute('open'); }}>Animation</button>
          </div>
        </details>
        <button type="button" disabled={!selectedTrack || selectedTrack.locked} title={selectedTrack?.locked ? 'Unlock the track to add items' : undefined} onClick={() => selectedTrack && addTrackItem(selection!.track, displayTime)}>
          <Plus size={14} /> {selectedTrack?.type === 'signal' ? 'Signal' : 'Clip'}
        </button>
        <button type="button" className="timeline-icon-button" title="Bind selected entity" disabled={!props.selectedEntity} onClick={() => props.selectedEntity && props.onAssignDirector(props.selectedEntity.entity, props.assetPath!)}><Link size={14} /></button>
        <button type="button" className="timeline-icon-button" title={saving ? 'Saving' : 'Save Timeline'} disabled={!dirty || saving || payloadInvalid} onClick={() => void save()}><Save size={14} /></button>
        <button type="button" className="timeline-icon-button" title="Back to Animation Clip editor" onClick={props.onClose}><X size={14} /></button>
      </div>

      {error && <div className="timeline-message error">{error}</div>}
      <div className="sequencer-workspace">
        <div
          className="sequencer-tracks"
          ref={tracksViewport}
          style={{ '--sequencer-lane-width': `${laneWidth}px` } as CSSProperties}
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            changeZoom(zoom * (event.deltaY > 0 ? 0.8 : 1.25), event.clientX);
          }}
        >
          <div className="sequencer-ruler-row">
            <div className="sequencer-track-header">Tracks</div>
            <div className="sequencer-ruler" onPointerDown={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              scrub(snapTimelineAssetTime((event.clientX - bounds.left) / bounds.width * asset.duration, asset));
            }}>
              {ticks.map((tick) => <span key={tick.time} style={{ left: `${tick.position * 100}%` }}>{tick.time.toFixed(tick.time < 1 ? 2 : 1)}</span>)}
              <i className="sequencer-playhead" style={{ left: `${displayTime / asset.duration * 100}%` }} />
            </div>
          </div>
          {asset.tracks.map((track, trackIndex) => (
            <div className={`sequencer-track-row${selection?.track === trackIndex ? ' selected' : ''}${track.locked ? ' locked' : ''}`} key={track.id}>
              <button type="button" className="sequencer-track-header" onClick={() => setSelection({ track: trackIndex, marker: null })}>
                <span className={`sequencer-track-icon ${track.type}`}>{track.type === 'signal' ? 'S' : track.type === 'activation' ? 'A' : track.type === 'audio' ? '♪' : 'M'}</span>
                <span>{track.name}</span>
                {track.muted && <small>Muted</small>}
                {track.locked && <Lock className="sequencer-track-lock" size={11} aria-label="Locked" />}
              </button>
              <div className="sequencer-lane" onDoubleClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const markerTime = snapTimelineAssetTime((event.clientX - bounds.left) / bounds.width * asset.duration, asset);
                scrub(markerTime);
                addTrackItem(trackIndex, markerTime);
              }} onPointerDown={(event) => {
                if (event.target !== event.currentTarget) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                scrub(snapTimelineAssetTime((event.clientX - bounds.left) / bounds.width * asset.duration, asset));
                setSelection({ track: trackIndex, marker: null });
              }}>
                {ticks.map((tick) => <i className="sequencer-grid-line" key={tick.time} style={{ left: `${tick.position * 100}%` }} />)}
                {track.type === 'signal' && track.markers.map((marker, markerIndex) => (
                  <button
                    type="button"
                    className={`sequencer-marker${selection?.track === trackIndex && selection.marker === markerIndex ? ' selected' : ''}`}
                    style={{ left: `${marker.time / asset.duration * 100}%` }}
                    title={`${marker.name} @ ${marker.time.toFixed(3)}s`}
                    key={`${marker.name}-${markerIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, markerIndex)}
                  />
                ))}
                {track.type === 'activation' && track.clips.map((clip, clipIndex) => (
                  <button
                    type="button"
                    className={`sequencer-activation-clip${selection?.track === trackIndex && selection.marker === clipIndex ? ' selected' : ''}${clip.active ? ' active-state' : ' inactive-state'}`}
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
                    className={`sequencer-audio-clip${selection?.track === trackIndex && selection.marker === clipIndex ? ' selected' : ''}`}
                    style={{
                      left: `${clip.start / asset.duration * 100}%`,
                      width: `${clip.duration / asset.duration * 100}%`,
                    }}
                    title={`${clip.clip} · ${clip.start.toFixed(3)}s + ${clip.duration.toFixed(3)}s`}
                    key={`${clip.start}-${clip.clip}-${clipIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, clipIndex)}
                  >♪ {clip.clip.split('/').at(-1)}</button>
                ))}
                {track.type === 'animation' && track.clips.map((clip, clipIndex) => (
                  <button
                    type="button"
                    className={`sequencer-animation-clip${selection?.track === trackIndex && selection.marker === clipIndex ? ' selected' : ''}`}
                    style={{
                      left: `${clip.start / asset.duration * 100}%`,
                      width: `${clip.duration / asset.duration * 100}%`,
                    }}
                    title={`${clip.clip} · ${clip.start.toFixed(3)}s + ${clip.duration.toFixed(3)}s`}
                    key={`${clip.start}-${clip.clip}-${clipIndex}`}
                    onPointerDown={(event) => startMarkerDrag(event, trackIndex, clipIndex)}
                  >M {clip.clip.split('/').at(-1)}</button>
                ))}
                <i className="sequencer-playhead" style={{ left: `${displayTime / asset.duration * 100}%` }} />
              </div>
            </div>
          ))}
          {asset.tracks.length === 0 && <div className="sequencer-empty-track">Add a Signal, Activation, Audio, or Animation Track to begin authoring.</div>}
        </div>

        <aside className="sequencer-inspector" onFocusCapture={beginInspectorEdit} onBlurCapture={endInspectorEdit}>
          <h3>{selectedMarker ? 'Signal Marker' : selectedActivationClip ? 'Activation Clip' : selectedAudioClip ? 'Audio Clip' : selectedAnimationClip ? 'Animation Clip' : selectedTrack ? `${selectedTrack.type === 'signal' ? 'Signal' : selectedTrack.type === 'activation' ? 'Activation' : selectedTrack.type === 'audio' ? 'Audio' : 'Animation'} Track` : 'Timeline Asset'}</h3>
          {!selectedTrack && <>
            <label>Name <input value={asset.name} onChange={(event) => update((draft) => { draft.name = event.target.value; })} /></label>
            <label>Duration <input type="number" min={0.001} step={0.1} value={asset.duration} onChange={(event) => update((draft) => {
              const requested = Math.max(0.001, Number(event.target.value) || 0.001);
              const lockedEnd = lockedSequencerContentEnd(draft);
              draft.duration = Math.max(requested, lockedEnd);
              if (lockedEnd > requested) {
                setError(`Timeline duration cannot be shorter than locked content ending at ${lockedEnd.toFixed(3)}s.`);
              }
              for (const track of draft.tracks) {
                if (track.locked) continue;
                if (track.type === 'signal') {
                  for (const marker of track.markers) marker.time = Math.min(marker.time, draft.duration);
                } else {
                  const minimum = Math.min(1 / draft.frame_rate, draft.duration);
                  for (const clip of track.clips) {
                    clip.start = Math.min(clip.start, draft.duration - minimum);
                    clip.duration = Math.max(minimum, Math.min(clip.duration, draft.duration - clip.start));
                  }
                }
              }
            })} /></label>
            <label>Frame Rate <input type="number" min={1} max={240} step={1} value={asset.frame_rate} onChange={(event) => update((draft) => { draft.frame_rate = Math.max(1, Math.min(240, Number(event.target.value) || 1)); })} /></label>
          </>}
          {selectedTrack && !selectedMarker && !selectedClip && <>
            <label className="sequencer-check"><input type="checkbox" checked={selectedTrack.muted} onChange={(event) => update((draft) => { draft.tracks[selection!.track].muted = event.target.checked; })} /> Muted</label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedTrack.locked} onChange={(event) => update((draft) => { draft.tracks[selection!.track].locked = event.target.checked; })} /> Locked</label>
            {selectedTrack.locked && <p className="sequencer-lock-notice"><Lock size={12} /> Content editing is disabled for this track.</p>}
            <fieldset className="sequencer-inspector-fields" disabled={selectedTrack.locked}>
              <label>Name <input value={selectedTrack.name} onChange={(event) => update((draft) => { draft.tracks[selection!.track].name = event.target.value; })} /></label>
              {selectedTrack.type !== 'signal' && <label>Target (child path)<input value={selectedTrack.target} placeholder={selectedTrack.type === 'audio' ? 'Audio/Music' : selectedTrack.type === 'animation' ? 'Characters/Hero' : 'Canvas/Dialog'} onChange={(event) => update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type !== 'signal') track.target = event.target.value.replaceAll('\\', '/');
              })} /></label>}
              <div className="sequencer-track-order">
                <button type="button" disabled={selection!.track === 0} onClick={() => moveSelectedTrack(-1)}><ArrowUp size={13} /> Move Up</button>
                <button type="button" disabled={selection!.track === asset.tracks.length - 1} onClick={() => moveSelectedTrack(1)}><ArrowDown size={13} /> Move Down</button>
              </div>
              <button type="button" className="sequencer-danger" onClick={() => {
                update((draft) => { draft.tracks.splice(selection!.track, 1); });
                setSelection(null);
              }}><Trash2 size={14} /> Delete Track</button>
            </fieldset>
          </>}
          {selectedMarker && <fieldset className="sequencer-inspector-fields" disabled={selectedTrack?.locked}>
            {selectedTrack?.locked && <p className="sequencer-lock-notice"><Lock size={12} /> Unlock the track to edit this signal.</p>}
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
            <button type="button" className="sequencer-danger" onClick={() => {
              update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'signal') track.markers.splice(selection!.marker!, 1);
              });
              setPayloadInvalid(false);
              setSelection({ track: selection!.track, marker: null });
            }}><Trash2 size={14} /> Delete Signal</button>
          </fieldset>}
          {selectedClip && <fieldset className="sequencer-inspector-fields" disabled={selectedTrack?.locked}>
            {selectedTrack?.locked && <p className="sequencer-lock-notice"><Lock size={12} /> Unlock the track to edit this clip.</p>}
            <label>Start <input type="number" min={0} max={asset.duration - selectedClip.duration} step={1 / asset.frame_rate} value={selectedClip.start} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'signal') return;
              const clip = track.clips[selection!.marker!];
              const range = moveSequencerClip(
                track.clips,
                selection!.marker!,
                Number(event.target.value) - clip.start,
                draft.duration,
                draft.frame_rate,
              );
              clip.start = range.start;
            })} /></label>
            <label>Duration <input type="number" min={1 / asset.frame_rate} max={asset.duration - selectedClip.start} step={1 / asset.frame_rate} value={selectedClip.duration} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'signal') return;
              const clip = track.clips[selection!.marker!];
              const range = trimSequencerClip(
                track.clips,
                selection!.marker!,
                'end',
                Number(event.target.value) - clip.duration,
                draft.duration,
                draft.frame_rate,
              );
              clip.duration = range.duration;
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
            </>}
            <button type="button" className="sequencer-danger" onClick={() => {
              update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type !== 'signal') track.clips.splice(selection!.marker!, 1);
              });
              setSelection({ track: selection!.track, marker: null });
            }}><Trash2 size={14} /> Delete Clip</button>
          </fieldset>}
        </aside>
      </div>
    </div>
  );
}
