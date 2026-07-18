import { useEffect, useMemo, useState } from 'react';
import { getDesktopProject } from '../transport/desktopProjectSession';
import {
  buildPcPlayer,
  getProjectBuildSettings,
  isDesktopEditor,
  runPcPlayer,
  saveProjectBuildAssetSettings,
  saveProjectBuildSettings,
  type BuildPlayerProfile,
  type BuildPlayerResult,
  type ProjectBuildSettings,
} from '../transport/editorTransport';

function scenePath(name: string): string {
  return `Assets/Scenes/${name}.mscene`;
}

function sceneLabel(path: string): string {
  return path.split('/').pop() ?? path;
}

function byteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

function signedByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes === 0) return '0 B';
  return `${bytes > 0 ? '+' : '−'}${byteSize(Math.abs(bytes))}`;
}

export function BuildSettings(props: {
  sceneName: string | null;
  sceneTick: number;
  sceneDirty: boolean;
  resourceDirty: boolean;
  onSaveScene: () => Promise<boolean>;
  onSaveAll: () => Promise<boolean>;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const desktop = isDesktopEditor();
  const project = getDesktopProject();
  const [profile, setProfile] = useState<BuildPlayerProfile>('release');
  const [clean, setClean] = useState(true);
  const [settings, setSettings] = useState<ProjectBuildSettings | null>(null);
  const [alwaysIncludeDraft, setAlwaysIncludeDraft] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [building, setBuilding] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [lastBuild, setLastBuild] = useState<BuildPlayerResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageError, setMessageError] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const platform = useMemo(() => {
    const source = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
    if (source.includes('win')) return 'Windows (current host)';
    if (source.includes('mac')) return 'macOS (current host)';
    return 'Linux (current host)';
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSettingsError(null);
    void getProjectBuildSettings()
      .then((value) => {
        if (!cancelled) {
          setSettings(value);
          setAlwaysIncludeDraft(value.alwaysInclude.join('\n'));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setSettingsError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => { cancelled = true; };
  }, [props.sceneTick]);

  const save = async () => {
    setMessage(null);
    const ok = await props.onSaveScene();
    setMessageError(!ok);
    setMessage(ok ? 'Scene saved. The project is ready to build.' : 'Scene save failed.');
  };

  const saveAll = async () => {
    if (savingAll) return;
    setSavingAll(true);
    setMessage(null);
    try {
      const ok = await props.onSaveAll();
      setMessageError(!ok);
      setMessage(ok ? 'All open scenes and assets were saved.' : 'Save All completed with errors.');
    } finally {
      setSavingAll(false);
    }
  };

  const persistScenes = async (scenes: string[]) => {
    if (settingsSaving || scenes.length === 0) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const next = await saveProjectBuildSettings(scenes);
      setSettings(next);
      setLastBuild(null);
      props.onLog(`Build scenes updated: ${next.scenes.length} scene(s), entry ${sceneLabel(next.scenes[0])}`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setSettingsError(detail);
      props.onLog(`Build settings save failed: ${detail}`, 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const persistAssetSettings = async (
    assetMode: 'all' | 'referenced',
    alwaysInclude: string[],
  ) => {
    if (settingsSaving) return;
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const next = await saveProjectBuildAssetSettings(assetMode, alwaysInclude);
      setSettings(next);
      setAlwaysIncludeDraft(next.alwaysInclude.join('\n'));
      setLastBuild(null);
      props.onLog(`Build asset mode updated: ${next.assetMode}, ${next.alwaysInclude.length} always-included path(s)`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setSettingsError(detail);
      props.onLog(`Build asset settings save failed: ${detail}`, 'error');
    } finally {
      setSettingsSaving(false);
    }
  };

  const draftAlwaysInclude = () => alwaysIncludeDraft
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  const saveAlwaysInclude = () => {
    if (settings) void persistAssetSettings(settings.assetMode, draftAlwaysInclude());
  };

  const toggleScene = (path: string) => {
    if (!settings) return;
    const index = settings.scenes.indexOf(path);
    if (index >= 0) {
      if (settings.scenes.length === 1) {
        setSettingsError('At least one scene must remain enabled.');
        return;
      }
      void persistScenes(settings.scenes.filter((scene) => scene !== path));
    } else {
      void persistScenes([...settings.scenes, path]);
    }
  };

  const moveScene = (index: number, direction: -1 | 1) => {
    if (!settings) return;
    const target = index + direction;
    if (target < 0 || target >= settings.scenes.length) return;
    const scenes = [...settings.scenes];
    [scenes[index], scenes[target]] = [scenes[target], scenes[index]];
    void persistScenes(scenes);
  };

  const addOpenScene = () => {
    if (!props.sceneName || !settings) return;
    const path = scenePath(props.sceneName);
    if (!settings.scenes.includes(path)) void persistScenes([...settings.scenes, path]);
  };

  const launch = async (result: BuildPlayerResult) => {
    if (launching) return;
    setLaunching(true);
    setMessage(null);
    setMessageError(false);
    try {
      const launched = await runPcPlayer(result.executable);
      setMessage(`Player started (process ${launched.processId}).`);
      props.onLog(`Started player process ${launched.processId} -> ${launched.executable}`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setMessageError(true);
      setMessage(detail);
      props.onLog(`Player launch failed: ${detail}`, 'error');
    } finally {
      setLaunching(false);
    }
  };

  const build = async (runAfterBuild = false) => {
    if (
      !desktop
      || props.sceneDirty
      || props.resourceDirty
      || settingsSaving
      || savingAll
      || !settings?.scenes.length
      || building
      || launching
    ) return;
    setBuilding(true);
    setLastBuild(null);
    setMessage(null);
    setMessageError(false);
    try {
      const result = await buildPcPlayer(profile, clean);
      setLastBuild(result);
      setMessage(`Build completed: ${result.fileCount} packaged files · ${result.contentHash.slice(0, 12)}.`);
      props.onLog(`Built ${result.profile} player -> ${result.outputDir}`);
      if (runAfterBuild) {
        setBuilding(false);
        await launch(result);
      }
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setMessageError(true);
      setMessage(detail);
      props.onLog(`Player build failed: ${detail}`, 'error');
    } finally {
      setBuilding(false);
    }
  };

  const configured = settings?.scenes ?? [];
  const available = settings?.availableScenes ?? [];
  const missing = configured.filter((path) => !available.includes(path));
  const disabled = available.filter((path) => !configured.includes(path));
  const rows = [...configured, ...disabled];
  const openScenePath = props.sceneName ? scenePath(props.sceneName) : null;

  return (
    <div className="build-settings">
      <div className="build-settings-header">
        <div>
          <strong>PC Build Settings</strong>
          <span>Packages an ordered scene list into a self-validating standalone player.</span>
        </div>
        <span className={`build-status ${building || launching || settingsSaving || savingAll ? 'busy' : ''}`}>
          {building ? 'BUILDING' : launching ? 'LAUNCHING' : settingsSaving || savingAll ? 'SAVING' : lastBuild ? 'SUCCEEDED' : 'READY'}
        </span>
      </div>

      <section className="build-section">
        <div className="build-section-title">
          <h3>Scenes In Build</h3>
          <button
            type="button"
            disabled={!openScenePath || configured.includes(openScenePath) || settingsSaving}
            onClick={addOpenScene}
          >
            Add Open Scene
          </button>
        </div>
        {!settings && !settingsError && <div className="build-empty">Loading project manifest...</div>}
        {rows.map((path) => {
          const index = configured.indexOf(path);
          const enabled = index >= 0;
          const isMissing = missing.includes(path);
          return (
            <div className={`build-scene-row${enabled ? ' enabled' : ''}${isMissing ? ' missing' : ''}`} key={path}>
              <span className="build-scene-index">{enabled ? index : '-'}</span>
              <input
                aria-label={`Include ${sceneLabel(path)}`}
                type="checkbox"
                checked={enabled}
                disabled={settingsSaving || (enabled && configured.length === 1)}
                onChange={() => toggleScene(path)}
              />
              <div>
                <strong>{sceneLabel(path)}</strong>
                <small>{isMissing ? 'Missing scene asset' : index === 0 ? 'Player entry point' : path}</small>
              </div>
              <div className="build-scene-actions">
                <button type="button" title="Move up" disabled={!enabled || index === 0 || settingsSaving} onClick={() => moveScene(index, -1)}>Up</button>
                <button type="button" title="Move down" disabled={!enabled || index === configured.length - 1 || settingsSaving} onClick={() => moveScene(index, 1)}>Down</button>
              </div>
            </div>
          );
        })}
        {settings && rows.length === 0 && <div className="build-empty">No .mscene assets were found under Assets/Scenes.</div>}
        {settingsError && <div className="build-warning error">{settingsError}</div>}
        {props.sceneDirty && (
          <div className="build-warning">
            <span>Current scene has unsaved changes. Save it before building.</span>
            <button type="button" onClick={() => void save()}>Save Scene</button>
          </div>
        )}
        {props.resourceDirty && (
          <div className="build-warning">
            <span>Project assets or settings have unsaved changes.</span>
            <button type="button" disabled={savingAll} onClick={() => void saveAll()}>
              {savingAll ? 'Saving All...' : 'Save All'}
            </button>
          </div>
        )}
      </section>

      <section className="build-section build-options">
        <h3>Content</h3>
        <label>Asset Packaging
          <select
            value={settings?.assetMode ?? 'all'}
            disabled={!settings || settingsSaving || building}
            onChange={(event) => {
              if (settings) {
                void persistAssetSettings(
                  event.target.value as 'all' | 'referenced',
                  draftAlwaysInclude(),
                );
              }
            }}
          >
            <option value="all">All Assets (compatible)</option>
            <option value="referenced">Referenced Only</option>
          </select>
        </label>
        <label className="build-asset-paths">
          <span>Always Include</span>
          <span className="build-asset-path-editor">
            <textarea
              aria-label="Always Include asset paths"
              value={alwaysIncludeDraft}
              disabled={!settings || settingsSaving || building}
              placeholder={'Assets/Prefabs/Dynamic\nAssets/Localization'}
              onChange={(event) => setAlwaysIncludeDraft(event.target.value)}
            />
            <button
              type="button"
              disabled={!settings || settingsSaving || building}
              onClick={saveAlwaysInclude}
            >
              Apply Paths
            </button>
          </span>
        </label>
        {settings?.assetMode === 'referenced' && (
          <div className="build-content-note">
            Dynamic loads must be listed above. Referenced assets, transitive dependencies, sprite metadata and build scenes are included automatically.
          </div>
        )}
      </section>

      <section className="build-section build-options">
        <h3>Player</h3>
        <label>Target Platform <span className="build-readonly">{platform}</span></label>
        <label>Configuration
          <select
            value={profile}
            disabled={building}
            onChange={(event) => setProfile(event.target.value as BuildPlayerProfile)}
          >
            <option value="release">Release</option>
            <option value="debug">Debug / Development</option>
          </select>
        </label>
        <label className="build-checkbox">
          <input
            type="checkbox"
            checked={clean}
            disabled={building}
            onChange={(event) => setClean(event.target.checked)}
          />
          Replace previous platform build
        </label>
        <label>Project <span className="build-readonly" title={project?.projectRoot}>{project?.projectName ?? 'Browser preview'}</span></label>
        <label>Output <span className="build-readonly">{project ? `${project.projectRoot}\\Builds` : 'Desktop editor only'}</span></label>
      </section>

      {!desktop && (
        <div className="build-warning error">
          Browser preview can edit build scenes but cannot execute the Rust toolchain. Open the desktop editor to build.
        </div>
      )}
      {message && <div className={`build-message${messageError ? ' error' : ' success'}`}>{message}</div>}
      {lastBuild && (
        <section className="build-result">
          <strong>{lastBuild.executable}</strong>
          <span>
            {lastBuild.platform}-{lastBuild.architecture} · {lastBuild.profile} · MEngine {lastBuild.engineVersion}
          </span>
          <span>
            {lastBuild.sceneCount} scenes · {lastBuild.validatedAssetFiles} validated assets · {lastBuild.assetReferences} references · {lastBuild.assetMode}
          </span>
          <span>{lastBuild.strippedEditorEntities} EditorOnly entities stripped</span>
          <span>
            {lastBuild.omittedAssetFiles} unused asset files · {byteSize(lastBuild.omittedAssetBytes)} omitted
          </span>
          <span>
            {lastBuild.fileCount} files · {byteSize(lastBuild.packagedBytes)} · {lastBuild.toolchain}
          </span>
          <span>SHA-256 {lastBuild.contentHash}</span>
          <div className="build-content-report">
            <h4>Content by Category</h4>
            <div className="build-content-table">
              {lastBuild.contentCategories.map((group) => (
                <div className="build-content-row" key={group.category}>
                  <strong>{group.category}</strong>
                  <span>{group.files} files</span>
                  <span>{byteSize(group.bytes)}</span>
                </div>
              ))}
            </div>
            <h4>Largest Packaged Files</h4>
            <div className="build-content-table largest">
              {lastBuild.largestFiles.map((file) => (
                <div
                  className="build-content-row"
                  key={file.path}
                  title={file.includedBy.join('\n')}
                >
                  <strong>{file.path}</strong>
                  <span>{file.category}</span>
                  <span>{byteSize(file.size)}</span>
                </div>
              ))}
            </div>
            {lastBuild.comparison && <>
              <h4>Changes vs Previous Build</h4>
              <div className="build-comparison-summary">
                <span className="added">+{lastBuild.comparison.addedFiles} added</span>
                <span className="removed">−{lastBuild.comparison.removedFiles} removed</span>
                <span className="changed">~{lastBuild.comparison.changedFiles} changed</span>
                <span>{lastBuild.comparison.unchangedFiles} unchanged</span>
                <strong>{signedByteSize(lastBuild.comparison.byteDelta)}</strong>
              </div>
              {lastBuild.comparison.changes.length > 0
                ? <div className="build-content-table changes">
                    {lastBuild.comparison.changes.map((file) => (
                      <div className={`build-content-row ${file.kind}`} key={`${file.kind}:${file.path}`}>
                        <strong title={file.path}>{file.path}</strong>
                        <span>{file.kind}</span>
                        <span>{signedByteSize(file.byteDelta)}</span>
                      </div>
                    ))}
                  </div>
                : <div className="build-identical">
                    Byte-identical to {lastBuild.comparison.previousContentHash.slice(0, 12)}.
                  </div>}
            </>}
            <small title={lastBuild.manifestPath}>Report: {lastBuild.manifestPath}</small>
          </div>
          {lastBuild.log && <pre>{lastBuild.log}</pre>}
        </section>
      )}

      <div className="build-actions">
        {lastBuild && (
          <button
            type="button"
            disabled={building || launching || settingsSaving}
            onClick={() => void launch(lastBuild)}
          >
            {launching ? 'Starting Player...' : 'Run Player'}
          </button>
        )}
        <button
          type="button"
          disabled={
            !desktop
            || props.sceneDirty
            || props.resourceDirty
            || settingsSaving
            || savingAll
            || building
            || launching
            || !settings?.scenes.length
            || missing.length > 0
          }
          onClick={() => void build(false)}
        >
          {building ? 'Building Player...' : 'Build Player'}
        </button>
        <button
          type="button"
          className="primary"
          disabled={
            !desktop
            || props.sceneDirty
            || props.resourceDirty
            || settingsSaving
            || savingAll
            || building
            || launching
            || !settings?.scenes.length
            || missing.length > 0
          }
          onClick={() => void build(true)}
        >
          {building ? 'Building Player...' : launching ? 'Starting Player...' : 'Build & Run'}
        </button>
      </div>
    </div>
  );
}
