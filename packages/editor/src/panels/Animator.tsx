import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import { createAnimationClip, serializeAnimationClip } from '../animationClip';
import {
  animatorParameterValues,
  createAnimatorController,
  parseAnimatorController,
  parseAnimatorControllerDraft,
  setAnimatorParameterOverride,
  serializeAnimatorController,
  validateAnimatorController,
  type AnimatorConditionMode,
  type AnimatorController,
  type AnimatorLayerBlendMode,
  type AnimatorLayerTimingMode,
  type AnimatorParameterKind,
} from '../animatorController';
import { registerMenuItem } from '../editorWindow';
import {
  listProjectFiles,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerSaveAllParticipant } from '../saveAll';
import { AvatarMaskEditor } from './AvatarMask';
import { PROJECT_ASSETS_CHANGED_EVENT } from './Material';

export const OPEN_ANIMATOR_EVENT = 'mengine:open-animator';

export function openAnimatorAsset(path: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_ANIMATOR_EVENT, { detail: path }));
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'animator' }));
}

function uniquePath(extension: '.mcontroller' | '.manim', baseName: string): string {
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  let index = 1;
  let path = `Assets/Animations/${baseName}${extension}`;
  while (used.has(path.toLowerCase())) {
    index += 1;
    path = `Assets/Animations/${baseName} ${index}${extension}`;
  }
  return path;
}

export async function createProjectAnimatorController(): Promise<string> {
  await refreshProjectFiles();
  const controllerPath = uniquePath('.mcontroller', 'New Animator Controller');
  const clipPath = uniquePath('.manim', 'New State');
  const clipName = clipPath.split('/').pop()!.replace(/\.manim$/i, '');
  const controllerName = controllerPath.split('/').pop()!.replace(/\.mcontroller$/i, '');
  await writeProjectAssetText(clipPath, serializeAnimationClip(createAnimationClip(clipName)));
  await writeProjectAssetText(
    controllerPath,
    serializeAnimatorController(createAnimatorController(controllerName, clipPath)),
  );
  await refreshProjectFiles();
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
  openAnimatorAsset(controllerPath);
  return controllerPath;
}

registerMenuItem(
  'Assets/Create/Animator Controller',
  async (context) => {
    try {
      context.log(`Created ${await createProjectAnimatorController()}`);
    } catch (reason) {
      context.log(`Animator Controller 创建失败：${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 210 },
);

type SnapshotEntity = WorldSnapshotView['entities'][number];

type AnimatorRuntimeData = {
  controller?: string;
  playing?: boolean;
  parameters_json?: string;
  current_state?: string;
  state_time?: number;
  normalized_time?: number;
  transition_to?: string;
  transition_progress?: number;
};

function animatorRuntime(entity: SnapshotEntity | null): AnimatorRuntimeData | null {
  const value = entity?.components.Animator;
  return value != null && typeof value === 'object' ? value as AnimatorRuntimeData : null;
}

function AnimatorStateGraph(props: {
  controllerKey: string;
  controller: AnimatorController;
  runtime: AnimatorRuntimeData | null;
  selectedState: number | null;
  selectedTransition: number | null;
  onSelectState: (index: number) => void;
  onSelectTransition: (index: number) => void;
  onMoveState: (index: number, position: [number, number]) => void;
}) {
  const viewport = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{
    pointerId: number;
    state: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const graphWidth = Math.max(760, ...props.controller.states.map((state) => state.position[0] + 180));
  const graphHeight = Math.max(360, ...props.controller.states.map((state) => state.position[1] + 100));
  const nodeCenter = (name: string): [number, number] => {
    if (name === '*') return [72, 48];
    const state = props.controller.states.find((candidate) => candidate.name === name);
    return state ? [state.position[0] + 70, state.position[1] + 27] : [0, 0];
  };
  const edgePoint = (
    from: [number, number],
    to: [number, number],
    halfWidth: number,
    halfHeight: number,
  ): [number, number] => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight, 1);
    return [from[0] + dx * scale, from[1] + dy * scale];
  };
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const canvas = event.currentTarget.parentElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    props.onMoveState(active.state, [
      Math.max(0, Math.min(graphWidth - 140, event.clientX - rect.left - active.offsetX)),
      Math.max(0, Math.min(graphHeight - 54, event.clientY - rect.top - active.offsetY)),
    ]);
  };
  const stop = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  };
  const currentState = props.runtime?.current_state ?? '';
  const transitionTo = props.runtime?.transition_to ?? '';
  const progress = Math.max(0, Math.min(1, Number(props.runtime?.transition_progress) || 0));
  const focusedState = props.selectedState == null
    ? props.controller.states.find((state) => state.name === (currentState || props.controller.default_state))
    : props.controller.states[props.selectedState];
  useEffect(() => {
    const element = viewport.current;
    if (!element || !focusedState) return;
    const margin = 16;
    const left = focusedState.position[0];
    const right = left + 140;
    const top = focusedState.position[1];
    const bottom = top + 54;
    if (left < element.scrollLeft + margin) element.scrollLeft = Math.max(0, left - margin);
    else if (right > element.scrollLeft + element.clientWidth - margin) {
      element.scrollLeft = Math.max(0, right - element.clientWidth + margin);
    }
    if (top < element.scrollTop + margin) element.scrollTop = Math.max(0, top - margin);
    else if (bottom > element.scrollTop + element.clientHeight - margin) {
      element.scrollTop = Math.max(0, bottom - element.clientHeight + margin);
    }
  }, [props.controllerKey, props.selectedState, currentState]);
  return (
    <section className="animator-section animator-graph-section">
      <div className="animator-heading">
        <h3>State Machine</h3>
        {currentState && (
          <span className="animator-runtime-status">
            {currentState}{transitionTo ? ` -> ${transitionTo}` : ''}
            {' · '}{(Number(props.runtime?.normalized_time) || 0).toFixed(2)} normalized
          </span>
        )}
      </div>
      <div className="animator-graph-viewport" ref={viewport}>
        <div className="animator-graph-canvas" style={{ width: graphWidth, height: graphHeight }}>
          <svg width={graphWidth} height={graphHeight} aria-label="Animator state graph">
            <defs>
              <marker id="animator-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
              </marker>
            </defs>
            {props.controller.transitions.map((transition, index) => {
              const source = nodeCenter(transition.from);
              const destination = nodeCenter(transition.to);
              const [x1, y1] = edgePoint(
                source,
                destination,
                transition.from === '*' ? 60 : 70,
                27,
              );
              const [x2, y2] = edgePoint(destination, source, 70, 27);
              const active = transition.to === transitionTo
                && (transition.from === '*' || transition.from === currentState);
              return (
                <g key={index} className={`animator-graph-edge${props.selectedTransition === index ? ' selected' : ''}${active ? ' active' : ''}`}>
                  <line className="hit" x1={x1} y1={y1} x2={x2} y2={y2} onPointerDown={() => props.onSelectTransition(index)} />
                  <line x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#animator-arrow)" />
                </g>
              );
            })}
          </svg>
          {props.controller.transitions.some((transition) => transition.from === '*') && (
            <button type="button" className="animator-any-state" onClick={() => props.onSelectTransition(props.controller.transitions.findIndex((transition) => transition.from === '*'))}>
              Any State
            </button>
          )}
          {props.controller.states.map((state, index) => (
            <button
              type="button"
              key={`${index}:${state.name}`}
              className={`animator-graph-state${state.name === props.controller.default_state ? ' default' : ''}${state.name === currentState ? ' current' : ''}${props.selectedState === index ? ' selected' : ''}`}
              style={{ left: state.position[0], top: state.position[1] }}
              title={state.clip}
              onPointerDown={(event) => {
                const canvas = event.currentTarget.parentElement;
                if (!canvas) return;
                const rect = canvas.getBoundingClientRect();
                event.currentTarget.setPointerCapture(event.pointerId);
                drag.current = {
                  pointerId: event.pointerId,
                  state: index,
                  offsetX: event.clientX - rect.left - state.position[0],
                  offsetY: event.clientY - rect.top - state.position[1],
                };
                props.onSelectState(index);
              }}
              onPointerMove={move}
              onPointerUp={stop}
              onPointerCancel={stop}
              onDoubleClick={() => props.onSelectState(index)}
            >
              <strong>{state.name || '(Unnamed)'}</strong>
              <span>{state.clip.split('/').pop() || 'No clip'}</span>
            </button>
          ))}
          {transitionTo && <div className="animator-transition-progress"><i style={{ width: `${progress * 100}%` }} /></div>}
        </div>
      </div>
    </section>
  );
}

function nextName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base} ${index}`)) index += 1;
  return `${base} ${index}`;
}

function controllerFingerprint(controller: AnimatorController | null): string {
  return controller ? JSON.stringify(controller) : '';
}

function parameterModes(kind: AnimatorParameterKind): AnimatorConditionMode[] {
  if (kind === 'bool') return ['if', 'if_not'];
  if (kind === 'trigger') return ['trigger'];
  return ['greater', 'less', 'equals', 'not_equal'];
}

export type AnimatorEditorProps = {
  assetPath: string | null;
  selectedEntity: SnapshotEntity | null;
  playMode: boolean;
  onOpenAsset: (path: string) => void;
  onAssignAnimator: (entity: number, path: string) => void;
  onPatchAnimator: (entity: number, patch: Record<string, unknown>) => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
};

function AnimatorControllerEditor(props: AnimatorEditorProps) {
  const [controller, setController] = useState<AnimatorController | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedState, setSelectedState] = useState<number | null>(null);
  const [selectedTransition, setSelectedTransition] = useState<number | null>(null);
  const loadedPath = useRef<string | null>(null);
  const drafts = useRef(new Map<string, { controller: AnimatorController; savedFingerprint: string }>());

  useEffect(() => {
    let cancelled = false;
    const previousPath = loadedPath.current;
    if (previousPath && controller) {
      if (controllerFingerprint(controller) !== savedFingerprint) {
        drafts.current.set(previousPath, {
          controller: structuredClone(controller),
          savedFingerprint,
        });
      } else {
        drafts.current.delete(previousPath);
      }
    }
    loadedPath.current = props.assetPath;
    setController(null);
    setSavedFingerprint('');
    setError(null);
    setSelectedState(null);
    setSelectedTransition(null);
    if (!props.assetPath) return () => { cancelled = true; };
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      setController(structuredClone(draft.controller));
      setSavedFingerprint(draft.savedFingerprint);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const parsed = parseAnimatorControllerDraft(text);
        setController(parsed);
        setSavedFingerprint(controllerFingerprint(parsed));
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [props.assetPath]);

  const dirty = controllerFingerprint(controller) !== savedFingerprint && controller != null;
  const anyDirty = dirty || drafts.current.size > 0;
  useEffect(() => props.onDirtyChange(anyDirty), [anyDirty, props.onDirtyChange]);

  const clips = listProjectFiles().filter((asset) => asset.kind === 'animation');
  const avatarMasks = listProjectFiles().filter((asset) => asset.kind === 'avatar-mask');

  const update = (mutate: (draft: AnimatorController) => void) => {
    setController((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  const save = async (): Promise<boolean> => {
    if (!controller || !props.assetPath) return false;
    setSaving(true);
    setError(null);
    try {
      validateAnimatorController(controller);
      const text = serializeAnimatorController(controller);
      await writeProjectAssetText(props.assetPath, text);
      await refreshProjectFiles();
      const normalized = parseAnimatorController(text);
      drafts.current.delete(props.assetPath);
      setController(normalized);
      setSavedFingerprint(controllerFingerprint(normalized));
      props.onAssetsChanged();
      props.onLog(`Saved ${props.assetPath}`);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Animator Controller 保存失败：${message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    if (dirty && !await save()) throw new Error('Current Animator Controller could not be saved');
    const failures: string[] = [];
    if (drafts.current.size > 0) setSaving(true);
    try {
      for (const [path, draft] of [...drafts.current]) {
        try {
          validateAnimatorController(draft.controller);
          await writeProjectAssetText(path, serializeAnimatorController(draft.controller));
          drafts.current.delete(path);
          props.onLog(`Saved ${path}`);
        } catch (reason) {
          failures.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      if (drafts.current.size === 0) await refreshProjectFiles();
      props.onAssetsChanged();
    } finally {
      setSaving(false);
    }
    if (failures.length > 0) throw new Error(failures.join('; '));
  };

  useEffect(() => registerSaveAllParticipant('Animator Controllers', () => (
    anyDirty && !saving ? saveAll : null
  )), [anyDirty, controller, dirty, props.assetPath, savedFingerprint, saving]);

  const createNew = async () => {
    try {
      const path = await createProjectAnimatorController();
      props.onOpenAsset(path);
      props.onAssetsChanged();
      props.onLog(`Created ${path}`);
    } catch (reason) {
      props.onLog(`Animator Controller 创建失败：${reason instanceof Error ? reason.message : String(reason)}`, 'error');
    }
  };

  if (!props.assetPath || !controller) {
    return (
      <div className="material-empty">
        <strong>{loading ? 'Loading Animator Controller…' : 'Animator'}</strong>
        <span>{error ?? '双击 Project 中的 .mcontroller，或创建新的 Animator Controller。'}</span>
        <button type="button" onClick={() => void createNew()}>Create Controller</button>
      </div>
    );
  }

  const runtime = animatorRuntime(props.selectedEntity);
  const assigned = String(runtime?.controller ?? '') === props.assetPath;
  const parameterOverrides = String(runtime?.parameters_json ?? '{}');
  const instanceParameterValues = assigned
    ? animatorParameterValues(controller, parameterOverrides)
    : {};
  const patchAnimator = (patch: Record<string, unknown>) => {
    if (assigned && props.selectedEntity) {
      props.onPatchAnimator(props.selectedEntity.entity, patch);
    }
  };
  const setInstanceParameter = (name: string, value: unknown) => {
    patchAnimator({
      parameters_json: setAnimatorParameterOverride(controller, parameterOverrides, name, value),
    });
  };
  return (
    <div className="animator-editor">
      <div className="material-toolbar">
        <strong title={props.assetPath}>{controller.name || 'Animator Controller'}{dirty ? ' *' : ''}</strong>
        <span className="spacer" />
        <button type="button" onClick={() => void createNew()}>New</button>
        <button type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <div className="field-hint field-error">{error}</div>}
      <div className="animator-scroll">
        <section className="animator-section">
          <h3>Controller</h3>
          <label>Name <input value={controller.name} onChange={(event) => update((draft) => { draft.name = event.target.value; })} /></label>
          <label>Default State
            <select value={controller.default_state} onChange={(event) => update((draft) => { draft.default_state = event.target.value; })}>
              {controller.states.map((state) => <option key={state.name} value={state.name}>{state.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            disabled={!props.selectedEntity || assigned}
            onClick={() => props.selectedEntity && props.onAssignAnimator(props.selectedEntity.entity, props.assetPath!)}
          >
            {assigned ? 'Assigned to Selection' : 'Assign to Selection'}
          </button>
        </section>

        <section className="animator-section">
          <div className="animator-heading">
            <h3>Layers</h3>
            <button type="button" onClick={() => update((draft) => {
              draft.layers.push({
                name: nextName('Layer', new Set(draft.layers.map((layer) => layer.name))),
                enabled: true,
                weight: 1,
                blend_mode: 'override',
                timing_mode: 'synced',
                avatar_mask: '',
                mask_paths: [],
                motions: [],
                default_state: '',
                states: [],
                transitions: [],
              });
            })}>+ Layer</button>
          </div>
          <div className="animator-layer base">
            <strong>Base Layer</strong>
            <span>State Machine · Weight 1 · All targets</span>
          </div>
          {controller.layers.map((layer, layerIndex) => (
            <div className="animator-layer" key={`${layerIndex}:${layer.name}`}>
              <div className="animator-row">
                <input
                  aria-label={`${layer.name} enabled`}
                  type="checkbox"
                  checked={layer.enabled}
                  onChange={(event) => update((draft) => { draft.layers[layerIndex].enabled = event.target.checked; })}
                />
                <input
                  aria-label="Layer name"
                  value={layer.name}
                  onChange={(event) => update((draft) => { draft.layers[layerIndex].name = event.target.value; })}
                />
                <label>Weight <input type="number" min="0" max="1" step="0.05" value={layer.weight} onChange={(event) => update((draft) => { draft.layers[layerIndex].weight = Number(event.target.value); })} /></label>
                <select
                  aria-label={`${layer.name} blend mode`}
                  value={layer.blend_mode}
                  onChange={(event) => update((draft) => { draft.layers[layerIndex].blend_mode = event.target.value as AnimatorLayerBlendMode; })}
                >
                  <option value="override">Override</option>
                  <option value="additive">Additive</option>
                </select>
                <select
                  aria-label={`${layer.name} timing mode`}
                  value={layer.timing_mode}
                  onChange={(event) => update((draft) => {
                    const target = draft.layers[layerIndex];
                    target.timing_mode = event.target.value as AnimatorLayerTimingMode;
                    if (target.timing_mode === 'independent' && target.states.length === 0) {
                      const clip = clips[0]?.relPath ?? '';
                      target.states.push({ name: 'State', clip, speed: 1, position: [100, 90] });
                      target.default_state = 'State';
                    }
                  })}
                >
                  <option value="synced">Synced</option>
                  <option value="independent">Independent</option>
                </select>
                <button type="button" title="Delete layer" onClick={() => update((draft) => { draft.layers.splice(layerIndex, 1); })}>×</button>
              </div>
              <label className="animator-layer-mask">
                Avatar Mask Asset
                <select
                  value={layer.avatar_mask}
                  onChange={(event) => update((draft) => { draft.layers[layerIndex].avatar_mask = event.target.value; })}
                >
                  <option value="">None (inline paths only)</option>
                  {layer.avatar_mask && !avatarMasks.some((mask) => mask.relPath === layer.avatar_mask) && (
                    <option value={layer.avatar_mask}>{layer.avatar_mask} (Missing)</option>
                  )}
                  {avatarMasks.map((mask) => <option key={mask.id} value={mask.relPath}>{mask.name}</option>)}
                </select>
              </label>
              <label className="animator-layer-mask">
                Inline Mask Additions
                <input
                  placeholder={layer.avatar_mask
                    ? 'Additional paths (empty = no additions)'
                    : 'Rig/Spine, Rig/Head (empty = all)'}
                  value={layer.mask_paths.join(', ')}
                  onChange={(event) => update((draft) => {
                    draft.layers[layerIndex].mask_paths = event.target.value.split(',').map((path) => path.trim()).filter(Boolean);
                  })}
                />
              </label>
              {layer.timing_mode === 'synced' ? (
                <div className="animator-layer-motions">
                  {controller.states.map((state) => {
                    const motion = layer.motions.find((candidate) => candidate.state === state.name);
                    return (
                      <label key={state.name}>
                        <span>{state.name}</span>
                        <select value={motion?.clip ?? ''} onChange={(event) => update((draft) => {
                          const targetLayer = draft.layers[layerIndex];
                          const existing = targetLayer.motions.findIndex((candidate) => candidate.state === state.name);
                          if (!event.target.value) {
                            if (existing >= 0) targetLayer.motions.splice(existing, 1);
                          } else if (existing >= 0) {
                            targetLayer.motions[existing].clip = event.target.value;
                          } else {
                            targetLayer.motions.push({ state: state.name, clip: event.target.value });
                          }
                        })}>
                          <option value="">No Override</option>
                          {motion && !clips.some((clip) => clip.relPath === motion.clip) && (
                            <option value={motion.clip}>{motion.clip} (Missing)</option>
                          )}
                          {clips.map((clip) => <option key={clip.id} value={clip.relPath}>{clip.name}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="animator-independent-layer">
                  <div className="animator-heading">
                    <strong>Independent State Machine</strong>
                    <button type="button" onClick={() => update((draft) => {
                      const target = draft.layers[layerIndex];
                      const name = nextName('State', new Set(target.states.map((state) => state.name)));
                      target.states.push({ name, clip: clips[0]?.relPath ?? '', speed: 1, position: [100 + target.states.length * 170, 90] });
                      if (!target.default_state) target.default_state = name;
                    })}>+ State</button>
                    <button type="button" disabled={layer.states.length < 2} onClick={() => update((draft) => {
                      const target = draft.layers[layerIndex];
                      target.transitions.push({
                        from: target.states[0].name,
                        to: target.states[1].name,
                        duration: 0.15,
                        has_exit_time: false,
                        exit_time: 1,
                        conditions: [],
                      });
                    })}>+ Transition</button>
                  </div>
                  <label>Default State
                    <select value={layer.default_state} onChange={(event) => update((draft) => { draft.layers[layerIndex].default_state = event.target.value; })}>
                      {layer.states.map((state) => <option key={state.name} value={state.name}>{state.name}</option>)}
                    </select>
                  </label>
                  {layer.states.map((state, stateIndex) => (
                    <div className="animator-row" key={`${stateIndex}:${state.name}`}>
                      <input aria-label="Independent state name" value={state.name} onChange={(event) => update((draft) => {
                        const target = draft.layers[layerIndex];
                        const previous = target.states[stateIndex].name;
                        const next = event.target.value;
                        target.states[stateIndex].name = next;
                        if (target.default_state === previous) target.default_state = next;
                        for (const transition of target.transitions) {
                          if (transition.from === previous) transition.from = next;
                          if (transition.to === previous) transition.to = next;
                        }
                      })} />
                      <select value={state.clip} onChange={(event) => update((draft) => { draft.layers[layerIndex].states[stateIndex].clip = event.target.value; })}>
                        {state.clip && !clips.some((clip) => clip.relPath === state.clip) && <option value={state.clip}>{state.clip} (Missing)</option>}
                        <option value="">Select Animation Clip</option>
                        {clips.map((clip) => <option key={clip.id} value={clip.relPath}>{clip.name}</option>)}
                      </select>
                      <label>Speed <input type="number" step="0.1" value={state.speed} onChange={(event) => update((draft) => { draft.layers[layerIndex].states[stateIndex].speed = Number(event.target.value); })} /></label>
                      <button type="button" disabled={layer.states.length <= 1} title="Delete state" onClick={() => update((draft) => {
                        const target = draft.layers[layerIndex];
                        const removed = target.states[stateIndex].name;
                        target.states.splice(stateIndex, 1);
                        target.transitions = target.transitions.filter((transition) => transition.from !== removed && transition.to !== removed);
                        if (target.default_state === removed) target.default_state = target.states[0]?.name ?? '';
                      })}>×</button>
                    </div>
                  ))}
                  {layer.transitions.map((transition, transitionIndex) => (
                    <div className="animator-layer-transition" key={transitionIndex}>
                      <div className="animator-row">
                        <select aria-label="Independent transition source" value={transition.from} onChange={(event) => update((draft) => {
                          const target = draft.layers[layerIndex].transitions[transitionIndex];
                          target.from = event.target.value;
                          if (target.from === target.to) {
                            target.to = draft.layers[layerIndex].states.find((state) => state.name !== target.from)?.name ?? target.to;
                          }
                        })}>
                          <option value="*">Any State</option>
                          {layer.states.map((state) => <option key={state.name} value={state.name}>{state.name}</option>)}
                        </select>
                        <span>→</span>
                        <select aria-label="Independent transition destination" value={transition.to} onChange={(event) => update((draft) => { draft.layers[layerIndex].transitions[transitionIndex].to = event.target.value; })}>
                          {layer.states.filter((state) => state.name !== transition.from).map((state) => <option key={state.name} value={state.name}>{state.name}</option>)}
                        </select>
                        <label>Blend <input type="number" min="0" step="0.05" value={transition.duration} onChange={(event) => update((draft) => { draft.layers[layerIndex].transitions[transitionIndex].duration = Number(event.target.value); })} /></label>
                        <label><input type="checkbox" checked={transition.has_exit_time} onChange={(event) => update((draft) => { draft.layers[layerIndex].transitions[transitionIndex].has_exit_time = event.target.checked; })} /> Exit Time</label>
                        {transition.has_exit_time && <input aria-label="Independent transition exit time" type="number" min="0" step="0.05" value={transition.exit_time} onChange={(event) => update((draft) => { draft.layers[layerIndex].transitions[transitionIndex].exit_time = Number(event.target.value); })} />}
                        <button type="button" onClick={() => update((draft) => { draft.layers[layerIndex].transitions.splice(transitionIndex, 1); })}>×</button>
                      </div>
                      <div className="animator-row">
                        <button type="button" disabled={controller.parameters.length === 0} onClick={() => update((draft) => {
                          const parameter = draft.parameters[0];
                          if (!parameter) return;
                          draft.layers[layerIndex].transitions[transitionIndex].conditions.push({
                            parameter: parameter.name,
                            mode: parameterModes(parameter.kind)[0],
                            threshold: 0,
                          });
                        })}>+ Condition</button>
                      </div>
                      {transition.conditions.map((condition, conditionIndex) => {
                        const parameter = controller.parameters.find((item) => item.name === condition.parameter);
                        const modes = parameterModes(parameter?.kind ?? 'float');
                        return (
                          <div className="animator-row condition" key={conditionIndex}>
                            <select value={condition.parameter} onChange={(event) => update((draft) => {
                              const next = draft.parameters.find((item) => item.name === event.target.value)!;
                              const target = draft.layers[layerIndex].transitions[transitionIndex].conditions[conditionIndex];
                              target.parameter = next.name;
                              target.mode = parameterModes(next.kind)[0];
                            })}>{controller.parameters.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
                            <select value={condition.mode} onChange={(event) => update((draft) => { draft.layers[layerIndex].transitions[transitionIndex].conditions[conditionIndex].mode = event.target.value as AnimatorConditionMode; })}>{modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select>
                            {!['if', 'if_not', 'trigger'].includes(condition.mode) && <input type="number" step="0.1" value={condition.threshold} onChange={(event) => update((draft) => { draft.layers[layerIndex].transitions[transitionIndex].conditions[conditionIndex].threshold = Number(event.target.value); })} />}
                            <button type="button" onClick={() => update((draft) => { draft.layers[layerIndex].transitions[transitionIndex].conditions.splice(conditionIndex, 1); })}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="field-hint">Synced layers follow Base timing; Independent layers own their states and transitions while sharing Controller parameters. External and inline Avatar Mask paths are combined.</div>
        </section>

        {assigned && (
          <section className="animator-section animator-instance-section">
            <div className="animator-heading">
              <h3>{props.playMode ? 'Live Parameters' : 'Instance Parameters'}</h3>
              <span className={`animator-instance-mode${props.playMode ? ' live' : ''}`}>
                {props.playMode ? 'Play Mode' : 'Startup Values'}
              </span>
              <button type="button" onClick={() => patchAnimator({ parameters_json: '{}' })}>
                Reset
              </button>
            </div>
            <label className="animator-playing-toggle">
              <input
                type="checkbox"
                checked={runtime?.playing !== false}
                onChange={(event) => patchAnimator({ playing: event.target.checked })}
              />
              Playing
            </label>
            {controller.parameters.length === 0 && (
              <div className="field-hint">Add Controller parameters to drive transitions.</div>
            )}
            {controller.parameters.map((parameter) => {
              const value = instanceParameterValues[parameter.name];
              return (
                <div className="animator-instance-parameter" key={parameter.name}>
                  <span title={parameter.kind}>{parameter.name}</span>
                  <small>{parameter.kind}</small>
                  {parameter.kind === 'bool' && (
                    <input
                      aria-label={`${parameter.name} instance value`}
                      type="checkbox"
                      checked={value === true}
                      onChange={(event) => setInstanceParameter(parameter.name, event.target.checked)}
                    />
                  )}
                  {parameter.kind === 'trigger' && (
                    <button
                      type="button"
                      className={value === true ? 'active' : ''}
                      onClick={() => setInstanceParameter(parameter.name, true)}
                    >
                      {value === true ? 'Pending' : 'Set Trigger'}
                    </button>
                  )}
                  {(parameter.kind === 'float' || parameter.kind === 'int') && (
                    <input
                      aria-label={`${parameter.name} instance value`}
                      type="number"
                      step={parameter.kind === 'int' ? 1 : 0.1}
                      value={typeof value === 'number' ? value : 0}
                      onChange={(event) => {
                        if (Number.isFinite(event.target.valueAsNumber)) {
                          setInstanceParameter(parameter.name, event.target.valueAsNumber);
                        }
                      }}
                    />
                  )}
                </div>
              );
            })}
          </section>
        )}

        <AnimatorStateGraph
          controllerKey={props.assetPath}
          controller={controller}
          runtime={assigned ? runtime : null}
          selectedState={selectedState}
          selectedTransition={selectedTransition}
          onSelectState={(index) => {
            setSelectedState(index);
            setSelectedTransition(null);
          }}
          onSelectTransition={(index) => {
            setSelectedState(null);
            setSelectedTransition(index);
          }}
          onMoveState={(index, position) => update((draft) => {
            if (draft.states[index]) draft.states[index].position = position;
          })}
        />

        <section className="animator-section">
          <div className="animator-heading"><h3>Parameters</h3><button type="button" onClick={() => update((draft) => {
            const name = nextName('Parameter', new Set(draft.parameters.map((parameter) => parameter.name)));
            draft.parameters.push({ name, kind: 'bool', default_bool: false, default_float: 0, default_int: 0 });
          })}>+ Parameter</button></div>
          {controller.parameters.length === 0 && <div className="field-hint">No parameters.</div>}
          {controller.parameters.map((parameter, index) => (
            <div className="animator-row" key={`${index}-${parameter.name}`}>
              <input value={parameter.name} onChange={(event) => update((draft) => {
                const previous = draft.parameters[index].name;
                const next = event.target.value;
                draft.parameters[index].name = next;
                for (const transition of draft.transitions) {
                  for (const condition of transition.conditions) {
                    if (condition.parameter === previous) condition.parameter = next;
                  }
                }
                for (const layer of draft.layers) {
                  for (const transition of layer.transitions) {
                    for (const condition of transition.conditions) {
                      if (condition.parameter === previous) condition.parameter = next;
                    }
                  }
                }
              })} />
              <select value={parameter.kind} onChange={(event) => update((draft) => {
                const next = event.target.value as AnimatorParameterKind;
                draft.parameters[index].kind = next;
                for (const transition of draft.transitions) {
                  for (const condition of transition.conditions) {
                    if (condition.parameter === draft.parameters[index].name) {
                      condition.mode = parameterModes(next)[0];
                    }
                  }
                }
                for (const layer of draft.layers) {
                  for (const transition of layer.transitions) {
                    for (const condition of transition.conditions) {
                      if (condition.parameter === draft.parameters[index].name) {
                        condition.mode = parameterModes(next)[0];
                      }
                    }
                  }
                }
              })}>
                <option value="bool">Bool</option><option value="float">Float</option><option value="int">Int</option><option value="trigger">Trigger</option>
              </select>
              {parameter.kind === 'bool' && <input type="checkbox" checked={parameter.default_bool} onChange={(event) => update((draft) => { draft.parameters[index].default_bool = event.target.checked; })} />}
              {parameter.kind === 'float' && <input type="number" step="0.1" value={parameter.default_float} onChange={(event) => update((draft) => { draft.parameters[index].default_float = Number(event.target.value); })} />}
              {parameter.kind === 'int' && <input type="number" step="1" value={parameter.default_int} onChange={(event) => update((draft) => { draft.parameters[index].default_int = Number(event.target.value); })} />}
              <button type="button" title="Delete parameter" onClick={() => update((draft) => {
                const name = draft.parameters[index].name;
                draft.parameters.splice(index, 1);
                for (const transition of draft.transitions) transition.conditions = transition.conditions.filter((condition) => condition.parameter !== name);
                for (const layer of draft.layers) {
                  for (const transition of layer.transitions) {
                    transition.conditions = transition.conditions.filter((condition) => condition.parameter !== name);
                  }
                }
              })}>×</button>
            </div>
          ))}
        </section>

        <section className="animator-section">
          <div className="animator-heading"><h3>States</h3><button type="button" onClick={() => {
            const index = controller.states.length;
            update((draft) => {
              const name = nextName('New State', new Set(draft.states.map((state) => state.name)));
              draft.states.push({
                name,
                clip: clips[0]?.relPath ?? '',
                speed: 1,
                position: [100 + index % 4 * 170, 90 + Math.floor(index / 4) * 100],
              });
            });
            setSelectedState(index);
            setSelectedTransition(null);
          }}>+ State</button></div>
          {controller.states.map((state, index) => (
            <div
              className={`animator-state${state.name === controller.default_state ? ' default' : ''}${selectedState === index ? ' selected' : ''}`}
              key={`${index}-${state.name}`}
              onClick={() => {
                setSelectedState(index);
                setSelectedTransition(null);
              }}
            >
              <input value={state.name} onChange={(event) => update((draft) => {
                const previous = draft.states[index].name;
                const next = event.target.value;
                draft.states[index].name = next;
                if (draft.default_state === previous) draft.default_state = next;
                for (const transition of draft.transitions) {
                  if (transition.from === previous) transition.from = next;
                  if (transition.to === previous) transition.to = next;
                }
                for (const layer of draft.layers) {
                  for (const motion of layer.motions) {
                    if (motion.state === previous) motion.state = next;
                  }
                }
              })} />
              <select value={state.clip} onChange={(event) => update((draft) => { draft.states[index].clip = event.target.value; })}>
                {!clips.some((clip) => clip.relPath === state.clip) && <option value={state.clip}>{state.clip || 'Select Clip…'}</option>}
                {clips.map((clip) => <option key={clip.id} value={clip.relPath}>{clip.name}</option>)}
              </select>
              <label>Speed <input type="number" step="0.1" value={state.speed} onChange={(event) => update((draft) => { draft.states[index].speed = Number(event.target.value); })} /></label>
              {assigned && props.selectedEntity && (
                <button
                  type="button"
                  title={props.playMode ? 'Play this state now' : 'Use this state when play starts'}
                  onClick={(event) => {
                    event.stopPropagation();
                    patchAnimator({
                      playing: true,
                      current_state: state.name,
                      state_time: 0,
                      normalized_time: 0,
                      transition_to: '',
                      transition_progress: 0,
                    });
                  }}
                >
                  {props.playMode ? 'Play' : 'Start'}
                </button>
              )}
              <button type="button" disabled={controller.states.length <= 1} onClick={(event) => {
                event.stopPropagation();
                update((draft) => {
                  const removed = draft.states[index].name;
                  draft.states.splice(index, 1);
                  draft.transitions = draft.transitions.filter((transition) => transition.from !== removed && transition.to !== removed);
                  for (const layer of draft.layers) {
                    layer.motions = layer.motions.filter((motion) => motion.state !== removed);
                  }
                  if (draft.default_state === removed) draft.default_state = draft.states[0].name;
                });
                setSelectedState((selected) => selected == null || selected === index
                  ? null
                  : selected > index ? selected - 1 : selected);
                setSelectedTransition(null);
              }}>×</button>
            </div>
          ))}
        </section>

        <section className="animator-section">
          <div className="animator-heading"><h3>Transitions</h3><button type="button" disabled={controller.states.length < 2} onClick={() => {
            const index = controller.transitions.length;
            update((draft) => {
              const from = selectedState != null ? draft.states[selectedState] : draft.states[0];
              const to = draft.states.find((state) => state.name !== from?.name);
              if (!from || !to) return;
              draft.transitions.push({ from: from.name, to: to.name, duration: 0.15, has_exit_time: false, exit_time: 1, conditions: [] });
            });
            setSelectedState(null);
            setSelectedTransition(index);
          }}>+ Transition</button></div>
          {controller.transitions.length === 0 && <div className="field-hint">No transitions.</div>}
          {controller.transitions.map((transition, transitionIndex) => (
            <div
              className={`animator-transition${selectedTransition === transitionIndex ? ' selected' : ''}`}
              key={transitionIndex}
              onClick={() => {
                setSelectedState(null);
                setSelectedTransition(transitionIndex);
              }}
            >
              <div className="animator-row">
                <select value={transition.from} onChange={(event) => update((draft) => {
                  const target = draft.transitions[transitionIndex];
                  target.from = event.target.value;
                  if (target.to === target.from) {
                    target.to = draft.states.find((state) => state.name !== target.from)?.name ?? target.to;
                  }
                })}>
                  <option value="*">Any State</option>{controller.states.map((state) => <option key={state.name} value={state.name}>{state.name}</option>)}
                </select>
                <span>→</span>
                <select value={transition.to} onChange={(event) => update((draft) => { draft.transitions[transitionIndex].to = event.target.value; })}>
                  {controller.states.filter((state) => state.name !== transition.from).map((state) => <option key={state.name} value={state.name}>{state.name}</option>)}
                </select>
                <label>Blend <input type="number" min="0" step="0.05" value={transition.duration} onChange={(event) => update((draft) => { draft.transitions[transitionIndex].duration = Number(event.target.value); })} /></label>
                <button type="button" title="Higher priority" disabled={transitionIndex === 0} onClick={(event) => {
                  event.stopPropagation();
                  update((draft) => {
                    [draft.transitions[transitionIndex - 1], draft.transitions[transitionIndex]] = [draft.transitions[transitionIndex], draft.transitions[transitionIndex - 1]];
                  });
                  setSelectedTransition(transitionIndex - 1);
                }}>↑</button>
                <button type="button" title="Lower priority" disabled={transitionIndex === controller.transitions.length - 1} onClick={(event) => {
                  event.stopPropagation();
                  update((draft) => {
                    [draft.transitions[transitionIndex], draft.transitions[transitionIndex + 1]] = [draft.transitions[transitionIndex + 1], draft.transitions[transitionIndex]];
                  });
                  setSelectedTransition(transitionIndex + 1);
                }}>↓</button>
                <button type="button" onClick={(event) => {
                  event.stopPropagation();
                  update((draft) => { draft.transitions.splice(transitionIndex, 1); });
                  setSelectedTransition((selected) => selected == null || selected === transitionIndex
                    ? null
                    : selected > transitionIndex ? selected - 1 : selected);
                }}>×</button>
              </div>
              <div className="animator-row">
                <label><input type="checkbox" checked={transition.has_exit_time} onChange={(event) => update((draft) => { draft.transitions[transitionIndex].has_exit_time = event.target.checked; })} /> Exit Time</label>
                {transition.has_exit_time && <input type="number" min="0" step="0.05" value={transition.exit_time} onChange={(event) => update((draft) => { draft.transitions[transitionIndex].exit_time = Number(event.target.value); })} />}
                <button type="button" disabled={controller.parameters.length === 0} onClick={() => update((draft) => {
                  const parameter = draft.parameters[0];
                  if (!parameter) return;
                  draft.transitions[transitionIndex].conditions.push({ parameter: parameter.name, mode: parameterModes(parameter.kind)[0], threshold: 0 });
                })}>+ Condition</button>
              </div>
              {transition.conditions.map((condition, conditionIndex) => {
                const parameter = controller.parameters.find((item) => item.name === condition.parameter);
                const modes = parameterModes(parameter?.kind ?? 'float');
                return <div className="animator-row condition" key={conditionIndex}>
                  <select value={condition.parameter} onChange={(event) => update((draft) => {
                    const next = draft.parameters.find((item) => item.name === event.target.value)!;
                    const target = draft.transitions[transitionIndex].conditions[conditionIndex];
                    target.parameter = next.name;
                    target.mode = parameterModes(next.kind)[0];
                  })}>{controller.parameters.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
                  <select value={condition.mode} onChange={(event) => update((draft) => { draft.transitions[transitionIndex].conditions[conditionIndex].mode = event.target.value as AnimatorConditionMode; })}>{modes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select>
                  {!['if', 'if_not', 'trigger'].includes(condition.mode) && <input type="number" step="0.1" value={condition.threshold} onChange={(event) => update((draft) => { draft.transitions[transitionIndex].conditions[conditionIndex].threshold = Number(event.target.value); })} />}
                  <button type="button" onClick={() => update((draft) => { draft.transitions[transitionIndex].conditions.splice(conditionIndex, 1); })}>×</button>
                </div>;
              })}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

export function AnimatorEditor(props: AnimatorEditorProps) {
  const [controllerDirty, setControllerDirty] = useState(false);
  const [avatarMaskDirty, setAvatarMaskDirty] = useState(false);
  const avatarMaskOpen = props.assetPath?.toLowerCase().endsWith('.mavatar') === true;

  useEffect(() => {
    props.onDirtyChange(controllerDirty || avatarMaskDirty);
  }, [avatarMaskDirty, controllerDirty, props.onDirtyChange]);

  return (
    <>
      <div style={{ display: avatarMaskOpen ? 'none' : 'contents' }}>
        <AnimatorControllerEditor
          {...props}
          assetPath={avatarMaskOpen ? null : props.assetPath}
          onDirtyChange={setControllerDirty}
        />
      </div>
      <div style={{ display: avatarMaskOpen ? 'contents' : 'none' }}>
        <AvatarMaskEditor
          assetPath={avatarMaskOpen ? props.assetPath : null}
          onOpenAsset={props.onOpenAsset}
          onAssetsChanged={props.onAssetsChanged}
          onDirtyChange={setAvatarMaskDirty}
          onLog={props.onLog}
        />
      </div>
    </>
  );
}
