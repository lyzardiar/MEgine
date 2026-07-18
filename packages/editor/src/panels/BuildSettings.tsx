import { useEffect, useMemo, useState } from 'react';
import { getDesktopProject } from '../transport/desktopProjectSession';
import {
  buildPcPlayer,
  getProjectBuildSettings,
  isDesktopEditor,
  runPcPlayer,
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

export function BuildSettings(props: {
  sceneName: string | null;
  sceneTick: number;
  sceneDirty: boolean;
  resourceDirty: boolean;
  onSaveScene: () => Promise<boolean>;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const desktop = isDesktopEditor();
  const project = getDesktopProject();
  const [profile, setProfile] = useState<BuildPlayerProfile>('release');
  const [clean, setClean] = useState(true);
  const [settings, setSettings] = useState<ProjectBuildSettings | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
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
        if (!cancelled) setSettings(value);
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
      setMessage(`Build completed: ${result.fileCount} packaged files.`);
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
        <span className={`build-status ${building || launching || settingsSaving ? 'busy' : ''}`}>
          {building ? 'BUILDING' : launching ? 'LAUNCHING' : settingsSaving ? 'SAVING' : lastBuild ? 'SUCCEEDED' : 'READY'}
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
            Animation or Material assets have unsaved changes. Save them before building.
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
          <span>{lastBuild.profile} - {lastBuild.fileCount} files - SHA-256 manifest</span>
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
