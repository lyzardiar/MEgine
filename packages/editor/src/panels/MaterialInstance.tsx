import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent as ReactFocusEvent,
} from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import {
  createMaterialAsset,
  parseMaterialAsset,
  serializeMaterialAsset,
  type MaterialAsset,
} from '../materialAsset';
import {
  applyMaterialInstance,
  createMaterialInstanceAsset,
  loadResolvedMaterialAsset,
  normalizeMaterialInstanceAsset,
  parseMaterialInstanceAsset,
  serializeMaterialInstanceAsset,
  type MaterialInstanceAsset,
  type MaterialInstanceOverrideField,
} from '../materialInstanceAsset';
import {
  listProjectFiles,
  normalizeProjectAssetPath,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import { registerSaveAllParticipant } from '../saveAll';
import type {
  EditorUndoCheckpoint,
  EditorUndoToken,
} from '../editorUndoService';
import {
  broadcastProjectAssetsChanged,
  openMaterialAsset,
  PROJECT_ASSETS_CHANGED_EVENT,
} from '../assetEditorEvents';
import type { MaterialEditorProps } from './Material';
import {
  normalizeSurfaceShaderParameterValue,
  parseSurfaceShaderKeywords,
  parseSurfaceShaderParameters,
  surfaceShaderParameterComponents,
  validateSurfaceShaderKeywordValues,
  validateSurfaceShaderParameterValues,
  type SurfaceShaderKeyword,
  type SurfaceShaderParameter,
} from '../surfaceShader';

type InstanceDraft = { instance: MaterialInstanceAsset; savedText: string };

function uniqueAssetPath(extension: 'mmat' | 'minst', baseName: string): string {
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  let index = 1;
  let path = `Assets/Materials/${baseName}.${extension}`;
  while (used.has(path.toLowerCase())) {
    index += 1;
    path = `Assets/Materials/${baseName} ${index}.${extension}`;
  }
  return path;
}

export async function createProjectMaterialInstance(preferredParent?: string): Promise<string> {
  await refreshProjectFiles();
  let parent = preferredParent?.trim() ?? '';
  if (parent) {
    parent = normalizeProjectAssetPath(parent);
    if (!/\.(?:mmat|mat|minst)$/i.test(parent)) parent = '';
  }
  if (!parent) {
    parent = listProjectFiles().find(
      (asset) => asset.kind === 'material' && /\.(?:mmat|mat)$/i.test(asset.relPath),
    )?.relPath ?? '';
  }
  if (!parent) {
    parent = uniqueAssetPath('mmat', 'New Material');
    const baseName = parent.split('/').pop()!.replace(/\.mmat$/i, '');
    await writeProjectAssetText(parent, serializeMaterialAsset(createMaterialAsset(baseName)));
    await refreshProjectFiles();
  }
  const path = uniqueAssetPath('minst', 'New Material Instance');
  const name = path.split('/').pop()!.replace(/\.minst$/i, '');
  await writeProjectAssetText(
    path,
    serializeMaterialInstanceAsset(createMaterialInstanceAsset(name, parent)),
  );
  await refreshProjectFiles();
  broadcastProjectAssetsChanged({ action: 'created', destinationPath: path });
  openMaterialAsset(path);
  return path;
}

function byteHex(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, '0');
}

function colorHex(value: readonly number[]): string {
  return `#${byteHex(value[0] ?? 0)}${byteHex(value[1] ?? 0)}${byteHex(value[2] ?? 0)}`;
}

function parseHex(hex: string): [number, number, number] {
  const normalized = hex.replace(/^#/, '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  ];
}

function assetName(path: string): string {
  return path.split('/').pop()?.replace(/\.minst$/i, '') ?? 'Material Instance';
}

function instanceDraftDirty(draft: InstanceDraft): boolean {
  return serializeMaterialInstanceAsset(draft.instance) !== draft.savedText;
}

function isEditControl(target: EventTarget): target is HTMLInputElement | HTMLSelectElement {
  if (target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
}

function fieldLabel(field: MaterialInstanceOverrideField): string {
  switch (field) {
    case 'base_color': return 'Base Color';
    case 'ior': return 'Index Of Refraction';
    case 'clearcoat': return 'Clear Coat';
    case 'clearcoat_roughness': return 'Coat Roughness';
    case 'emissive': return 'Emission';
    case 'emissive_strength': return 'Emission Strength';
    default: return `${field[0].toUpperCase()}${field.slice(1)}`;
  }
}

export function MaterialInstanceEditor(props: MaterialEditorProps) {
  const [instance, setInstance] = useState<MaterialInstanceAsset | null>(null);
  const [savedText, setSavedText] = useState('');
  const [effective, setEffective] = useState<MaterialAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaderParameters, setShaderParameters] = useState<SurfaceShaderParameter[]>([]);
  const [shaderKeywords, setShaderKeywords] = useState<SurfaceShaderKeyword[]>([]);
  const [shaderParameterError, setShaderParameterError] = useState<string | null>(null);
  const [assetRevision, setAssetRevision] = useState(0);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const loadedPath = useRef<string | null>(null);
  const drafts = useRef(new Map<string, InstanceDraft>());
  const instanceRef = useRef<MaterialInstanceAsset | null>(null);
  const editTransaction = useRef<{
    instance: MaterialInstanceAsset;
    checkpoint: EditorUndoCheckpoint;
    token: EditorUndoToken | null;
  } | null>(null);
  instanceRef.current = instance;

  const replaceInstance = (next: MaterialInstanceAsset | null) => {
    instanceRef.current = next;
    setInstance(next);
  };

  useEffect(() => {
    let cancelled = false;
    const transaction = editTransaction.current;
    if (
      transaction?.token
      && instance
      && props.undoService.isUndoTop(transaction.token)
      && serializeMaterialInstanceAsset(instance) === serializeMaterialInstanceAsset(transaction.instance)
    ) {
      props.undoService.restoreCheckpoint(transaction.checkpoint);
    }
    const previousPath = loadedPath.current;
    if (previousPath && instance) {
      drafts.current.set(previousPath, { instance: structuredClone(instance), savedText });
      setDraftEpoch((value) => value + 1);
    }
    loadedPath.current = props.assetPath;
    editTransaction.current = null;
    setError(null);
    setEffective(null);
    replaceInstance(null);
    setSavedText('');
    setLoading(false);
    if (!props.assetPath) return () => { cancelled = true; };
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      replaceInstance(structuredClone(draft.instance));
      setSavedText(draft.savedText);
      setDraftEpoch((value) => value + 1);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void Promise.all([readProjectAssetText(props.assetPath), refreshProjectFiles()])
      .then(([text]) => {
        if (cancelled) return;
        const parsed = parseMaterialInstanceAsset(text);
        replaceInstance(parsed);
        setSavedText(serializeMaterialInstanceAsset(parsed));
        setAssetRevision((revision) => revision + 1);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [props.assetPath]);

  const documentAt = async (path: string): Promise<MaterialInstanceAsset> => {
    const normalized = normalizeProjectAssetPath(path);
    if (loadedPath.current?.toLowerCase() === normalized.toLowerCase() && instanceRef.current) {
      return structuredClone(instanceRef.current);
    }
    const draft = [...drafts.current.entries()].find(
      ([draftPath]) => draftPath.toLowerCase() === normalized.toLowerCase(),
    )?.[1];
    if (draft) return structuredClone(draft.instance);
    return parseMaterialInstanceAsset(await readProjectAssetText(normalized));
  };

  const resolveDocumentMaterial = async (path: string, chain: string[] = []): Promise<MaterialAsset> => {
    const normalized = normalizeProjectAssetPath(path);
    const key = normalized.toLowerCase();
    const cycleIndex = chain.findIndex((entry) => entry.toLowerCase() === key);
    if (cycleIndex >= 0) {
      throw new Error(`Material Instance cycle: ${[...chain.slice(cycleIndex), normalized].join(' -> ')}`);
    }
    if (chain.length >= 32) throw new Error('Material Instance inheritance exceeds 32 levels');
    if (!normalized.toLowerCase().endsWith('.minst')) {
      return loadResolvedMaterialAsset(normalized, chain);
    }
    const authored = await documentAt(normalized);
    const parent = await resolveDocumentMaterial(authored.parent, [...chain, normalized]);
    return applyMaterialInstance(parent, authored);
  };

  useEffect(() => {
    let cancelled = false;
    if (!instance || !props.assetPath) {
      setEffective(null);
      return () => { cancelled = true; };
    }
    void resolveDocumentMaterial(props.assetPath)
      .then((material) => {
        if (!cancelled) {
          setEffective(material);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setEffective(null);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => { cancelled = true; };
  }, [instance, props.assetPath, assetRevision, draftEpoch]);

  useEffect(() => {
    let cancelled = false;
    setShaderParameters([]);
    setShaderKeywords([]);
    setShaderParameterError(null);
    if (effective?.shader !== 'custom' || !effective.custom_shader) {
      return () => { cancelled = true; };
    }
    void readProjectAssetText(effective.custom_shader)
      .then((source) => {
        if (cancelled) return;
        setShaderParameters(parseSurfaceShaderParameters(source));
        setShaderKeywords(parseSurfaceShaderKeywords(source));
      })
      .catch((reason) => {
        if (!cancelled) {
          setShaderParameterError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => { cancelled = true; };
  }, [assetRevision, effective?.custom_shader, effective?.shader]);

  const shaderBindingError = useMemo(() => {
    if (!effective || shaderParameterError || effective.shader !== 'custom') return null;
    try {
      validateSurfaceShaderParameterValues(shaderParameters, effective.custom_parameters);
      validateSurfaceShaderKeywordValues(shaderKeywords, effective.custom_keywords);
      return null;
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason);
    }
  }, [effective, shaderKeywords, shaderParameterError, shaderParameters]);

  const serialized = useMemo(
    () => instance ? serializeMaterialInstanceAsset(instance) : '',
    [instance],
  );
  const dirty = Boolean(instance && serialized !== savedText);
  const anyDirty = dirty || [...drafts.current.values()].some(instanceDraftDirty);
  useEffect(() => props.onDirtyChange(anyDirty), [anyDirty, props.onDirtyChange]);

  useEffect(() => {
    const refresh = () => {
      void refreshProjectFiles().finally(() => {
        setAssetRevision((revision) => revision + 1);
      });
    };
    window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, refresh);
  }, []);

  const materialAssets = useMemo(() => {
    void assetRevision;
    return listProjectFiles().filter(
      (asset) => asset.kind === 'material'
        && /\.(?:mmat|mat|minst)$/i.test(asset.relPath)
        && asset.relPath.toLowerCase() !== props.assetPath?.toLowerCase(),
    );
  }, [assetRevision, props.assetPath]);

  const captureDocument = (path: string): MaterialInstanceAsset => {
    if (loadedPath.current === path && instanceRef.current) return structuredClone(instanceRef.current);
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Material Instance history document '${path}' is unavailable.`);
    return structuredClone(draft.instance);
  };

  const restoreDocument = (path: string, snapshot: MaterialInstanceAsset) => {
    const restored = structuredClone(snapshot);
    if (loadedPath.current === path) {
      editTransaction.current = null;
      replaceInstance(restored);
      setError(null);
      return;
    }
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Material Instance history document '${path}' is unavailable.`);
    drafts.current.set(path, { ...draft, instance: restored });
    setDraftEpoch((value) => value + 1);
  };

  const recordHistory = (snapshot: MaterialInstanceAsset, label: string): EditorUndoToken | null => {
    const path = loadedPath.current;
    if (!path) return null;
    return props.undoService.recordSnapshot({
      scope: `material-instance:${path}`,
      label,
      state: structuredClone(snapshot),
      capture: () => captureDocument(path),
      restore: (state) => restoreDocument(path, state),
    });
  };

  const updateInstance = (
    mutate: (current: MaterialInstanceAsset) => MaterialInstanceAsset,
    label: string,
  ) => {
    const current = instanceRef.current;
    if (!current) return;
    const next = normalizeMaterialInstanceAsset(mutate(structuredClone(current)));
    if (serializeMaterialInstanceAsset(next) === serializeMaterialInstanceAsset(current)) return;
    const transaction = editTransaction.current;
    if (transaction) {
      if (!transaction.token || !props.undoService.isUndoTop(transaction.token)) {
        transaction.instance = structuredClone(current);
        transaction.checkpoint = props.undoService.checkpoint();
        transaction.token = recordHistory(current, label);
      }
    } else {
      recordHistory(current, label);
    }
    replaceInstance(next);
  };

  const setOverride = <K extends MaterialInstanceOverrideField>(
    field: K,
    value: MaterialAsset[K],
  ) => updateInstance(
    (current) => ({ ...current, overrides: { ...current.overrides, [field]: value } }),
    `Edit Material Instance ${fieldLabel(field)}`,
  );

  const toggleOverride = (field: MaterialInstanceOverrideField, enabled: boolean) => {
    updateInstance((current) => {
      const overrides = { ...current.overrides };
      if (enabled) {
        if (!effective) return current;
        Object.assign(overrides, { [field]: structuredClone(effective[field]) });
      } else {
        delete overrides[field];
      }
      return { ...current, overrides };
    }, `${enabled ? 'Enable' : 'Disable'} ${fieldLabel(field)} Override`);
  };

  const setCustomParameter = (
    name: string,
    value: [number, number, number, number],
  ) => updateInstance((current) => ({
    ...current,
    overrides: {
      ...current.overrides,
      custom_parameters: {
        ...current.overrides.custom_parameters,
        [name]: value,
      },
    },
  }), `Edit Material Instance ${name}`);

  const toggleCustomParameter = (parameter: SurfaceShaderParameter, enabled: boolean) => {
    updateInstance((current) => {
      const custom_parameters = { ...current.overrides.custom_parameters };
      if (enabled) {
        custom_parameters[parameter.name] = normalizeSurfaceShaderParameterValue(
          parameter,
          effective?.custom_parameters[parameter.name],
        );
      } else {
        delete custom_parameters[parameter.name];
      }
      const overrides = { ...current.overrides };
      if (Object.keys(custom_parameters).length > 0) overrides.custom_parameters = custom_parameters;
      else delete overrides.custom_parameters;
      return { ...current, overrides };
    }, `${enabled ? 'Enable' : 'Disable'} ${parameter.label} Override`);
  };

  const setCustomKeyword = (name: string, value: boolean) => updateInstance((current) => ({
    ...current,
    overrides: {
      ...current.overrides,
      custom_keywords: {
        ...current.overrides.custom_keywords,
        [name]: value,
      },
    },
  }), `Edit Material Instance ${name}`);

  const toggleCustomKeyword = (keyword: SurfaceShaderKeyword, enabled: boolean) => {
    updateInstance((current) => {
      const custom_keywords = { ...current.overrides.custom_keywords };
      if (enabled) {
        custom_keywords[keyword.name] = effective?.custom_keywords[keyword.name] ?? keyword.default;
      } else {
        delete custom_keywords[keyword.name];
      }
      const overrides = { ...current.overrides };
      if (Object.keys(custom_keywords).length > 0) overrides.custom_keywords = custom_keywords;
      else delete overrides.custom_keywords;
      return { ...current, overrides };
    }, `${enabled ? 'Enable' : 'Disable'} ${keyword.label} Override`);
  };

  const validateResolvedCustomParameters = async (material: MaterialAsset) => {
    if (material.shader !== 'custom') return;
    if (!material.custom_shader) throw new Error('Custom materials require a Surface Shader asset');
    const source = await readProjectAssetText(material.custom_shader);
    const parameters = parseSurfaceShaderParameters(source);
    const keywords = parseSurfaceShaderKeywords(source);
    validateSurfaceShaderParameterValues(parameters, material.custom_parameters);
    validateSurfaceShaderKeywordValues(keywords, material.custom_keywords);
  };

  const beginEdit = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (editTransaction.current || !instance || !isEditControl(event.target)) return;
    editTransaction.current = {
      instance: structuredClone(instance),
      checkpoint: props.undoService.checkpoint(),
      token: null,
    };
  };

  const endEdit = (event: ReactFocusEvent<HTMLDivElement>) => {
    if (!isEditControl(event.target)) return;
    const transaction = editTransaction.current;
    editTransaction.current = null;
    if (
      !transaction?.token
      || !instanceRef.current
      || !props.undoService.isUndoTop(transaction.token)
      || serializeMaterialInstanceAsset(instanceRef.current)
        !== serializeMaterialInstanceAsset(transaction.instance)
    ) return;
    props.undoService.restoreCheckpoint(transaction.checkpoint);
  };

  const save = async (): Promise<boolean> => {
    if (!props.assetPath || !instance) return false;
    const path = props.assetPath;
    const text = serializeMaterialInstanceAsset(structuredClone(instance));
    setSaving(true);
    setError(null);
    try {
      const resolved = await resolveDocumentMaterial(path);
      await validateResolvedCustomParameters(resolved);
      await writeProjectAssetText(path, text);
      await refreshProjectFiles();
      const persisted = parseMaterialInstanceAsset(text);
      if (loadedPath.current === path) {
        const current = instanceRef.current;
        if (current && serializeMaterialInstanceAsset(current) === text) replaceInstance(persisted);
        setSavedText(text);
        drafts.current.delete(path);
      } else {
        const draft = drafts.current.get(path);
        drafts.current.set(path, {
          instance: draft?.instance ?? persisted,
          savedText: text,
        });
        setDraftEpoch((value) => value + 1);
      }
      setAssetRevision((revision) => revision + 1);
      props.onAssetsChanged();
      broadcastProjectAssetsChanged({ action: 'modified', sourcePath: path });
      props.onLog(`Saved ${path}`);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (loadedPath.current === path) setError(message);
      props.onLog(`Material Instance save failed (${path}): ${message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    const dirtyPaths = new Set<string>();
    if (dirty && props.assetPath) dirtyPaths.add(props.assetPath);
    for (const [path, draft] of drafts.current) {
      if (instanceDraftDirty(draft)) dirtyPaths.add(path);
    }
    for (const path of dirtyPaths) {
      const resolved = await resolveDocumentMaterial(path);
      await validateResolvedCustomParameters(resolved);
    }
    if (dirty && !await save()) throw new Error('Current Material Instance could not be saved');
    const failures: string[] = [];
    let savedDraft = false;
    for (const [path, draft] of [...drafts.current]) {
      if (!instanceDraftDirty(draft)) continue;
      try {
        const text = serializeMaterialInstanceAsset(draft.instance);
        await writeProjectAssetText(path, text);
        drafts.current.set(path, {
          instance: parseMaterialInstanceAsset(text),
          savedText: text,
        });
        savedDraft = true;
        broadcastProjectAssetsChanged({ action: 'modified', sourcePath: path });
        props.onLog(`Saved ${path}`);
      } catch (reason) {
        failures.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
      }
    }
    if (savedDraft) {
      await refreshProjectFiles();
      setAssetRevision((revision) => revision + 1);
      props.onAssetsChanged();
      setDraftEpoch((value) => value + 1);
    }
    if (failures.length > 0) throw new Error(failures.join('; '));
  };

  useEffect(() => registerSaveAllParticipant('Material Instances', () => (
    anyDirty && !saving ? saveAll : null
  )), [anyDirty, dirty, instance, props.assetPath, savedText, saving]);

  const createNew = async () => {
    try {
      const path = await createProjectMaterialInstance(props.assetPath ?? undefined);
      props.onOpenAsset(path);
      props.onAssetsChanged();
      props.onLog(`Created ${path}`);
    } catch (reason) {
      props.onLog(
        `Material Instance creation failed: ${reason instanceof Error ? reason.message : String(reason)}`,
        'error',
      );
    }
  };

  const revert = () => {
    if (!instance || !savedText) return;
    recordHistory(instance, 'Revert Material Instance');
    replaceInstance(parseMaterialInstanceAsset(savedText));
    setError(null);
  };

  if (!props.assetPath || !instance) {
    return (
      <div className="material-empty">
        <strong>{loading ? 'Loading Material Instance…' : 'Material Instance Editor'}</strong>
        <span>{error ?? 'Select a .minst asset, or create a Material Instance.'}</span>
        <button type="button" onClick={() => void createNew()}>Create Material Instance</button>
      </div>
    );
  }

  const displayed = effective ?? createMaterialAsset(instance.name);
  const reflectedParameterError = shaderParameterError ?? shaderBindingError;
  const ownCustomParameters = instance.overrides.custom_parameters ?? {};
  const ownCustomKeywords = instance.overrides.custom_keywords ?? {};
  const customOverrideCount = Object.keys(ownCustomParameters).length
    + Object.keys(ownCustomKeywords).length;
  const standardOverrideCount = Object.keys(instance.overrides)
    .filter((field) => field !== 'custom_parameters' && field !== 'custom_keywords').length;
  const dielectricF0 = ((displayed.ior - 1) / (displayed.ior + 1)) ** 2;
  const parentMissing = !materialAssets.some(
    (asset) => asset.relPath.toLowerCase() === instance.parent.toLowerCase(),
  );
  const canAssign = Boolean(props.selectedEntity?.components.MeshRenderer && effective);
  const overridden = (field: MaterialInstanceOverrideField) => instance.overrides[field] != null;

  const scalarRow = (
    field: Extract<MaterialInstanceOverrideField, 'metallic' | 'roughness' | 'ior' | 'clearcoat' | 'clearcoat_roughness' | 'emissive_strength'>,
    minimum: number,
    maximum: number,
    step: number,
  ) => (
    <label className={`material-instance-row${overridden(field) ? '' : ' inherited'}`}>
      <input
        aria-label={`Override ${fieldLabel(field)}`}
        type="checkbox"
        checked={overridden(field)}
        disabled={!effective}
        onChange={(event) => toggleOverride(field, event.target.checked)}
      />
      <span>{fieldLabel(field)}<small>{overridden(field) ? 'Override' : 'Inherited'}</small></span>
      <input
        aria-label={fieldLabel(field)}
        type="number"
        min={minimum}
        max={maximum}
        step={step}
        disabled={!overridden(field)}
        value={displayed[field]}
        onChange={(event) => setOverride(field, Number(event.target.value))}
      />
    </label>
  );

  return (
    <div
      className="material-editor"
      onFocusCapture={beginEdit}
      onBlurCapture={endEdit}
      onKeyDownCapture={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }
      }}
    >
      <div className="material-toolbar">
        <strong title={props.assetPath}>{assetName(props.assetPath)}{dirty ? ' *' : ''}</strong>
        <span className="material-path" title={props.assetPath}>{props.assetPath}</span>
        <button type="button" aria-label="Undo" disabled={!props.undoService.canUndo} onClick={props.onGlobalUndo}><Undo2 size={13} /></button>
        <button type="button" aria-label="Redo" disabled={!props.undoService.canRedo} onClick={props.onGlobalRedo}><Redo2 size={13} /></button>
        <button type="button" onClick={() => void createNew()}>New</button>
        <button type="button" disabled={!dirty || saving} onClick={revert}>Revert</button>
        <button type="button" disabled={!dirty || saving || !effective} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <div className="material-error">{error}</div>}
      <div className="material-body">
        <div
          className="material-preview"
          style={{
            '--material-color': `rgba(${displayed.base_color.slice(0, 3).map((value) => Math.round(value * 255)).join(',')},${displayed.base_color[3]})`,
            '--material-highlight': `rgba(255,255,255,${Math.min(0.95,
              dielectricF0 * 4 + displayed.metallic * (1 - displayed.roughness) * 0.35
              + displayed.clearcoat * (1 - displayed.clearcoat_roughness) * 0.58)})`,
          } as CSSProperties}
        >
          <div className="material-preview-sphere" />
          <span>{displayed.shader.toUpperCase()} · {displayed.surface} · {standardOverrideCount + customOverrideCount} overrides</span>
        </div>
        <div className="material-fields material-instance-fields">
          <label>Name <input value={instance.name} onChange={(event) => updateInstance(
            (current) => ({ ...current, name: event.target.value }),
            'Edit Material Instance Name',
          )} /></label>
          <label className={parentMissing ? 'material-instance-parent missing' : 'material-instance-parent'}>
            Parent
            <select
              value={instance.parent}
              title={parentMissing ? `Missing parent: ${instance.parent}` : instance.parent}
              onChange={(event) => updateInstance(
                (current) => ({ ...current, parent: event.target.value }),
                'Change Material Instance Parent',
              )}
            >
              {parentMissing && <option value={instance.parent}>{instance.parent} (Missing)</option>}
              {materialAssets.map((asset) => (
                <option key={asset.relPath} value={asset.relPath}>{asset.relPath}</option>
              ))}
            </select>
            <button type="button" disabled={parentMissing} onClick={() => props.onOpenAsset(instance.parent)}>Open</button>
          </label>
          <label className={`material-instance-row material-instance-color${overridden('base_color') ? '' : ' inherited'}`}>
            <input aria-label="Override Base Color" type="checkbox" checked={overridden('base_color')} disabled={!effective} onChange={(event) => toggleOverride('base_color', event.target.checked)} />
            <span>Base Color<small>{overridden('base_color') ? 'Override' : 'Inherited'}</small></span>
            <span className="material-instance-color-controls">
              <input aria-label="Base Color" type="color" disabled={!overridden('base_color')} value={colorHex(displayed.base_color)} onChange={(event) => {
                const rgb = parseHex(event.target.value);
                setOverride('base_color', [...rgb, displayed.base_color[3]]);
              }} />
              <input aria-label="Base Color Alpha" type="number" min={0} max={1} step={0.01} disabled={!overridden('base_color')} value={displayed.base_color[3]} onChange={(event) => setOverride('base_color', [
                displayed.base_color[0], displayed.base_color[1], displayed.base_color[2], Number(event.target.value),
              ])} />
            </span>
          </label>
          {scalarRow('metallic', 0, 1, 0.01)}
          {scalarRow('roughness', 0.04, 1, 0.01)}
          {scalarRow('ior', 1, 2.5, 0.01)}
          {scalarRow('clearcoat', 0, 1, 0.01)}
          {scalarRow('clearcoat_roughness', 0.04, 1, 0.01)}
          <label className={`material-instance-row material-instance-color${overridden('emissive') ? '' : ' inherited'}`}>
            <input aria-label="Override Emission" type="checkbox" checked={overridden('emissive')} disabled={!effective} onChange={(event) => toggleOverride('emissive', event.target.checked)} />
            <span>Emission<small>{overridden('emissive') ? 'Override' : 'Inherited'}</small></span>
            <input aria-label="Emission" type="color" disabled={!overridden('emissive')} value={colorHex(displayed.emissive)} onChange={(event) => setOverride('emissive', parseHex(event.target.value))} />
          </label>
          {scalarRow('emissive_strength', 0, 65_504, 0.1)}
          {displayed.shader === 'custom' && reflectedParameterError && (
            <div className="material-parameter-error">
              <span>{reflectedParameterError}</span>
              {(Object.keys(ownCustomParameters).some(
                (name) => !shaderParameters.some((parameter) => parameter.name === name),
              ) || Object.keys(ownCustomKeywords).some(
                (name) => !shaderKeywords.some((keyword) => keyword.name === name),
              )) && (
                <button type="button" onClick={() => {
                  updateInstance((current) => {
                    const custom_parameters = Object.fromEntries(Object.entries(
                      current.overrides.custom_parameters ?? {},
                    ).filter(([name]) => shaderParameters.some(
                      (parameter) => parameter.name === name,
                    )));
                    const overrides = { ...current.overrides };
                    if (Object.keys(custom_parameters).length > 0) {
                      overrides.custom_parameters = custom_parameters;
                    } else {
                      delete overrides.custom_parameters;
                    }
                    const custom_keywords = Object.fromEntries(Object.entries(
                      current.overrides.custom_keywords ?? {},
                    ).filter(([name]) => shaderKeywords.some(
                      (keyword) => keyword.name === name,
                    )));
                    if (Object.keys(custom_keywords).length > 0) {
                      overrides.custom_keywords = custom_keywords;
                    } else {
                      delete overrides.custom_keywords;
                    }
                    return { ...current, overrides };
                  }, 'Remove Stale Material Instance Shader Values');
                }}>Remove Stale Values</button>
              )}
            </div>
          )}
          {displayed.shader === 'custom' && shaderKeywords.length > 0 && (
            <div className="material-custom-parameters material-instance-custom-parameters material-custom-keywords">
              <strong>Surface Shader Keywords</strong>
              {shaderKeywords.map((keyword) => {
                const isOverridden = Object.hasOwn(ownCustomKeywords, keyword.name);
                const enabled = displayed.custom_keywords[keyword.name] ?? keyword.default;
                return (
                  <label key={keyword.name} className={isOverridden ? '' : 'inherited'}>
                    <input
                      aria-label={`Override ${keyword.label}`}
                      type="checkbox"
                      checked={isOverridden}
                      onChange={(event) => toggleCustomKeyword(keyword, event.target.checked)}
                    />
                    <span>{keyword.label}<small>{isOverridden ? 'Override' : 'Inherited'}</small></span>
                    <input
                      aria-label={keyword.label}
                      type="checkbox"
                      checked={enabled}
                      disabled={!isOverridden}
                      onChange={(event) => setCustomKeyword(keyword.name, event.target.checked)}
                    />
                  </label>
                );
              })}
            </div>
          )}
          {displayed.shader === 'custom' && shaderParameters.length > 0 && (
            <div className="material-custom-parameters material-instance-custom-parameters">
              <strong>Surface Shader Parameters</strong>
              {shaderParameters.map((parameter) => {
                const value = normalizeSurfaceShaderParameterValue(
                  parameter,
                  displayed.custom_parameters[parameter.name],
                );
                const isOverridden = Object.hasOwn(ownCustomParameters, parameter.name);
                const componentCount = surfaceShaderParameterComponents(parameter.type);
                const controls = parameter.type === 'color' ? (
                  <span className="material-instance-color-controls">
                    <input
                      aria-label={parameter.label}
                      type="color"
                      disabled={!isOverridden}
                      value={colorHex(value)}
                      onChange={(event) => {
                        const [r, g, b] = parseHex(event.target.value);
                        setCustomParameter(parameter.name, [r, g, b, value[3]]);
                      }}
                    />
                    <input
                      aria-label={`${parameter.label} Alpha`}
                      type="number"
                      min={parameter.min ?? undefined}
                      max={parameter.max ?? undefined}
                      step={0.01}
                      disabled={!isOverridden}
                      value={value[3]}
                      onChange={(event) => setCustomParameter(
                        parameter.name,
                        [value[0], value[1], value[2], Number(event.target.value)],
                      )}
                    />
                  </span>
                ) : componentCount === 1 ? (
                  <input
                    aria-label={parameter.label}
                    type="number"
                    min={parameter.min ?? undefined}
                    max={parameter.max ?? undefined}
                    step={0.01}
                    disabled={!isOverridden}
                    value={value[0]}
                    onChange={(event) => setCustomParameter(
                      parameter.name,
                      [Number(event.target.value), 0, 0, 0],
                    )}
                  />
                ) : (
                  <span className="material-vector">
                    {Array.from({ length: componentCount }, (_, index) => (
                      <input
                        key={index}
                        aria-label={`${parameter.label} ${'XYZW'[index]}`}
                        type="number"
                        min={parameter.min ?? undefined}
                        max={parameter.max ?? undefined}
                        step={0.01}
                        disabled={!isOverridden}
                        value={value[index]}
                        onChange={(event) => {
                          const next = [...value] as [number, number, number, number];
                          next[index] = Number(event.target.value);
                          setCustomParameter(parameter.name, next);
                        }}
                      />
                    ))}
                  </span>
                );
                return (
                  <label key={parameter.name} className={isOverridden ? '' : 'inherited'}>
                    <input
                      aria-label={`Override ${parameter.label}`}
                      type="checkbox"
                      checked={isOverridden}
                      onChange={(event) => toggleCustomParameter(parameter, event.target.checked)}
                    />
                    <span>{parameter.label}<small>{isOverridden ? 'Override' : 'Inherited'}</small></span>
                    {controls}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="material-footer">
        <span>{effective ? `Resolved from ${instance.parent}` : 'Resolve the parent before assigning.'}</span>
        <button type="button" disabled={!canAssign || saving} onClick={() => {
          void (async () => {
            if (dirty && !await save()) return;
            props.onAssignMaterial(props.selectedEntity!.entity, props.assetPath!);
          })();
        }}>
          {dirty ? 'Save & Assign to Selected MeshRenderer' : 'Assign to Selected MeshRenderer'}
        </button>
      </div>
    </div>
  );
}
