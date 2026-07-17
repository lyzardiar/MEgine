import { useEffect, useState, type ReactNode } from 'react';
import {
  chooseProjectDirectory,
  chooseProjectLocation,
  isDesktopEditor,
  listRecentProjects,
  removeRecentProject,
  type RecentProjectInfo,
} from './transport/editorTransport';
import {
  createDesktopProject,
  attachDesktopProject,
  startDesktopProject,
} from './transport/desktopProjectSession';

const MAX_RECENT_PROJECTS = 12;

type HubMode = 'welcome' | 'create';

function errorMessage(reason: unknown): string {
  return reason && typeof reason === 'object' && 'message' in reason
    ? String((reason as { message: unknown }).message)
    : String(reason);
}

function validProjectName(name: string): boolean {
  const value = name.trim();
  return value.length > 0
    && value.length <= 64
    && value !== '.'
    && value !== '..'
    && !/[\\/:*?"<>|\u0000-\u001f]/.test(value)
    && !/[. ]$/.test(value);
}

function projectTime(timestamp: number): { iso: string; label: string } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) return { iso: '', label: '未知时间' };
  return { iso: date.toISOString(), label: date.toLocaleString('zh-CN') };
}

export function DesktopProjectGate(props: { children: ReactNode; detached?: boolean }) {
  const desktop = isDesktopEditor();
  const [ready, setReady] = useState(!desktop);
  const [mode, setMode] = useState<HubMode>('welcome');
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState('NewProject');
  const [projectLocation, setProjectLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectInfo[]>([]);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  useEffect(() => {
    if (!desktop || props.detached) return;
    let cancelled = false;
    void listRecentProjects()
      .then((projects) => {
        if (!cancelled) setRecentProjects(projects);
      })
      .catch((reason) => {
        if (!cancelled) setError(`读取最近工程失败：${errorMessage(reason)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, props.detached]);

  useEffect(() => {
    if (!desktop || !props.detached || ready) return;
    let cancelled = false;
    setBusy(true);
    void attachDesktopProject()
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((reason) => {
        if (!cancelled) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, props.detached, ready]);

  if (ready) return props.children;

  const openExisting = async () => {
    setBusy(true);
    setError(null);
    try {
      const root = await chooseProjectDirectory();
      if (!root) return;
      await startDesktopProject(root);
      setReady(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const openRecent = async (project: RecentProjectInfo) => {
    setBusy(true);
    setOpeningPath(project.path);
    setError(null);
    try {
      await startDesktopProject(project.path);
      setReady(true);
    } catch (reason) {
      setError(`无法打开最近工程：${project.path}\n${errorMessage(reason)}`);
    } finally {
      setOpeningPath(null);
      setBusy(false);
    }
  };

  const forgetRecent = async (project: RecentProjectInfo) => {
    setError(null);
    try {
      setRecentProjects(await removeRecentProject(project.path));
    } catch (reason) {
      setError(`移除最近工程失败：${errorMessage(reason)}`);
    }
  };

  const browseLocation = async () => {
    setBusy(true);
    setError(null);
    try {
      const root = await chooseProjectLocation();
      if (root) setProjectLocation(root);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const createNew = async () => {
    if (!validProjectName(projectName) || !projectLocation) return;
    setBusy(true);
    setError(null);
    try {
      await createDesktopProject(projectLocation, projectName.trim());
      setReady(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const targetPath = projectLocation
    ? `${projectLocation}${projectLocation.endsWith('\\') || projectLocation.endsWith('/') ? '' : '\\'}${projectName.trim()}`
    : '';

  return (
    <main className="project-hub">
      <section className="project-hub-panel">
        <div className="project-hub-mark">M</div>
        <div>
          <h1>MEngine Editor</h1>
          <p>{mode === 'create' ? '创建本地 MEngine 工程。' : '打开最近工程，或创建一个新工程。'}</p>
        </div>

        {mode === 'welcome' ? (
          <div className="project-hub-actions">
            <button type="button" disabled={busy} onClick={() => void openExisting()}>
              {busy && !openingPath ? '正在打开…' : '打开其他工程'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setMode('create');
                setError(null);
              }}
            >
              新建工程
            </button>
          </div>
        ) : (
          <form
            className="project-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createNew();
            }}
          >
            <label htmlFor="project-name">工程名称</label>
            <input
              id="project-name"
              value={projectName}
              maxLength={64}
              autoFocus
              spellCheck={false}
              onChange={(event) => setProjectName(event.target.value)}
            />
            <label htmlFor="project-location">保存位置</label>
            <div className="project-location-row">
              <input
                id="project-location"
                value={projectLocation}
                readOnly
                placeholder="选择工程父目录"
              />
              <button type="button" className="secondary" disabled={busy} onClick={() => void browseLocation()}>
                浏览…
              </button>
            </div>
            {targetPath && <div className="project-target-path" title={targetPath}>{targetPath}</div>}
            <div className="project-create-actions">
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setMode('welcome');
                  setError(null);
                }}
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy || !projectLocation || !validProjectName(projectName)}
              >
                {busy ? '正在创建…' : '创建并打开'}
              </button>
            </div>
          </form>
        )}

        {mode === 'welcome' && (
          <section className="recent-projects" aria-label="最近打开的工程">
            <header className="recent-projects-header">
              <span>最近打开的工程</span>
              <span>{recentProjects.length}/{MAX_RECENT_PROJECTS}</span>
            </header>
            {recentProjects.length > 0 ? (
              <div className="recent-project-list">
                {recentProjects.map((project) => (
                  <div className="recent-project-row" key={project.path}>
                    <button
                      type="button"
                      className="recent-project-open"
                      disabled={busy}
                      title={`打开 ${project.path}`}
                      onClick={() => void openRecent(project)}
                    >
                      <span className="recent-project-name">
                        {openingPath === project.path ? '正在打开…' : project.name}
                      </span>
                      <span className="recent-project-path">{project.path}</span>
                      <time dateTime={projectTime(project.lastOpenedAt).iso}>
                        {projectTime(project.lastOpenedAt).label}
                      </time>
                    </button>
                    <button
                      type="button"
                      className="recent-project-remove"
                      disabled={busy}
                      title={`从最近工程中移除 ${project.name}`}
                      aria-label={`从最近工程中移除 ${project.name}`}
                      onClick={() => void forgetRecent(project)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="recent-project-empty">打开或创建工程后，会显示在这里。</div>
            )}
          </section>
        )}

        {error && <pre className="project-hub-error">{error}</pre>}
      </section>
    </main>
  );
}
