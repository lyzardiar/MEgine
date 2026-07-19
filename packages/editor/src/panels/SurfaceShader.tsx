import { useEffect, useMemo, useRef, useState } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import {
  listProjectFiles,
  readProjectAssetText,
  refreshProjectFiles,
  writeProjectAssetText,
} from '../projectAssets';
import {
  DEFAULT_SURFACE_SHADER,
  normalizeSurfaceShaderSource,
  surfaceShaderDiagnostics,
  validateSurfaceShaderSource,
} from '../surfaceShader';
import { registerSaveAllParticipant } from '../saveAll';
import {
  broadcastProjectAssetsChanged,
  openSurfaceShaderAsset,
} from '../assetEditorEvents';
import {
  isDesktopEditor,
  validateSurfaceShaderWithRuntime,
} from '../transport/editorTransport';
import type {
  EditorUndoCheckpoint,
  EditorUndoService,
  EditorUndoToken,
} from '../editorUndoService';

function uniqueSurfaceShaderPath(baseName = 'New Surface Shader'): string {
  const used = new Set(listProjectFiles().map((asset) => asset.relPath.toLowerCase()));
  let index = 1;
  let path = `Assets/Shaders/${baseName}.mshader`;
  while (used.has(path.toLowerCase())) {
    index += 1;
    path = `Assets/Shaders/${baseName} ${index}.mshader`;
  }
  return path;
}

export async function createProjectSurfaceShader(): Promise<string> {
  await refreshProjectFiles();
  const path = uniqueSurfaceShaderPath();
  await writeProjectAssetText(path, DEFAULT_SURFACE_SHADER);
  await refreshProjectFiles();
  broadcastProjectAssetsChanged({ action: 'created', destinationPath: path });
  openSurfaceShaderAsset(path);
  return path;
}

export function SurfaceShaderEditor(props: {
  assetPath: string | null;
  onOpenAsset: (path: string) => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
  undoService: EditorUndoService;
  onGlobalUndo: () => void;
  onGlobalRedo: () => void;
}) {
  const desktop = isDesktopEditor();
  const [source, setSource] = useState('');
  const [savedSource, setSavedSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setDraftEpoch] = useState(0);
  const loadedPath = useRef<string | null>(null);
  const drafts = useRef(new Map<string, { source: string; savedSource: string }>());
  const sourceRef = useRef('');
  const editTransaction = useRef<{
    source: string;
    checkpoint: EditorUndoCheckpoint;
    token: EditorUndoToken | null;
  } | null>(null);
  const lineNumbers = useRef<HTMLDivElement | null>(null);
  sourceRef.current = source;

  const replaceSource = (next: string) => {
    sourceRef.current = next;
    setSource(next);
  };

  useEffect(() => {
    let cancelled = false;
    const transaction = editTransaction.current;
    if (
      transaction?.token
      && props.undoService.isUndoTop(transaction.token)
      && source === transaction.source
    ) {
      props.undoService.restoreCheckpoint(transaction.checkpoint);
    }
    editTransaction.current = null;
    const previous = loadedPath.current;
    if (previous && !loading) {
      drafts.current.set(previous, { source, savedSource });
    }
    loadedPath.current = props.assetPath;
    setError(null);
    if (!props.assetPath) {
      replaceSource('');
      setSavedSource('');
      setLoading(false);
      return () => { cancelled = true; };
    }
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      replaceSource(draft.source);
      setSavedSource(draft.savedSource);
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const normalized = normalizeSurfaceShaderSource(text);
        replaceSource(normalized);
        setSavedSource(normalized);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [props.assetPath]);

  const dirty = source !== savedSource && props.assetPath != null;
  const anyDirty = dirty || [...drafts.current.values()].some(
    (draft) => draft.source !== draft.savedSource,
  );
  useEffect(() => props.onDirtyChange(anyDirty), [anyDirty, props.onDirtyChange]);
  const diagnostics = useMemo(() => surfaceShaderDiagnostics(source), [source]);
  const lines = useMemo(() => Math.max(1, source.split('\n').length - 1), [source]);

  const captureDocument = (path: string): string => {
    if (loadedPath.current === path) return sourceRef.current;
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Surface Shader history document '${path}' is no longer available.`);
    return draft.source;
  };

  const restoreDocument = (path: string, snapshot: string) => {
    if (loadedPath.current === path) {
      editTransaction.current = null;
      replaceSource(snapshot);
      setError(null);
      return;
    }
    const draft = drafts.current.get(path);
    if (!draft) throw new Error(`Surface Shader history document '${path}' is no longer available.`);
    drafts.current.set(path, { ...draft, source: snapshot });
    setDraftEpoch((value) => value + 1);
  };

  const recordHistory = (snapshot: string): EditorUndoToken | null => {
    const path = loadedPath.current;
    if (!path) return null;
    return props.undoService.recordSnapshot({
      scope: `surface-shader:${path}`,
      label: 'Edit Surface Shader',
      state: snapshot,
      capture: () => captureDocument(path),
      restore: (state) => restoreDocument(path, state),
    });
  };

  const updateSource = (next: string) => {
    const current = sourceRef.current;
    if (next === current) return;
    const transaction = editTransaction.current;
    if (transaction) {
      if (!transaction.token || !props.undoService.isUndoTop(transaction.token)) {
        transaction.source = current;
        transaction.checkpoint = props.undoService.checkpoint();
        transaction.token = recordHistory(current);
      }
    } else {
      recordHistory(current);
    }
    replaceSource(next);
  };

  const beginEdit = () => {
    if (editTransaction.current || !loadedPath.current) return;
    editTransaction.current = {
      source: sourceRef.current,
      checkpoint: props.undoService.checkpoint(),
      token: null,
    };
  };

  const endEdit = () => {
    const transaction = editTransaction.current;
    editTransaction.current = null;
    if (
      !transaction?.token
      || !props.undoService.isUndoTop(transaction.token)
      || sourceRef.current !== transaction.source
    ) return;
    props.undoService.restoreCheckpoint(transaction.checkpoint);
  };

  const createNew = async () => {
    try {
      const path = await createProjectSurfaceShader();
      props.onOpenAsset(path);
      props.onAssetsChanged();
      props.onLog(`Created ${path}`);
    } catch (reason) {
      props.onLog(`Surface Shader creation failed: ${reason instanceof Error ? reason.message : String(reason)}`, 'error');
    }
  };

  const validateSource = async (candidate: string): Promise<string> => {
    const normalized = normalizeSurfaceShaderSource(candidate);
    validateSurfaceShaderSource(normalized);
    if (desktop) await validateSurfaceShaderWithRuntime(normalized);
    return normalized;
  };

  const validate = async (
    reportSuccess = true,
    candidate = sourceRef.current,
    path = loadedPath.current,
  ): Promise<string> => {
    if (desktop) {
      setValidating(true);
    }
    try {
      const normalized = await validateSource(candidate);
      if (loadedPath.current === path) setError(null);
      if (reportSuccess) {
        props.onLog(desktop
          ? `${path ?? 'Surface Shader'} passed the Player Forward WGSL validator.`
          : `${path ?? 'Surface Shader'} passed editor syntax checks; desktop Player validation is unavailable.`);
      }
      return normalized;
    } finally {
      if (desktop) setValidating(false);
    }
  };

  const save = async (): Promise<boolean> => {
    const path = loadedPath.current;
    if (!path) return false;
    const candidate = sourceRef.current;
    endEdit();
    setSaving(true);
    setError(null);
    try {
      const normalized = await validate(false, candidate, path);
      await writeProjectAssetText(path, normalized);
      if (loadedPath.current === path) {
        replaceSource(normalized);
        setSavedSource(normalized);
        drafts.current.delete(path);
      } else {
        drafts.current.set(path, {
          source: normalized,
          savedSource: normalized,
        });
        setDraftEpoch((value) => value + 1);
      }
      props.onAssetsChanged();
      broadcastProjectAssetsChanged({ action: 'modified', sourcePath: path });
      props.onLog(desktop
        ? `Saved ${path}; Player Forward WGSL validation passed.`
        : `Saved ${path}; desktop Player validation remains required before build.`);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      if (loadedPath.current === path) setError(message);
      props.onLog(`Surface Shader save failed for ${path}: ${message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    if (dirty && !await save()) throw new Error('Current Surface Shader could not be saved');
    const failures: string[] = [];
    const dirtyDrafts = [...drafts.current].filter(
      ([, draft]) => draft.source !== draft.savedSource,
    );
    if (dirtyDrafts.length > 0) setSaving(true);
    try {
      for (const [path, draft] of dirtyDrafts) {
        try {
          const normalized = await validateSource(draft.source);
          await writeProjectAssetText(path, normalized);
          drafts.current.set(path, {
            source: normalized,
            savedSource: normalized,
          });
          broadcastProjectAssetsChanged({ action: 'modified', sourcePath: path });
          props.onLog(desktop
            ? `Saved ${path}; Player Forward WGSL validation passed.`
            : `Saved ${path}; desktop Player validation remains required before build.`);
        } catch (reason) {
          failures.push(`${path}: ${reason instanceof Error ? reason.message : String(reason)}`);
        }
      }
      props.onAssetsChanged();
    } finally {
      setSaving(false);
    }
    if (failures.length > 0) throw new Error(failures.join('; '));
  };

  useEffect(() => registerSaveAllParticipant('Surface Shaders', () => (
    anyDirty && !saving ? saveAll : null
  )), [anyDirty, dirty, props.assetPath, savedSource, saving, source]);

  if (!props.assetPath) {
    return <div className="material-empty"><strong>Surface Shader</strong><span>Create or double-click a .mshader asset.</span><button type="button" onClick={() => void createNew()}>Create Shader</button></div>;
  }

  return (
    <div className="surface-shader-editor">
      <div className="material-toolbar">
        <strong title={props.assetPath}>{props.assetPath.split('/').pop()}{dirty ? ' *' : ''}</strong>
        <span className="spacer" />
        <button type="button" aria-label="Undo" title={`Undo${props.undoService.undoLabel ? ` ${props.undoService.undoLabel}` : ''}`} disabled={!props.undoService.canUndo || saving || validating} onClick={props.onGlobalUndo}><Undo2 size={13} /></button>
        <button type="button" aria-label="Redo" title={`Redo${props.undoService.redoLabel ? ` ${props.undoService.redoLabel}` : ''}`} disabled={!props.undoService.canRedo || saving || validating} onClick={props.onGlobalRedo}><Redo2 size={13} /></button>
        <button type="button" onClick={() => void createNew()}>New</button>
        <button
          type="button"
          disabled={saving || validating || diagnostics.length > 0}
          onClick={() => {
            const path = loadedPath.current;
            void validate(true, sourceRef.current, path).catch((reason) => {
              const message = reason instanceof Error ? reason.message : String(reason);
              if (loadedPath.current === path) setError(message);
              props.onLog(`Surface Shader validation failed for ${path ?? 'unknown asset'}: ${message}`, 'error');
            });
          }}
        >{validating ? 'Validating...' : 'Validate'}</button>
        <button type="button" disabled={!dirty || saving || validating || diagnostics.length > 0} onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</button>
      </div>
      <div className="surface-shader-contract">
        <strong>Lit Surface Hook Contract</strong>
        <code>fn mengine_lit_surface_hook(surface: MEngineSurface, uv, world_position) -&gt; MEngineSurface</code>
        <span>Fields: base_color, alpha, normal, metallic, roughness, occlusion, emissive. An optional /* MENGINE_PARAMETERS {'{'}"parameters":[...], "keywords":[...], "textures":[...]{'}'} */ block reflects up to 16 numeric values as mengine_param_name(), 16 static switches as mengine_keyword_NAME(), and 4 color/data textures as mengine_texture_name(uv). Legacy final-color hooks remain supported. Desktop Validate/Save composes the complete Player Forward shader and runs authoritative Naga validation.</span>
      </div>
      {loading && <div className="field-hint">Loading shader...</div>}
      {(error || diagnostics.length > 0) && (
        <div className="surface-shader-diagnostics">
          {error && <div>{error}</div>}
          {diagnostics.map((diagnostic) => <div key={diagnostic}>{diagnostic}</div>)}
        </div>
      )}
      <div className="surface-shader-code">
        <div className="surface-shader-lines" ref={lineNumbers} aria-hidden="true">{Array.from({ length: lines }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
        <textarea
          aria-label="Surface Shader source"
          value={source}
          disabled={saving || validating}
          spellCheck={false}
          onFocus={beginEdit}
          onBlur={endEdit}
          onChange={(event) => updateSource(event.target.value)}
          onScroll={(event) => { if (lineNumbers.current) lineNumbers.current.scrollTop = event.currentTarget.scrollTop; }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
              event.preventDefault();
              void save();
            }
          }}
        />
      </div>
    </div>
  );
}
