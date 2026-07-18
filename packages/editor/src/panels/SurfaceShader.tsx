import { useEffect, useMemo, useRef, useState } from 'react';
import { registerMenuItem } from '../editorWindow';
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
import { PROJECT_ASSETS_CHANGED_EVENT } from './Material';
import {
  isDesktopEditor,
  validateSurfaceShaderWithRuntime,
} from '../transport/editorTransport';

export const OPEN_SURFACE_SHADER_EVENT = 'mengine:open-surface-shader';

export function openSurfaceShaderAsset(path: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_SURFACE_SHADER_EVENT, { detail: path }));
  window.dispatchEvent(new CustomEvent('mengine:focus-panel', { detail: 'shader' }));
}

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
  window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_CHANGED_EVENT));
  openSurfaceShaderAsset(path);
  return path;
}

registerMenuItem(
  'Assets/Create/Surface Shader',
  async (context) => {
    try {
      context.log(`Created ${await createProjectSurfaceShader()}`);
    } catch (reason) {
      context.log(`Surface Shader creation failed: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  },
  { priority: 205 },
);

export function SurfaceShaderEditor(props: {
  assetPath: string | null;
  onOpenAsset: (path: string) => void;
  onAssetsChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const desktop = isDesktopEditor();
  const [source, setSource] = useState('');
  const [savedSource, setSavedSource] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedPath = useRef<string | null>(null);
  const drafts = useRef(new Map<string, { source: string; savedSource: string }>());
  const lineNumbers = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const previous = loadedPath.current;
    if (previous) {
      if (source !== savedSource) drafts.current.set(previous, { source, savedSource });
      else drafts.current.delete(previous);
    }
    loadedPath.current = props.assetPath;
    setError(null);
    if (!props.assetPath) {
      setSource('');
      setSavedSource('');
      return () => { cancelled = true; };
    }
    const draft = drafts.current.get(props.assetPath);
    if (draft) {
      setSource(draft.source);
      setSavedSource(draft.savedSource);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void readProjectAssetText(props.assetPath)
      .then((text) => {
        if (cancelled) return;
        const normalized = normalizeSurfaceShaderSource(text);
        setSource(normalized);
        setSavedSource(normalized);
      })
      .catch((reason) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [props.assetPath]);

  const dirty = source !== savedSource && props.assetPath != null;
  const anyDirty = dirty || drafts.current.size > 0;
  useEffect(() => props.onDirtyChange(anyDirty), [anyDirty, props.onDirtyChange]);
  const diagnostics = useMemo(() => surfaceShaderDiagnostics(source), [source]);
  const lines = useMemo(() => Math.max(1, source.split('\n').length - 1), [source]);

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

  const validate = async (reportSuccess = true): Promise<string> => {
    if (desktop) {
      setValidating(true);
    }
    try {
      const normalized = await validateSource(source);
      setError(null);
      if (reportSuccess) {
        props.onLog(desktop
          ? `${props.assetPath ?? 'Surface Shader'} passed the Player Forward WGSL validator.`
          : `${props.assetPath ?? 'Surface Shader'} passed editor syntax checks; desktop Player validation is unavailable.`);
      }
      return normalized;
    } finally {
      if (desktop) setValidating(false);
    }
  };

  const save = async (): Promise<boolean> => {
    if (!props.assetPath) return false;
    setSaving(true);
    setError(null);
    try {
      const normalized = await validate(false);
      await writeProjectAssetText(props.assetPath, normalized);
      setSource(normalized);
      setSavedSource(normalized);
      drafts.current.delete(props.assetPath);
      props.onAssetsChanged();
      props.onLog(desktop
        ? `Saved ${props.assetPath}; Player Forward WGSL validation passed.`
        : `Saved ${props.assetPath}; desktop Player validation remains required before build.`);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      props.onLog(`Surface Shader save failed: ${message}`, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    if (dirty && !await save()) throw new Error('Current Surface Shader could not be saved');
    const failures: string[] = [];
    if (drafts.current.size > 0) setSaving(true);
    try {
      for (const [path, draft] of [...drafts.current]) {
        try {
          const normalized = await validateSource(draft.source);
          await writeProjectAssetText(path, normalized);
          drafts.current.delete(path);
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
        <button type="button" onClick={() => void createNew()}>New</button>
        <button
          type="button"
          disabled={saving || validating || diagnostics.length > 0}
          onClick={() => void validate().catch((reason) => {
            const message = reason instanceof Error ? reason.message : String(reason);
            setError(message);
            props.onLog(`Surface Shader validation failed: ${message}`, 'error');
          })}
        >{validating ? 'Validating...' : 'Validate'}</button>
        <button type="button" disabled={!dirty || saving || validating || diagnostics.length > 0} onClick={() => void save()}>{saving ? 'Saving...' : 'Save'}</button>
      </div>
      <div className="surface-shader-contract">
        <strong>Lit Surface Hook Contract</strong>
        <code>fn mengine_lit_surface_hook(surface: MEngineSurface, uv, world_position) -&gt; MEngineSurface</code>
        <span>Fields: base_color, alpha, normal, metallic, roughness, occlusion, emissive. Legacy final-color hooks remain supported. Desktop Validate/Save composes the complete Player Forward shader and runs authoritative Naga validation.</span>
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
          spellCheck={false}
          onChange={(event) => setSource(event.target.value)}
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
