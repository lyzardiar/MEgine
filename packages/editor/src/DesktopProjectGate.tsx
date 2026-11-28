import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  BookOpen,
  Bot,
  Box,
  FolderOpen,
  FolderPlus,
  Globe,
  Grid2x2,
  Layout,
  Moon,
  Pin,
  PinOff,
  Search,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
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
import { recentProjectsRevision } from './recentProjectsRevision';
import { createRegisteredEditorWindow } from './editorWindow/registry.ts';
import { openNativeEditorWindow } from './editorWindow/nativeEditorWindow.ts';
import { BrandMark } from './components/ui/BrandMark';
import { useTheme } from './theme';
import { useI18n, type EditorLocale } from './i18n';

const MAX_RECENT_PROJECTS = 12;
const PINNED_STORAGE_KEY = 'mengine.hub.pinned.v1';

type HubMode = 'welcome' | 'create' | 'tools';
type ProjectSort = 'recent' | 'name';
type StarterTemplateId = 'standard3d' | 'standard2d' | 'uiCanvas';
type ProjectHubOperation = 'attach' | 'open' | 'create' | 'choose' | 'browse' | 'agent-setup' | 'docs';

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

function projectSummary(snapshot: Omit<ProjectSnapshot, 'world'> | null): AgentProjectSummary | null {
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

function readPinnedPaths(): string[] {
  try {
    const raw = window.localStorage?.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writePinnedPaths(paths: string[]): void {
  try {
    window.localStorage?.setItem(PINNED_STORAGE_KEY, JSON.stringify(paths));
  } catch {
    // Ignore storage failures.
  }
}

function formatRelativeTime(
  timestamp: number,
  locale: EditorLocale,
  t: ReturnType<typeof useI18n>['t'],
): { iso: string; label: string } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.valueOf())) {
    return { iso: '', label: t('hub.time.unknown') };
  }
  const diffSec = Math.max(0, Math.floor((Date.now() - date.valueOf()) / 1000));
  if (diffSec < 60) return { iso: date.toISOString(), label: t('hub.time.justNow') };
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return { iso: date.toISOString(), label: t('hub.time.minutesAgo', { n: diffMin }) };
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return { iso: date.toISOString(), label: t('hub.time.hoursAgo', { n: diffHour }) };
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 14) return { iso: date.toISOString(), label: t('hub.time.daysAgo', { n: diffDay }) };
  return {
    iso: date.toISOString(),
    label: date.toLocaleDateString(locale),
  };
}

export function DesktopProjectGate(props: {
  children: ReactNode;
  detached?: boolean;
  projectRequired?: boolean;
}) {
  const desktop = isDesktopEditor();
  const { theme, toggleTheme } = useTheme();
  const { locale, toggleLocale, t } = useI18n();
  const [ready, setReady] = useState(!desktop || props.projectRequired === false);
  const [mode, setMode] = useState<HubMode>('welcome');
  const [operation, setOperation] = useState<ProjectHubOperation | null>(null);
  const [projectName, setProjectName] = useState('NewProject');
  const [projectLocation, setProjectLocation] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<StarterTemplateId>('standard3d');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ProjectSort>('recent');
  const [pinnedPaths, setPinnedPaths] = useState<string[]>(() => readPinnedPaths());
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
  const recentRevision = recentProjectsRevision(recentProjects);

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
      recentRevision: recentProjectsRevision(recentProjectsRef.current),
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
  }, [desktop, props.detached, ready, operation, error, recentRevision]);

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

  const pinnedSet = useMemo(() => new Set(pinnedPaths), [pinnedPaths]);

  const filteredProjects = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const list = recentProjects.filter((project) => {
      if (!query) return true;
      return project.name.toLowerCase().includes(query)
        || project.path.toLowerCase().includes(query);
    });
    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return b.lastOpenedAt - a.lastOpenedAt;
    });
    return {
      pinned: sorted.filter((project) => pinnedSet.has(project.path)),
      regular: sorted.filter((project) => !pinnedSet.has(project.path)),
    };
  }, [pinnedSet, recentProjects, searchQuery, sortBy]);

  if (ready) return props.children;

  const togglePin = (path: string) => {
    setPinnedPaths((prev) => {
      const next = prev.includes(path) ? prev.filter((item) => item !== path) : [path, ...prev];
      writePinnedPaths(next);
      return next;
    });
  };

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
      if (pinnedSet.has(project.path)) togglePin(project.path);
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
    const trimmedLocation = projectLocation.trim();
    if (!validProjectName(projectName) || !trimmedLocation) return;
    await createProjectAtPath(trimmedLocation, projectName.trim()).catch(() => undefined);
  };

  const openRegisteredWindow = async (
    typeId: string,
    op: 'agent-setup' | 'docs',
    label: string,
  ) => {
    if (operationRef.current) return;
    updateOperation(op);
    updateError(null);
    try {
      const definition = createRegisteredEditorWindow(typeId);
      if (!definition) throw new Error(`${label} window is not registered`);
      const opened = await openNativeEditorWindow({
        typeId: definition.typeId,
        title: definition.title,
        width: definition.width,
        height: definition.height,
      });
      if (!opened) throw new Error(`无法创建 ${label} 窗口`);
    } catch (reason) {
      updateError(`打开 ${label} 失败：${errorMessage(reason)}`);
    } finally {
      updateOperation(null);
    }
  };

  const trimmedLocation = projectLocation.trim();
  const targetPath = trimmedLocation
    ? `${trimmedLocation}${trimmedLocation.endsWith('\\') || trimmedLocation.endsWith('/') ? '' : '\\'}${projectName.trim()}`
    : '';

  const nameError = projectName.trim().length === 0
    ? t('hub.validation.emptyName')
    : !validProjectName(projectName)
      ? t('hub.validation.invalidName')
      : null;

  const renderProjectCard = (project: RecentProjectInfo) => {
    const isPinned = pinnedSet.has(project.path);
    const time = formatRelativeTime(project.lastOpenedAt, locale, t);
    const initial = (project.name.trim()[0] ?? 'M').toUpperCase();
    return (
      <div className="hub-project-card" key={project.path}>
        <button
          type="button"
          className="hub-project-open"
          disabled={busy}
          title={`${t('common.open')} ${project.path}`}
          onClick={() => void openRecent(project)}
        >
          <span className="hub-project-avatar" aria-hidden="true">{initial}</span>
          <span className="hub-project-meta">
            <span className="hub-project-title">
              {openingPath === project.path ? t('hub.action.opening') : project.name}
            </span>
            <span className="hub-project-path">{project.path}</span>
          </span>
          <time className="hub-project-time" dateTime={time.iso}>{time.label}</time>
        </button>
        <div className="hub-project-actions">
          <button
            type="button"
            className={`hub-icon-btn${isPinned ? ' is-pinned' : ''}`}
            disabled={busy}
            title={isPinned ? t('common.unpin') : t('common.pin')}
            aria-label={isPinned ? `${t('common.unpin')} ${project.name}` : `${t('common.pin')} ${project.name}`}
            onClick={() => togglePin(project.path)}
          >
            {isPinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="hub-icon-btn is-danger"
            disabled={busy}
            title={`${t('common.remove')} ${project.name}`}
            aria-label={`从最近工程中移除 ${project.name}`}
            onClick={() => void forgetRecent(project)}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <main className="project-hub">
      <aside className="hub-sidebar">
        <div className="hub-brand">
          <BrandMark size={34} />
          <div className="hub-brand-text">
            <h1>{t('brand.name')}</h1>
            <span>v0.1 · Rust + wgpu</span>
          </div>
        </div>

        <nav className="hub-nav" aria-label="Project Hub Navigation">
          <button
            type="button"
            className={`hub-nav-item${mode === 'welcome' ? ' active' : ''}`}
            onClick={() => {
              setMode('welcome');
              updateError(null);
            }}
          >
            <FolderOpen size={15} aria-hidden="true" />
            <span>{t('hub.nav.projects')}</span>
          </button>
          <button
            type="button"
            className={`hub-nav-item${mode === 'create' ? ' active' : ''}`}
            onClick={() => {
              setMode('create');
              updateError(null);
            }}
          >
            <FolderPlus size={15} aria-hidden="true" />
            <span>{t('hub.nav.templates')}</span>
          </button>
          <button
            type="button"
            className={`hub-nav-item${mode === 'tools' ? ' active' : ''}`}
            onClick={() => {
              setMode('tools');
              updateError(null);
            }}
          >
            <Sparkles size={15} aria-hidden="true" />
            <span>{t('hub.nav.tools')}</span>
          </button>
        </nav>

        <div className="hub-sidebar-footer">
          <button
            type="button"
            className="me-btn-secondary"
            disabled={busy}
            data-agent-interaction="blocked"
            data-agent-alternative="open_editor_window"
            onClick={() => void openRegisteredWindow('EditorWindow.AgentSetupWindow', 'agent-setup', 'AI Agent Setup')}
          >
            <Bot size={14} aria-hidden="true" />
            AI Agent Setup
          </button>
          <div className="hub-sidebar-prefs">
            <button
              type="button"
              className="hub-pref-btn"
              title={t('toolbar.theme')}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun size={13} aria-hidden="true" /> : <Moon size={13} aria-hidden="true" />}
              <span>{theme === 'dark' ? t('common.light') : t('common.dark')}</span>
            </button>
            <button
              type="button"
              className="hub-pref-btn"
              title={t('toolbar.locale')}
              onClick={toggleLocale}
            >
              <Globe size={13} aria-hidden="true" />
              <span>{t('common.langToggle')}</span>
            </button>
          </div>
        </div>
      </aside>

      <section className="hub-main">
        {mode === 'welcome' && (
          <>
            <header className="hub-header">
              <div>
                <h2>{t('hub.title.projects')}</h2>
                <p>{t('hub.subtitle.projects')}</p>
              </div>
              <div className="hub-header-actions">
                <button
                  type="button"
                  className="me-btn-secondary"
                  disabled={busy}
                  data-agent-interaction="blocked"
                  data-agent-alternative="open_project"
                  onClick={() => void openExisting()}
                >
                  <FolderOpen size={14} aria-hidden="true" />
                  <span>{busy && !openingPath ? t('hub.action.opening') : t('hub.action.openExisting')}</span>
                </button>
                <button
                  type="button"
                  className="me-btn-primary"
                  disabled={busy}
                  onClick={() => {
                    setMode('create');
                    updateError(null);
                  }}
                >
                  <FolderPlus size={14} aria-hidden="true" />
                  <span>{t('hub.action.newProject')}</span>
                </button>
              </div>
            </header>

            <div className="hub-filter-bar">
              <div className="hub-search-wrap">
                <Search size={14} className="hub-search-icon" aria-hidden="true" />
                <input
                  type="search"
                  className="hub-search-input"
                  value={searchQuery}
                  placeholder={t('hub.searchPlaceholder')}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <select
                className="hub-sort-select"
                aria-label="Sort projects"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as ProjectSort)}
              >
                <option value="recent">{t('hub.sortRecent')}</option>
                <option value="name">{t('hub.sortName')}</option>
              </select>
              <span className="hub-count-pill">
                {t('hub.recentCount', { count: recentProjects.length, limit: MAX_RECENT_PROJECTS })}
              </span>
            </div>

            <section className="hub-project-list" aria-label="最近打开的工程">
              {recentProjects.length === 0 ? (
                <div className="hub-empty-state">
                  <FolderOpen size={28} color="var(--me-text-muted)" aria-hidden="true" />
                  <h3>{t('hub.emptyTitle')}</h3>
                  <p>{t('hub.emptyHint')}</p>
                </div>
              ) : filteredProjects.pinned.length === 0 && filteredProjects.regular.length === 0 ? (
                <div className="hub-empty-state">
                  <Search size={24} color="var(--me-text-muted)" aria-hidden="true" />
                  <h3>{t('hub.noMatch', { query: searchQuery })}</h3>
                </div>
              ) : (
                <>
                  {filteredProjects.pinned.length > 0 && (
                    <>
                      <div className="hub-section-label">{t('hub.pinned')}</div>
                      {filteredProjects.pinned.map(renderProjectCard)}
                    </>
                  )}
                  {filteredProjects.regular.length > 0 && (
                    <>
                      {filteredProjects.pinned.length > 0 && (
                        <div className="hub-section-label">{t('hub.recent')}</div>
                      )}
                      {filteredProjects.regular.map(renderProjectCard)}
                    </>
                  )}
                </>
              )}
            </section>
          </>
        )}

        {mode === 'create' && (
          <>
            <header className="hub-header">
              <div>
                <h2>{t('hub.title.create')}</h2>
                <p>{t('hub.subtitle.create')}</p>
              </div>
            </header>

            <div className="hub-section-label">{t('hub.form.template')}</div>
            <div className="hub-template-grid" role="radiogroup" aria-label={t('hub.form.template')}>
              {(
                [
                  { id: 'standard3d', icon: Box, name: t('hub.template.standard3d.name'), desc: t('hub.template.standard3d.desc') },
                  { id: 'standard2d', icon: Grid2x2, name: t('hub.template.standard2d.name'), desc: t('hub.template.standard2d.desc') },
                  { id: 'uiCanvas', icon: Layout, name: t('hub.template.uiCanvas.name'), desc: t('hub.template.uiCanvas.desc') },
                ] as const
              ).map((tpl) => {
                const Icon = tpl.icon;
                const active = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`hub-template-card${active ? ' selected' : ''}`}
                    onClick={() => setSelectedTemplate(tpl.id)}
                  >
                    <span className="hub-template-icon"><Icon size={18} aria-hidden="true" /></span>
                    <strong>{tpl.name}</strong>
                    <span>{tpl.desc}</span>
                  </button>
                );
              })}
            </div>

            <form
              className="hub-create-card"
              onSubmit={(event) => {
                event.preventDefault();
                void createNew();
              }}
            >
              <div className="hub-field">
                <label htmlFor="project-name">{t('hub.form.name')}</label>
                <input
                  id="project-name"
                  value={projectName}
                  maxLength={64}
                  autoFocus
                  spellCheck={false}
                  onChange={(event) => setProjectName(event.target.value)}
                />
                {nameError && <span className="hub-field-error">{nameError}</span>}
              </div>

              <div className="hub-field">
                <label htmlFor="project-location">{t('hub.form.location')}</label>
                <div className="hub-location-row">
                  <input
                    id="project-location"
                    value={projectLocation}
                    spellCheck={false}
                    placeholder={t('hub.form.locationPlaceholder')}
                    onChange={(event) => setProjectLocation(event.target.value)}
                  />
                  <button
                    type="button"
                    className="me-btn-secondary"
                    disabled={busy}
                    data-agent-interaction="blocked"
                    data-agent-alternative="create_project"
                    onClick={() => void browseLocation()}
                  >
                    {t('common.browse')}
                  </button>
                </div>
                {!trimmedLocation && (
                  <span className="hub-field-error">{t('hub.validation.emptyLocation')}</span>
                )}
              </div>

              {targetPath && (
                <div className="hub-field">
                  <label>{t('hub.form.preview')}</label>
                  <div className="hub-target-preview" title={targetPath}>{targetPath}</div>
                </div>
              )}

              <div className="hub-form-footer">
                <button
                  type="button"
                  className="me-btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setMode('welcome');
                    updateError(null);
                  }}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="me-btn-primary"
                  disabled={busy || !trimmedLocation || !validProjectName(projectName)}
                >
                  {busy ? t('hub.action.creating') : t('hub.action.createAndOpen')}
                </button>
              </div>
            </form>
          </>
        )}

        {mode === 'tools' && (
          <>
            <header className="hub-header">
              <div>
                <h2>{t('hub.nav.tools')}</h2>
                <p>{t('brand.tagline')}</p>
              </div>
            </header>
            <div className="hub-tools-grid">
              <article className="hub-tool-card">
                <Bot size={22} color="var(--me-accent-hover)" aria-hidden="true" />
                <h3>{t('hub.tools.agentTitle')}</h3>
                <p>{t('hub.tools.agentDesc')}</p>
                <button
                  type="button"
                  className="me-btn-primary"
                  disabled={busy}
                  onClick={() => void openRegisteredWindow('EditorWindow.AgentSetupWindow', 'agent-setup', 'AI Agent Setup')}
                >
                  AI Agent Setup
                </button>
              </article>
              <article className="hub-tool-card">
                <BookOpen size={22} color="var(--me-accent-hover)" aria-hidden="true" />
                <h3>{t('hub.tools.docsTitle')}</h3>
                <p>{t('hub.tools.docsDesc')}</p>
                <button
                  type="button"
                  className="me-btn-secondary"
                  disabled={busy}
                  onClick={() => void openRegisteredWindow('EditorWindow.DocumentationWindow', 'docs', 'Documentation')}
                >
                  {t('hub.tools.openDocs')}
                </button>
              </article>
            </div>
          </>
        )}

        {error && <pre className="hub-error-banner" role="alert">{error}</pre>}
      </section>
    </main>
  );
}
