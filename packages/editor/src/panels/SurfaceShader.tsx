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
  DEFAULT_UI_SHADER,
  normalizeSurfaceShaderSource,
  surfaceShaderDiagnostics,
  validateSurfaceShaderSource,
} from '../surfaceShader';
import {
  registerCloseDocumentParticipant,
  registerDiscardDocumentParticipant,
  registerSaveAllParticipant,
  registerSaveDocumentParticipant,
  sameSaveDocumentPath,
} from '../saveAll';
import {
  dropChangedCleanDrafts,
  resourceEditorDocuments,
  type WorkspaceResourceDocument,
} from '../workspaceDocuments';
import {
  broadcastProjectAssetsChanged,
  openSurfaceShaderAsset,
  projectAssetsChangeTouches,
  PROJECT_ASSETS_CHANGED_EVENT,
} from '../assetEditorEvents';
import {
  compileSurfaceShaderBackendsWithRuntime,
  isDesktopEditor,
  type SurfaceShaderCompileReport,
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

export async function createProjectSurfaceShader(
  open = true,
  domain: 'surface' | 'ui' = 'surface',
): Promise<string> {
  await refreshProjectFiles();
  const path = uniqueSurfaceShaderPath(domain === 'ui' ? 'New UI Shader' : 'New Surface Shader');
  await writeProjectAssetText(path, domain === 'ui' ? DEFAULT_UI_SHADER : DEFAULT_SURFACE_SHADER);
  await refreshProjectFiles();
  broadcastProjectAssetsChanged({ action: 'created', destinationPath: path });
  if (open) openSurfaceShaderAsset(path);
  return path;
}

export function SurfaceShaderEditor(props: {
  assetPath: string | null;
  onOpenAsset: (path: string) => void;
  onCloseAsset: () => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onDocumentsChange?: (documents: WorkspaceResourceDocument[]) => void;
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
  const [compileReport, setCompileReport] = useState<SurfaceShaderCompileReport | null>(null);
  const [activeTarget, setActiveTarget] = useState('WebGPU');
  const [reloadToken, setReloadToken] = useState(0);
  const [draftEpoch, setDraftEpoch] = useState(0);
  const loadedPath = useRef<string | null>(null);
  const drafts = useRef(new Map<string, { source: string; savedSource: string }>());
  const sourceRef = useRef('');
  const editTransaction = useRef<{
    source: string;
    checkpoint: EditorUndoCheckpoint;
    token: EditorUndoToken | null;
  } | null>(null);
  const lineNumbers = useRef<HTMLDivElement | null>(null);
  const forceReloadPath = useRef<string | null>(null);
  const closingPath = useRef<string | null>(null);
  const suppressAssetChange = useRef(false);
  sourceRef.current = source;

  const replaceSource = (next: string) => {
    sourceRef.current = next;
    setSource(next);
  };

  useEffect(() => {
    let cancelled = false;
    const forceReload = forceReloadPath.current === props.assetPath;
    if (forceReload) forceReloadPath.current = null;
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
    const closingPrevious = sameSaveDocumentPath(previous, closingPath.current ?? '');
    if (closingPrevious) {
      closingPath.current = null;
      drafts.current.delete(previous!);
    }
    if (previous && !loading && !forceReload && !closingPrevious) {
      drafts.current.set(previous, { source, savedSource });
      setDraftEpoch((value) => value + 1);
    }
    loadedPath.current = props.assetPath;
    setError(null);
    setCompileReport(null);
    if (!props.assetPath) {
      replaceSource('');
      setSavedSource('');
      setLoading(false);
      return () => { cancelled = true; };
    }
    if (forceReload) drafts.current.delete(props.assetPath);
    const draft = forceReload ? undefined : drafts.current.get(props.assetPath);
    if (draft) {
      drafts.current.delete(props.assetPath);
      replaceSource(draft.source);
      setSavedSource(draft.savedSource);
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath, { replaceWriteBaseline: true })
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
  }, [props.assetPath, reloadToken]);

  const dirty = source !== savedSource && props.assetPath != null;
  const anyDirty = dirty || [...drafts.current.values()].some(
    (draft) => draft.source !== draft.savedSource,
  );
  useEffect(() => props.onDirtyChange(anyDirty), [anyDirty, props.onDirtyChange]);
  const workspaceDocuments = useMemo(() => resourceEditorDocuments(
    'shader',
    'shader',
    props.assetPath,
    dirty,
    [...drafts.current].map(([path, draft]) => (
      [path, draft.source !== draft.savedSource] as const
    )),
  ), [dirty, draftEpoch, props.assetPath]);
  useEffect(() => {
    props.onDocumentsChange?.(workspaceDocuments);
  }, [props.onDocumentsChange, workspaceDocuments]);
  useEffect(() => () => props.onDocumentsChange?.([]), [props.onDocumentsChange]);
  const diagnostics = useMemo(() => surfaceShaderDiagnostics(source), [source]);
  const lines = useMemo(() => Math.max(1, source.split('\n').length - 1), [source]);
  const isUiShader = source.replace(/\s/g, '').includes('fnmengine_ui_hook(');
  const activeArtifact = compileReport?.artifacts.find(
    (artifact) => artifact.backend === activeTarget,
  ) ?? compileReport?.artifacts[0] ?? null;

  const reloadFromDisk = () => {
    if (!props.assetPath) return;
    forceReloadPath.current = props.assetPath;
    setReloadToken((value) => value + 1);
  };

  useEffect(() => {
    const onAssetsChanged = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (suppressAssetChange.current) return;
      const dropped = dropChangedCleanDrafts(
        drafts.current,
        (path) => projectAssetsChangeTouches(detail, [path]),
        (draft) => draft.source !== draft.savedSource,
      );
      if (dropped.length > 0) {
        for (const path of dropped) props.undoService.clear(`surface-shader:${path}`);
        setDraftEpoch((value) => value + 1);
      }
      if (
        !props.assetPath
        || !projectAssetsChangeTouches(detail, [props.assetPath])
      ) return;
      if (dirty) {
        setError(
          'Surface Shader changed outside this editor. Reload to discard this draft before saving.',
        );
        return;
      }
      reloadFromDisk();
    };
    window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, onAssetsChanged);
    return () => window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, onAssetsChanged);
  }, [dirty, props.assetPath]);

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
      setCompileReport(null);
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
    setCompileReport(null);
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

  const createNew = async (domain: 'surface' | 'ui' = 'surface') => {
    try {
      const path = await createProjectSurfaceShader(true, domain);
      props.onOpenAsset(path);
      props.onAssetsChanged();
      props.onLog(`Created ${path}`);
    } catch (reason) {
      props.onLog(`Surface Shader creation failed: ${reason instanceof Error ? reason.message : String(reason)}`, 'error');
    }
  };

  const validateSource = async (candidate: string): Promise<{
    normalized: string;
    report: SurfaceShaderCompileReport | null;
  }> => {
    const normalized = normalizeSurfaceShaderSource(candidate);
    validateSurfaceShaderSource(normalized);
    const report = desktop
      ? await compileSurfaceShaderBackendsWithRuntime(normalized)
      : null;
    return { normalized, report };
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
      const { normalized, report } = await validateSource(candidate);
      if (loadedPath.current === path) {
        setError(null);
        if (report && sourceRef.current === candidate) {
          setCompileReport(report);
          setActiveTarget(report.artifacts[0]?.backend ?? 'WebGPU');
        }
      }
      if (reportSuccess) {
        props.onLog(desktop
          ? `${path ?? 'Surface Shader'} compiled for WebGPU, Vulkan, Direct3D 12, and Metal.`
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
      suppressAssetChange.current = true;
      try {
        broadcastProjectAssetsChanged({ action: 'modified', sourcePath: path });
      } finally {
        suppressAssetChange.current = false;
      }
      props.onLog(desktop
        ? `Saved ${path}; all Player shader backends compiled.`
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
          const { normalized } = await validateSource(draft.source);
          await writeProjectAssetText(path, normalized);
          drafts.current.set(path, {
            source: normalized,
            savedSource: normalized,
          });
          broadcastProjectAssetsChanged({ action: 'modified', sourcePath: path });
          props.onLog(desktop
            ? `Saved ${path}; all Player shader backends compiled.`
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

  const saveDocument = async (path: string) => {
    if (sameSaveDocumentPath(props.assetPath, path)) {
      if (!await save()) throw new Error('Current Surface Shader could not be saved');
      return;
    }
    const entry = [...drafts.current].find(([draftPath]) => (
      sameSaveDocumentPath(draftPath, path)
    ));
    if (!entry || entry[1].source === entry[1].savedSource) {
      throw new Error(`No dirty Surface Shader draft is open for ${path}`);
    }
    const [draftPath, draft] = entry;
    setSaving(true);
    try {
      const { normalized } = await validateSource(draft.source);
      await writeProjectAssetText(draftPath, normalized);
      drafts.current.set(draftPath, {
        source: normalized,
        savedSource: normalized,
      });
      broadcastProjectAssetsChanged({ action: 'modified', sourcePath: draftPath });
      props.onAssetsChanged();
      props.onLog(desktop
        ? `Saved ${draftPath}; all Player shader backends compiled.`
        : `Saved ${draftPath}; desktop Player validation remains required before build.`);
      setDraftEpoch((value) => value + 1);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => registerSaveAllParticipant('Surface Shaders', () => (
    anyDirty && !saving ? saveAll : null
  )), [anyDirty, dirty, props.assetPath, savedSource, saving, source]);
  useEffect(() => registerSaveDocumentParticipant('Surface Shaders', (path) => {
    if (saving || validating) return null;
    if (dirty && sameSaveDocumentPath(props.assetPath, path)) {
      return () => saveDocument(path);
    }
    const draft = [...drafts.current].find(([draftPath]) => (
      sameSaveDocumentPath(draftPath, path)
    ))?.[1];
    return draft && draft.source !== draft.savedSource
      ? () => saveDocument(path)
      : null;
  }), [dirty, draftEpoch, props.assetPath, savedSource, saving, source, validating]);
  useEffect(() => registerDiscardDocumentParticipant('Surface Shaders', (path) => {
    if (loading || saving || validating) return null;
    if (dirty && sameSaveDocumentPath(props.assetPath, path)) {
      return async () => {
        props.undoService.clear(`surface-shader:${props.assetPath}`);
        reloadFromDisk();
      };
    }
    const entry = [...drafts.current].find(([draftPath]) => (
      sameSaveDocumentPath(draftPath, path)
    ));
    if (!entry || entry[1].source === entry[1].savedSource) return null;
    return async () => {
      props.undoService.clear(`surface-shader:${entry[0]}`);
      drafts.current.delete(entry[0]);
      setDraftEpoch((value) => value + 1);
    };
  }), [dirty, draftEpoch, loading, props.assetPath, saving, validating]);
  useEffect(() => registerCloseDocumentParticipant('Surface Shaders', (path) => {
    if (loading || saving || validating) return null;
    if (sameSaveDocumentPath(props.assetPath, path)) {
      return async () => {
        props.undoService.clear(`surface-shader:${props.assetPath}`);
        closingPath.current = props.assetPath;
        props.onCloseAsset();
      };
    }
    const entry = [...drafts.current].find(([draftPath]) => (
      sameSaveDocumentPath(draftPath, path)
    ));
    if (!entry) return null;
    return async () => {
      props.undoService.clear(`surface-shader:${entry[0]}`);
      drafts.current.delete(entry[0]);
      setDraftEpoch((value) => value + 1);
    };
  }), [
    draftEpoch,
    loading,
    props.assetPath,
    props.onCloseAsset,
    saving,
    validating,
  ]);

  if (!props.assetPath) {
    return <div className="material-empty"><strong>Surface / UI Shader</strong><span>Create or double-click a .mshader asset.</span><button type="button" onClick={() => void createNew('surface')}>Create Surface Shader</button><button type="button" onClick={() => void createNew('ui')}>Create UI Shader</button></div>;
  }

  return (
    <div className="surface-shader-editor">
      <div className="material-toolbar">
        <strong title={props.assetPath}>{props.assetPath.split('/').pop()}{dirty ? ' *' : ''}</strong>
        <span className="spacer" />
        <button type="button" aria-label="Undo" title={`Undo${props.undoService.undoLabel ? ` ${props.undoService.undoLabel}` : ''}`} disabled={!props.undoService.canUndo || saving || validating} onClick={props.onGlobalUndo}><Undo2 size={13} /></button>
        <button type="button" aria-label="Redo" title={`Redo${props.undoService.redoLabel ? ` ${props.undoService.redoLabel}` : ''}`} disabled={!props.undoService.canRedo || saving || validating} onClick={props.onGlobalRedo}><Redo2 size={13} /></button>
        <button type="button" onClick={() => void createNew('surface')}>New Surface</button>
        <button type="button" onClick={() => void createNew('ui')}>New UI</button>
        <button type="button" disabled={loading || saving || validating} onClick={reloadFromDisk}>Reload</button>
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
        <strong>{isUiShader ? 'UI Hook Contract' : 'Lit Surface Hook Contract'}</strong>
        <code>{isUiShader
          ? 'fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32>'
          : 'fn mengine_lit_surface_hook(surface: MEngineSurface, uv, world_position) -> MEngineSurface'}</code>
        <span>{isUiShader
          ? 'The hook receives rect-local UV, vertex color, screen position, clip rect, four material parameters, and up to four material textures.'
          : 'Fields: base_color, alpha, normal, metallic, roughness, occlusion, emissive. MENGINE_PARAMETERS reflects up to 16 values, 16 static switches, and 4 textures.'} Desktop Validate/Save composes the complete runtime shader and cross-compiles every Player backend.</span>
      </div>
      {loading && <div className="field-hint">Loading shader...</div>}
      {(error || diagnostics.length > 0) && (
        <div className="surface-shader-diagnostics">
          {error && <div>{error}</div>}
          {diagnostics.map((diagnostic) => <div key={diagnostic}>{diagnostic}</div>)}
        </div>
      )}
      <div className="surface-shader-targets" aria-label="Player shader targets">
        <span>{compileReport ? `${compileReport.domain.toUpperCase()} COMPILED` : 'VALIDATE TARGETS'}</span>
        {['WebGPU', 'Vulkan', 'Direct3D 12', 'Metal'].map((backend) => {
          const artifact = compileReport?.artifacts.find((item) => item.backend === backend);
          return (
            <button
              type="button"
              key={backend}
              className={activeArtifact?.backend === backend ? 'active' : ''}
              disabled={!artifact}
              aria-pressed={activeArtifact?.backend === backend}
              title={artifact
                ? `${artifact.language}, ${artifact.byteSize.toLocaleString()} bytes`
                : `Validate to compile ${backend}`}
              onClick={() => setActiveTarget(backend)}
            >
              <i className={artifact ? 'ready' : ''} />
              <strong>{backend}</strong>
              <small>{artifact?.language ?? 'pending'}</small>
            </button>
          );
        })}
      </div>
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
      {activeArtifact && (
        <div className="surface-shader-output">
          <header>
            <strong>{activeArtifact.backend} / {activeArtifact.language}</strong>
            <span>{activeArtifact.byteSize.toLocaleString()} bytes · {compileReport?.entryPoints.join(', ')}</span>
          </header>
          <pre>{activeArtifact.source
            ?? `Binary ${activeArtifact.language} artifact generated successfully.\nSource preview is unavailable for binary targets.`}</pre>
        </div>
      )}
    </div>
  );
}
