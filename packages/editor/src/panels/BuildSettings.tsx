import { useMemo, useState } from 'react';
import { getDesktopProject } from '../transport/desktopProjectSession';
import {
  buildPcPlayer,
  isDesktopEditor,
  type BuildPlayerProfile,
  type BuildPlayerResult,
} from '../transport/editorTransport';

export function BuildSettings(props: {
  sceneName: string | null;
  sceneDirty: boolean;
  resourceDirty: boolean;
  onSaveScene: () => Promise<boolean>;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}) {
  const desktop = isDesktopEditor();
  const project = getDesktopProject();
  const [profile, setProfile] = useState<BuildPlayerProfile>('release');
  const [clean, setClean] = useState(true);
  const [building, setBuilding] = useState(false);
  const [lastBuild, setLastBuild] = useState<BuildPlayerResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const platform = useMemo(() => {
    const source = `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
    if (source.includes('win')) return 'Windows (current host)';
    if (source.includes('mac')) return 'macOS (current host)';
    return 'Linux (current host)';
  }, []);

  const save = async () => {
    setMessage(null);
    const ok = await props.onSaveScene();
    setMessage(ok ? 'Scene saved. The project is ready to build.' : 'Scene save failed.');
  };

  const build = async () => {
    if (!desktop || props.sceneDirty || props.resourceDirty || building) return;
    setBuilding(true);
    setLastBuild(null);
    setMessage(null);
    try {
      const result = await buildPcPlayer(profile, clean);
      setLastBuild(result);
      setMessage(`Build completed: ${result.fileCount} packaged files.`);
      props.onLog(`Built ${result.profile} player → ${result.outputDir}`);
    } catch (reason) {
      const detail = reason instanceof Error ? reason.message : String(reason);
      setMessage(detail);
      props.onLog(`Player build failed: ${detail}`, 'error');
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div className="build-settings">
      <div className="build-settings-header">
        <div>
          <strong>PC Build Settings</strong>
          <span>Creates a self-validating standalone player from project.json.</span>
        </div>
        <span className={`build-status ${building ? 'busy' : ''}`}>
          {building ? 'BUILDING' : lastBuild ? 'SUCCEEDED' : 'READY'}
        </span>
      </div>

      <section className="build-section">
        <h3>Scenes In Build</h3>
        <div className="build-scene-row">
          <span className="build-scene-index">0</span>
          <span className="build-scene-check">✓</span>
          <div>
            <strong>{props.sceneName ? `${props.sceneName}.mscene` : 'No active scene'}</strong>
            <small>project.json mainScene is the player entry point</small>
          </div>
        </div>
        {props.sceneDirty && (
          <div className="build-warning">
            <span>Current scene has unsaved changes. Save it before building.</span>
            <button type="button" onClick={() => void save()}>Save Scene</button>
          </div>
        )}
        {props.resourceDirty && (
          <div className="build-warning">
            Animation or Material assets have unsaved changes. Save the active asset before building.
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
          Browser preview cannot execute the Rust toolchain. Open this project in the desktop editor.
        </div>
      )}
      {message && <div className={`build-message${lastBuild ? ' success' : ''}`}>{message}</div>}
      {lastBuild && (
        <section className="build-result">
          <strong>{lastBuild.executable}</strong>
          <span>{lastBuild.profile} · {lastBuild.fileCount} files · SHA-256 manifest</span>
          {lastBuild.log && <pre>{lastBuild.log}</pre>}
        </section>
      )}

      <div className="build-actions">
        <button
          type="button"
          className="primary"
          disabled={!desktop || props.sceneDirty || props.resourceDirty || building || !props.sceneName}
          onClick={() => void build()}
        >
          {building ? 'Building Player…' : 'Build Player'}
        </button>
      </div>
    </div>
  );
}
