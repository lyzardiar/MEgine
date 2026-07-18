import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import { Link, Pause, Play, Plus, Save, Square, Trash2, X } from 'lucide-react';
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
type Draft = { asset: TimelineAsset; savedText: string; time: number; selection: Selection };

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
  const loadedPath = useRef('');
  const drafts = useRef(new Map<string, Draft>());
  const frame = useRef<number | null>(null);
  const previousFrame = useRef<number | null>(null);

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
    setSelection(null);
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

  const update = (mutate: (draft: TimelineAsset) => void) => {
    setAsset((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
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

  const addSignalTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `signals-${index}`;
    while (used.has(id)) id = `signals-${++index}`;
    update((draft) => draft.tracks.push({ type: 'signal', id, name: `Signal Track ${index}`, muted: false, markers: [] }));
    setSelection({ track: asset.tracks.length, marker: null });
  };

  const addActivationTrack = () => {
    if (!asset) return;
    const used = new Set(asset.tracks.map((track) => track.id));
    let index = asset.tracks.length + 1;
    let id = `activation-${index}`;
    while (used.has(id)) id = `activation-${++index}`;
    update((draft) => draft.tracks.push({
      type: 'activation', id, name: `Activation Track ${index}`, muted: false, target: 'Child', clips: [],
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
    const minimum = Math.min(1 / asset.frame_rate, asset.duration);
    const start = Math.min(snapTimelineAssetTime(requestedTime, asset), asset.duration - minimum);
    const duration = Math.min(1, asset.duration - start);
    const track = asset.tracks[trackIndex];
    update((draft) => {
      const target = draft.tracks[trackIndex];
      if (target.type === 'activation') target.clips.push({ start, duration, active: true });
    });
    setSelection({ track: trackIndex, marker: track.type === 'activation' ? track.clips.length : null });
  };

  const addTrackItem = (trackIndex: number, requestedTime: number) => {
    const track = asset?.tracks[trackIndex];
    if (track?.type === 'signal') addMarker(trackIndex, requestedTime);
    else if (track?.type === 'activation') addActivationClip(trackIndex, requestedTime);
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
    const pointer = event.pointerId;
    event.currentTarget.setPointerCapture(pointer);
    setSelection({ track: trackIndex, marker: markerIndex });
    const move = (moveEvent: PointerEvent) => {
      const position = Math.max(0, Math.min(1, (moveEvent.clientX - bounds.left) / Math.max(1, bounds.width)));
      update((draft) => {
        const track = draft.tracks[trackIndex];
        if (track.type === 'signal') {
          track.markers[markerIndex].time = snapTimelineAssetTime(position * draft.duration, draft);
        } else {
          const clip = track.clips[markerIndex];
          clip.start = Math.min(
            snapTimelineAssetTime(position * draft.duration, draft),
            draft.duration - clip.duration,
          );
        }
      });
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
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
  const selectedClip = selection?.marker != null && selectedTrack?.type === 'activation'
    ? selectedTrack.clips[selection.marker]
    : null;
  const tickCount = Math.min(21, Math.max(2, Math.ceil(asset.duration) + 1));
  const ticks = Array.from({ length: tickCount }, (_, index) => index / (tickCount - 1));
  const transportPlaying = liveDirector ? Boolean(liveDirector.playing) : playing;
  const scrub = (next: number) => {
    if (liveDirector && props.selectedEntity) props.onPatchDirector(props.selectedEntity.entity, { time: next });
    else setTime(next);
  };

  return (
    <div className="timeline-panel sequencer-panel">
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
        <label className="timeline-time">Time <input type="number" min={0} max={asset.duration} step={1 / asset.frame_rate} value={Number(displayTime.toFixed(4))} onChange={(event) => {
          const next = snapTimelineAssetTime(Number(event.target.value), asset);
          scrub(next);
        }} /></label>
        <span className="timeline-clip-path" title={props.assetPath}>{asset.name} — {props.assetPath}{dirty ? ' *' : ''}</span>
        {liveDirector && <span className={`sequencer-live-status${liveDirector.playing ? ' playing' : ''}`}>{liveDirector.playing ? 'LIVE PLAYING' : 'LIVE PAUSED'} · {displayTime.toFixed(2)}s</span>}
        <button type="button" onClick={addSignalTrack}><Plus size={14} /> Signal Track</button>
        <button type="button" onClick={addActivationTrack}><Plus size={14} /> Activation Track</button>
        <button type="button" disabled={!selectedTrack} onClick={() => selectedTrack && addTrackItem(selection!.track, displayTime)}>
          <Plus size={14} /> {selectedTrack?.type === 'activation' ? 'Activation Clip' : 'Signal'}
        </button>
        <button type="button" disabled={!props.selectedEntity} onClick={() => props.selectedEntity && props.onAssignDirector(props.selectedEntity.entity, props.assetPath!)}><Link size={14} /> Bind</button>
        <button type="button" disabled={!dirty || saving || payloadInvalid} onClick={() => void save()}><Save size={14} /> {saving ? 'Saving…' : 'Save'}</button>
        <button type="button" title="Back to Animation Clip editor" onClick={props.onClose}><X size={14} /></button>
      </div>

      {error && <div className="timeline-message error">{error}</div>}
      <div className="sequencer-workspace">
        <div className="sequencer-tracks">
          <div className="sequencer-ruler-row">
            <div className="sequencer-track-header">Tracks</div>
            <div className="sequencer-ruler" onPointerDown={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              scrub(snapTimelineAssetTime((event.clientX - bounds.left) / bounds.width * asset.duration, asset));
            }}>
              {ticks.map((position) => <span key={position} style={{ left: `${position * 100}%` }}>{(position * asset.duration).toFixed(1)}</span>)}
              <i className="sequencer-playhead" style={{ left: `${displayTime / asset.duration * 100}%` }} />
            </div>
          </div>
          {asset.tracks.map((track, trackIndex) => (
            <div className={`sequencer-track-row${selection?.track === trackIndex ? ' selected' : ''}`} key={track.id}>
              <button type="button" className="sequencer-track-header" onClick={() => setSelection({ track: trackIndex, marker: null })}>
                <span className={`sequencer-track-icon ${track.type}`}>{track.type === 'signal' ? 'S' : 'A'}</span>
                <span>{track.name}</span>
                {track.muted && <small>Muted</small>}
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
                {ticks.map((position) => <i className="sequencer-grid-line" key={position} style={{ left: `${position * 100}%` }} />)}
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
                <i className="sequencer-playhead" style={{ left: `${displayTime / asset.duration * 100}%` }} />
              </div>
            </div>
          ))}
          {asset.tracks.length === 0 && <div className="sequencer-empty-track">Add a Signal or Activation Track to begin authoring.</div>}
        </div>

        <aside className="sequencer-inspector">
          <h3>{selectedMarker ? 'Signal Marker' : selectedClip ? 'Activation Clip' : selectedTrack ? `${selectedTrack.type === 'signal' ? 'Signal' : 'Activation'} Track` : 'Timeline Asset'}</h3>
          {!selectedTrack && <>
            <label>Name <input value={asset.name} onChange={(event) => update((draft) => { draft.name = event.target.value; })} /></label>
            <label>Duration <input type="number" min={0.001} step={0.1} value={asset.duration} onChange={(event) => update((draft) => {
              draft.duration = Math.max(0.001, Number(event.target.value) || 0.001);
              for (const track of draft.tracks) {
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
            <label>Name <input value={selectedTrack.name} onChange={(event) => update((draft) => { draft.tracks[selection!.track].name = event.target.value; })} /></label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedTrack.muted} onChange={(event) => update((draft) => { draft.tracks[selection!.track].muted = event.target.checked; })} /> Muted</label>
            {selectedTrack.type === 'activation' && <label>Target (child path)<input value={selectedTrack.target} placeholder="Canvas/Dialog" onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'activation') track.target = event.target.value.replaceAll('\\', '/');
            })} /></label>}
            <button type="button" className="sequencer-danger" onClick={() => {
              update((draft) => { draft.tracks.splice(selection!.track, 1); });
              setSelection(null);
            }}><Trash2 size={14} /> Delete Track</button>
          </>}
          {selectedMarker && <>
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
          </>}
          {selectedClip && <>
            <label>Start <input type="number" min={0} max={asset.duration - selectedClip.duration} step={1 / asset.frame_rate} value={selectedClip.start} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type !== 'activation') return;
              const clip = track.clips[selection!.marker!];
              clip.start = Math.min(snapTimelineAssetTime(Number(event.target.value), draft), draft.duration - clip.duration);
            })} /></label>
            <label>Duration <input type="number" min={1 / asset.frame_rate} max={asset.duration - selectedClip.start} step={1 / asset.frame_rate} value={selectedClip.duration} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type !== 'activation') return;
              const clip = track.clips[selection!.marker!];
              clip.duration = Math.max(1 / draft.frame_rate, Math.min(Number(event.target.value) || 0, draft.duration - clip.start));
            })} /></label>
            <label className="sequencer-check"><input type="checkbox" checked={selectedClip.active} onChange={(event) => update((draft) => {
              const track = draft.tracks[selection!.track];
              if (track.type === 'activation') track.clips[selection!.marker!].active = event.target.checked;
            })} /> Target active inside clip</label>
            <button type="button" className="sequencer-danger" onClick={() => {
              update((draft) => {
                const track = draft.tracks[selection!.track];
                if (track.type === 'activation') track.clips.splice(selection!.marker!, 1);
              });
              setSelection({ track: selection!.track, marker: null });
            }}><Trash2 size={14} /> Delete Clip</button>
          </>}
        </aside>
      </div>
    </div>
  );
}
