import { useEffect, useRef, useState } from 'react';
import type { WorldSnapshotView } from '@mengine/api';
import { createAnimationClip, serializeAnimationClip } from '../animationClip';
import {
  createAnimatorController,
  parseAnimatorController,
  parseAnimatorControllerDraft,
  serializeAnimatorController,
  validateAnimatorController,
  type AnimatorConditionMode,
  type AnimatorController,
  type AnimatorParameterKind,
} from '../animatorController';
import { registerMenuItem } from '../editorWindow';
import {
  listProjectFiles,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
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

export function AnimatorEditor(props: {
  assetPath: string | null;
  selectedEntity: SnapshotEntity | null;
  onOpenAsset: (path: string) => void;
  onAssignAnimator: (entity: number, path: string) => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const [controller, setController] = useState<AnimatorController | null>(null);
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
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

  const update = (mutate: (draft: AnimatorController) => void) => {
    setController((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };

  const save = async () => {
    if (!controller || !props.assetPath) return;
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
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Animator Controller 保存失败：${message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

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

  const assigned = String((props.selectedEntity?.components.Animator as Record<string, unknown> | undefined)?.controller ?? '') === props.assetPath;
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
              })}>×</button>
            </div>
          ))}
        </section>

        <section className="animator-section">
          <div className="animator-heading"><h3>States</h3><button type="button" onClick={() => update((draft) => {
            const name = nextName('New State', new Set(draft.states.map((state) => state.name)));
            draft.states.push({ name, clip: clips[0]?.relPath ?? '', speed: 1 });
          })}>+ State</button></div>
          {controller.states.map((state, index) => (
            <div className={`animator-state${state.name === controller.default_state ? ' default' : ''}`} key={`${index}-${state.name}`}>
              <input value={state.name} onChange={(event) => update((draft) => {
                const previous = draft.states[index].name;
                const next = event.target.value;
                draft.states[index].name = next;
                if (draft.default_state === previous) draft.default_state = next;
                for (const transition of draft.transitions) {
                  if (transition.from === previous) transition.from = next;
                  if (transition.to === previous) transition.to = next;
                }
              })} />
              <select value={state.clip} onChange={(event) => update((draft) => { draft.states[index].clip = event.target.value; })}>
                {!clips.some((clip) => clip.relPath === state.clip) && <option value={state.clip}>{state.clip || 'Select Clip…'}</option>}
                {clips.map((clip) => <option key={clip.id} value={clip.relPath}>{clip.name}</option>)}
              </select>
              <label>Speed <input type="number" step="0.1" value={state.speed} onChange={(event) => update((draft) => { draft.states[index].speed = Number(event.target.value); })} /></label>
              <button type="button" disabled={controller.states.length <= 1} onClick={() => update((draft) => {
                const removed = draft.states[index].name;
                draft.states.splice(index, 1);
                draft.transitions = draft.transitions.filter((transition) => transition.from !== removed && transition.to !== removed);
                if (draft.default_state === removed) draft.default_state = draft.states[0].name;
              })}>×</button>
            </div>
          ))}
        </section>

        <section className="animator-section">
          <div className="animator-heading"><h3>Transitions</h3><button type="button" disabled={controller.states.length < 2} onClick={() => update((draft) => {
            draft.transitions.push({ from: draft.states[0].name, to: draft.states[1].name, duration: 0.15, has_exit_time: false, exit_time: 1, conditions: [] });
          })}>+ Transition</button></div>
          {controller.transitions.length === 0 && <div className="field-hint">No transitions.</div>}
          {controller.transitions.map((transition, transitionIndex) => (
            <div className="animator-transition" key={transitionIndex}>
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
                <button type="button" title="Higher priority" disabled={transitionIndex === 0} onClick={() => update((draft) => {
                  [draft.transitions[transitionIndex - 1], draft.transitions[transitionIndex]] = [draft.transitions[transitionIndex], draft.transitions[transitionIndex - 1]];
                })}>↑</button>
                <button type="button" title="Lower priority" disabled={transitionIndex === controller.transitions.length - 1} onClick={() => update((draft) => {
                  [draft.transitions[transitionIndex], draft.transitions[transitionIndex + 1]] = [draft.transitions[transitionIndex + 1], draft.transitions[transitionIndex]];
                })}>↓</button>
                <button type="button" onClick={() => update((draft) => { draft.transitions.splice(transitionIndex, 1); })}>×</button>
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
