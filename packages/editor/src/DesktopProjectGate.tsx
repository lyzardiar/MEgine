import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  agentBridge,
  type AgentProjectLifecycleProvider,
  type AgentProjectLifecycleState,
  type AgentProjectSummary,
} from './agent/AgentBridge';
import {
  chooseProjectDirectory,
  chooseProjectLocation,
  isDesktopEditor,
  listRecentProjects,
  removeRecentProject,
  type ProjectSnapshot,
  type RecentProjectInfo,
} from './transport/editorTransport';
import {
  createDesktopProject,
  attachDesktopProject,
  getDesktopProject,
  startDesktopProject,
} from './transport/desktopProjectSession';

const MAX_RECENT_PROJECTS = 12;

type HubMode = 'welcome' | 'create';
type ProjectHubOperation = 'attach' | 'open' | 'create' | 'choose' | 'browse';

function errorMessage(reason: unknown): string {
  return reason && typeof reason === 'object' && 'message' in reason
    ? String((reason as { message: unknown }).message)
    : String(reason);
}

function errorCode(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason
    ? String((reason as { code: unknown }).code)
    : '';
}

function projectSummary(snapshot: ProjectSnapshot | null): AgentProjectSummary | null {
  if (!snapshot) return null;
  return {
    id: snapshot.projectId,
    name: snapshot.projectName,
    root: snapshot.projectRoot,
    scenePath: snapshot.scenePath ?? null,
    revision: snapshot.revision,
  };
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
  const [operation, setOperation] = useState<ProjectHubOperation | null>(null);
  const [projectName, setProjectName] = useState('NewProject');
  const [projectLocation, setProjectLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectInfo[]>([]);
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const readyRef = useRef(ready);
  const operationRef = useRef<ProjectHubOperation | null>(operation);
  const errorRef = useRef<string | null>(error);
  const recentProjectsRef = useRef<RecentProjectInfo[]>(recentProjects);
  const lifecycleProviderRef = useRef<AgentProjectLifecycleProvider | null>(null);
  readyRef.current = ready;
  operationRef.current = operation;
  errorRef.current = error;
  recentProjectsRef.current = recentProjects;
  const busy = operation != null;

  const updateReady = (value: boolean) => {
    readyRef.current = value;
    setReady(value);
  };
  const updateOperation = (value: ProjectHubOperation | null) => {
    operationRef.current = value;
    setOperation(value);
  };
  const updateError = (value: string | null) => {
    errorRef.current = value;
    setError(value);
  };
  const updateRecentProjects = (value: RecentProjectInfo[]) => {
    recentProjectsRef.current = value;
    setRecentProjects(value);
  };

  const lifecycleState = (): AgentProjectLifecycleState => {
    const project = projectSummary(getDesktopProject());
    const lifecycleOperation = (
      operationRef.current === 'attach'
      || operationRef.current === 'open'
      || operationRef.current === 'create'
    )
      ? operationRef.current
      : null;
    return {
      phase: readyRef.current
        ? 'ready'
        : lifecycleOperation === 'attach'
          ? 'attaching'
          : lifecycleOperation === 'open'
            ? 'opening'
            : lifecycleOperation === 'create'
              ? 'creating'
              : errorRef.current
                ? 'error'
                : 'welcome',
      ready: readyRef.current,
      busy: operationRef.current != null,
      operation: lifecycleOperation,
      error: errorRef.current,
      project,
      recentCount: recentProjectsRef.current.length,
      recentLimit: MAX_RECENT_PROJECTS,
    };
  };

  const refreshRecentProjects = async () => {
    const projects = await listRecentProjects();
    updateRecentProjects(projects);
    return projects;
  };

  const forgetRecentProjectAtPath = async (path: string) => {
    const projects = await removeRecentProject(path);
    updateRecentProjects(projects);
    return projects;
  };

  const openProjectAtPath = async (root: string): Promise<ProjectSnapshot> => {
    if (readyRef.current || getDesktopProject()) {
      throw new Error('A project is already open; close it before switching projects');
    }
    if (operationRef.current) {
      throw new Error(`Project lifecycle is busy (${operationRef.current})`);
    }
    updateOperation('open');
    updateError(null);
    try {
      const snapshot = await startDesktopProject(root);
      updateReady(true);
      void refreshRecentProjects().catch(() => undefined);
      return snapshot;
    } catch (reason) {
      updateError(errorMessage(reason));
      throw reason;
    } finally {
      updateOperation(null);
    }
  };

  const createProjectAtPath = async (
    parent: string,
    name: string,
  ): Promise<ProjectSnapshot> => {
    if (readyRef.current || getDesktopProject()) {
      throw new Error('A project is already open; close it before switching projects');
    }
    if (operationRef.current) {
      throw new Error(`Project lifecycle is busy (${operationRef.current})`);
    }
    updateOperation('create');
    updateError(null);
    try {
      const snapshot = await createDesktopProject(parent, name);
      updateReady(true);
      void refreshRecentProjects().catch(() => undefined);
      return snapshot;
    } catch (reason) {
      updateError(errorMessage(reason));
      throw reason;
    } finally {
      updateOperation(null);
    }
  };

  lifecycleProviderRef.current = {
    getState: lifecycleState,
    listRecent: refreshRecentProjects,
    forgetRecent: forgetRecentProjectAtPath,
    open: openProjectAtPath,
    create: createProjectAtPath,
  };

  useEffect(() => {
    if (!desktop || props.detached) return;
    let cancelled = false;
    void listRecentProjects()
      .then((projects) => {
        if (!cancelled) updateRecentProjects(projects);
      })
      .catch((reason) => {
        if (!cancelled) updateError(`读取最近工程失败：${errorMessage(reason)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, props.detached]);

  useEffect(() => {
    if (!desktop || props.detached) return;
    return agentBridge.connectProjectLifecycle(() => lifecycleProviderRef.current);
  }, [desktop, props.detached]);

  useEffect(() => {
    if (!desktop || props.detached) return;
    agentBridge.observeProject();
  }, [desktop, props.detached, ready, operation, error, recentProjects.length]);

  useEffect(() => {
    if (!desktop || props.detached || ready) return;
    let cancelled = false;
    updateOperation('attach');
    updateError(null);
    void attachDesktopProject()
      .then(() => {
        if (!cancelled) updateReady(true);
      })
      .catch((reason) => {
        if (!cancelled && errorCode(reason) !== 'noProject') {
          updateError(`恢复已打开工程失败：${errorMessage(reason)}`);
        }
      })
      .finally(() => {
        if (!cancelled) updateOperation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, props.detached, ready]);

  useEffect(() => {
    if (!desktop || ready) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      void getCurrentWindow().destroy().catch((reason) => {
        console.error('Failed to close the project hub', reason);
      });
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    }).catch((reason) => {
      console.error('Failed to register the project hub close handler', reason);
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop, ready]);

  useEffect(() => {
    if (!desktop || !props.detached || ready) return;
    let cancelled = false;
    updateOperation('attach');
    void attachDesktopProject()
      .then(() => {
        if (!cancelled) updateReady(true);
      })
      .catch((reason) => {
        if (!cancelled) updateError(errorMessage(reason));
      })
      .finally(() => {
        if (!cancelled) updateOperation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [desktop, props.detached, ready]);

  if (ready) return props.children;

  const openExisting = async () => {
    if (operationRef.current) return;
    updateOperation('choose');
    updateError(null);
    let root: string | null = null;
    try {
      root = await chooseProjectDirectory();
    } catch (reason) {
      updateError(errorMessage(reason));
    } finally {
      updateOperation(null);
    }
    if (root) await openProjectAtPath(root).catch(() => undefined);
  };

  const openRecent = async (project: RecentProjectInfo) => {
    setOpeningPath(project.path);
    updateError(null);
    await openProjectAtPath(project.path)
      .catch((reason) => {
        updateError(`无法打开最近工程：${project.path}\n${errorMessage(reason)}`);
      })
      .finally(() => {
        setOpeningPath(null);
      });
  };

  const forgetRecent = async (project: RecentProjectInfo) => {
    updateError(null);
    try {
      await forgetRecentProjectAtPath(project.path);
    } catch (reason) {
      updateError(`移除最近工程失败：${errorMessage(reason)}`);
    }
  };

  const browseLocation = async () => {
    if (operationRef.current) return;
    updateOperation('browse');
    updateError(null);
    try {
      const root = await chooseProjectLocation();
      if (root) setProjectLocation(root);
    } catch (reason) {
      updateError(errorMessage(reason));
    } finally {
      updateOperation(null);
    }
  };

  const createNew = async () => {
    if (!validProjectName(projectName) || !projectLocation) return;
    await createProjectAtPath(projectLocation, projectName.trim()).catch(() => undefined);
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
            <button
              type="button"
              disabled={busy}
              data-agent-interaction="blocked"
              data-agent-alternative="open_project"
              onClick={() => void openExisting()}
            >
              {busy && !openingPath ? '正在打开…' : '打开其他工程'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => {
                setMode('create');
                updateError(null);
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
              <button
                type="button"
                className="secondary"
                disabled={busy}
                data-agent-interaction="blocked"
                data-agent-alternative="create_project"
                onClick={() => void browseLocation()}
              >
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
                  updateError(null);
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
