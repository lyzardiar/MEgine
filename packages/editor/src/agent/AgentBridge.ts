/**
 * AgentBridge Core — the transport-agnostic heart of the editor's AI-agent
 * integration. It exposes a unified observation surface (`query`) over the
 * live editor store, the viewport canvas, and Tauri window commands.
 *
 * Transports (MCP / WebSocket / HTTP / CLI) are thin adapters that translate
 * their protocol into `query()` / `execute()` calls on the singleton
 * `agentBridge`. This module deliberately has no transport or React dependency
 * so it can be wired once from `App.tsx` and reused everywhere.
 *
 * Phase 1 implements the read-only Observer. The write Dispatcher lands in
 * Phase 2 and will route through the same `EditorStore` methods the UI uses.
 */
import { invoke } from '@tauri-apps/api/core';
import type { EditorStore } from '../store';
import {
  isDesktopEditor,
  type ProjectSnapshot,
  type RecentProjectInfo,
} from '../transport/editorTransport';
import { normalizeSceneName, sceneFileName } from '../sceneLibrary';
import {
  BridgeError,
  type EditorMenuItemInfo,
  type EditorState,
  type EditorUiActionResult,
  type EditorUiSnapshot,
  type EditorWindowInfo,
  type HierarchyNode,
  type PanelLayoutSnapshot,
  type ScreenshotResult,
  type SelectionInfo,
  type ViewportTab,
} from './protocol';
import {
  logService,
  type LogChange,
  type LogEntry,
  type LogQuery,
} from './LogService';
import {
  WRITE_COMMANDS,
  COMMAND_META,
  type CommandContext,
  type CommandMeta,
  type CommandResult,
  type CommandSummary,
} from './commands';
import { COMMAND_EXECUTION_OPTIONS_SCHEMA } from './commandSchemas';
import {
  buildAgentComponentSchema,
  listAgentComponentSchemas,
} from './componentSchema';
import { validateAgentSceneJson } from './sceneJsonValidation';
import {
  findMenuItem,
  listAllMenuItems,
  type MenuItemContext,
} from '../editorWindow/registry';
import { CORE_PANEL_IDS } from '../panels/detachedPanelWindow';
import {
  importExternalProjectAsset,
  listProjectFiles,
  isProjectTextAssetPath,
  normalizeProjectAssetPath,
  readProjectAssetBytesWithRevision,
  refreshProjectFiles,
  writeProjectAssetText,
  type ProjectAssetChange,
  type ProjectFileAsset,
} from '../projectAssets';
import { findProjectAssetReferences } from '../assetReferences';
import { validateImportedAssetName } from '../assetImportModel';
import { refreshSprites } from '../spriteLibrary';
import {
  PROJECT_ASSETS_CHANGED_EVENT,
  PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT,
  broadcastProjectAssetsChanged,
} from '../assetEditorEvents';
import {
  buildPcPlayer,
  cancelPcBuild,
  getProjectBuildSettings,
  listenToPcBuildProgress,
  listPcBuildHistory,
  PROJECT_BUILD_SETTINGS_CHANGED_EVENT,
  saveProjectBuildSettings,
  verifyPcPlayer,
  type BuildPlayerProfile,
  type BuildPlayerResult,
  type BuildProgressEvent,
  type ProjectBuildSettings,
  type VerifyPlayerResult,
} from '../transport/editorTransport';
import type { AgentAssetOperations } from './assetOperations';
import {
  AGENT_EVENT_TOPICS,
  AgentEventJournal,
  SceneChangeTracker,
  type AgentEvent,
  type AgentEventPage,
  type AgentEventTopic,
  type SceneDiff,
  type SceneEntityView,
} from './eventJournal';

type CaptureFn = (
  format: 'image/png' | 'image/jpeg',
  quality?: number,
) => ScreenshotResult | null;

interface SceneMetaProviders {
  sceneName: () => string | null;
  dirty: () => boolean;
}

export interface AgentSceneProvider {
  list: () => {
    ready: boolean;
    activeScene: string | null;
    dirty: boolean;
    scenes: Array<{ name: string; updatedAt: number }>;
  };
  create: (options: {
    name: string;
    overwrite: boolean;
    discardDirty: boolean;
  }) => Promise<{ name: string }>;
  open: (options: {
    name: string;
    discardDirty: boolean;
  }) => Promise<{ name: string }>;
  save: (options: {
    name?: string;
    overwrite: boolean;
  }) => Promise<{ name: string }>;
  saveAll: (options: {
    unnamedScene?: string;
    overwrite: boolean;
  }) => Promise<{ sceneName: string | null }>;
  rename: (options: {
    oldName: string;
    newName: string;
  }) => Promise<{ oldName: string; name: string; activeScene: string | null }>;
  delete: (options: {
    name: string;
    expectedRevision: string;
  }) => Promise<{ name: string }>;
}

export type AgentSceneDeletePreview = {
  operation: 'delete';
  previewToken: string;
  name: string;
  path: string;
  revision: string;
  activeScene: string | null;
  includedInBuildSettings: boolean;
  blockers: string[];
  permanent: true;
};

export interface AgentWorkspaceProvider {
  assertDiskMutationAllowed: () => Promise<void>;
}

export type AgentProjectSummary = {
  id: string;
  name: string;
  root: string;
  scenePath: string | null;
  revision: number;
};

export type AgentProjectLifecycleState = {
  phase: 'welcome' | 'attaching' | 'opening' | 'creating' | 'ready' | 'error';
  ready: boolean;
  busy: boolean;
  operation: 'attach' | 'open' | 'create' | null;
  error: string | null;
  project: AgentProjectSummary | null;
  recentCount: number;
  recentLimit: number;
};

export interface AgentProjectLifecycleProvider {
  getState: () => AgentProjectLifecycleState;
  listRecent: () => Promise<RecentProjectInfo[]>;
  forgetRecent: (path: string) => Promise<RecentProjectInfo[]>;
  open: (root: string) => Promise<ProjectSnapshot>;
  create: (parent: string, name: string) => Promise<ProjectSnapshot>;
}

type AgentBuildJob = {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  profile: BuildPlayerProfile;
  clean: boolean;
  startedAt: number;
  finishedAt: number | null;
  progress: BuildProgressEvent | null;
  result: BuildPlayerResult | null;
  verification: VerifyPlayerResult | null;
  error: string | null;
};

interface EntityView {
  entity: number;
  name?: string | null;
  parent?: number | null;
  siblingIndex?: number;
  active?: boolean;
  components: Record<string, unknown>;
}

type ObservedEditorState = {
  mode: EditorState['mode'];
  sceneName: string | null;
  dirty: boolean;
  selectedIds: number[];
  panelSignature: string | null;
};

class AgentBridge {
  private store: EditorStore | null = null;
  private sceneMeta: SceneMetaProviders | null = null;
  private captures = new Map<ViewportTab, CaptureFn>();
  private refreshProvider: (() => void) | null = null;
  private logProvider: ((message: string) => void) | null = null;
  private panelLayoutProvider: (() => PanelLayoutSnapshot | null) | null = null;
  private sceneProvider: (() => AgentSceneProvider | null) | null = null;
  private workspaceProvider: (() => AgentWorkspaceProvider | null) | null = null;
  private buildJob: AgentBuildJob | null = null;
  private stopBuildProgress: (() => void) | null = null;
  private assetOperations: AgentAssetOperations | null = null;
  private clearLogProvider: (() => void) | null = null;
  private readonly events = new AgentEventJournal();
  private readonly sceneChanges = new SceneChangeTracker();
  private observedState: ObservedEditorState | null = null;
  private lastPlaySceneObservationAt = 0;
  private eventSourceConnections = 0;
  private stopLogEvents: (() => void) | null = null;
  private stopAssetEvents: (() => void) | null = null;
  private lastAssetEvent: { signature: string; time: number } | null = null;
  private projectLifecycleProvider:
    | (() => AgentProjectLifecycleProvider | null)
    | null = null;
  private observedProjectSignature: string | null = null;
  private editorBootReady = false;
  private editorBootGeneration = 0;

  /** Wire the bridge to the live editor store. Called once from App. */
  connect(store: EditorStore): void {
    if (this.store !== store) {
      this.sceneChanges.reset();
      this.observedState = null;
      this.lastPlaySceneObservationAt = 0;
      this.editorBootReady = false;
    }
    this.store = store;
    this.observeProject();
  }

  /** Declare that the connected store has finished loading its project scene and settings. */
  markEditorBootReady(store: EditorStore): void {
    if (this.store !== store || this.editorBootReady) return;
    this.editorBootReady = true;
    this.editorBootGeneration += 1;
    this.observeProject();
  }

  private async waitForEditorBootAfter(generation: number): Promise<void> {
    const deadline = Date.now() + 15_000;
    while (
      !this.editorBootReady
      || this.editorBootGeneration <= generation
    ) {
      if (Date.now() >= deadline) {
        throw new BridgeError(
          'NOT_READY',
          'The project opened, but the editor store did not finish loading within 15 seconds',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  /** Provide scene name / dirty state, which live in React (App) not the store. */
  connectSceneMeta(providers: SceneMetaProviders): void {
    this.sceneMeta = providers;
  }

  /** Wire the UI refresh callback, invoked after every write command. */
  connectRefresh(refresh: () => void): void {
    this.refreshProvider = refresh;
  }

  connectLog(log: (message: string) => void, clear?: () => void): void {
    this.logProvider = log;
    this.clearLogProvider = clear ?? null;
  }

  connectPanelLayout(provider: () => PanelLayoutSnapshot | null): void {
    this.panelLayoutProvider = provider;
  }

  connectSceneCommands(provider: () => AgentSceneProvider | null): void {
    this.sceneProvider = provider;
  }

  connectWorkspace(provider: () => AgentWorkspaceProvider | null): void {
    this.workspaceProvider = provider;
  }

  connectProjectLifecycle(
    provider: () => AgentProjectLifecycleProvider | null,
  ): () => void {
    this.projectLifecycleProvider = provider;
    this.observeProject();
    return () => {
      if (this.projectLifecycleProvider !== provider) return;
      this.projectLifecycleProvider = null;
    };
  }

  /** Record project-hub transitions even before the editor store is mounted. */
  observeProject(): void {
    const provider = this.projectLifecycleProvider?.() ?? null;
    if (!provider) return;
    const state = {
      ...provider.getState(),
      editorReady: this.store != null && this.editorBootReady,
    };
    const signature = JSON.stringify(state);
    if (signature === this.observedProjectSignature) return;
    this.observedProjectSignature = signature;
    this.appendEvent('project.changed', state);
  }

  /**
   * Attach process-local log and asset sources to the event journal. The main
   * editor window owns these sources; detached webviews intentionally do not.
   */
  connectEventSources(): () => void {
    this.eventSourceConnections += 1;
    if (this.eventSourceConnections === 1) {
      this.stopLogEvents = logService.subscribe((change) => this.recordLogEvent(change));
      const onAssetChanged = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail ?? { action: 'changed' };
        let signature: string;
        try {
          signature = JSON.stringify(detail);
        } catch {
          signature = String(detail);
        }
        const time = Date.now();
        if (
          this.lastAssetEvent?.signature === signature
          && time - this.lastAssetEvent.time < 100
        ) return;
        this.lastAssetEvent = { signature, time };
        this.appendEvent('asset.changed', detail, time);
      };
      window.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, onAssetChanged);
      this.stopAssetEvents = () => {
        window.removeEventListener(PROJECT_ASSETS_CHANGED_EVENT, onAssetChanged);
      };
    }
    let connected = true;
    return () => {
      if (!connected) return;
      connected = false;
      this.eventSourceConnections = Math.max(0, this.eventSourceConnections - 1);
      if (this.eventSourceConnections !== 0) return;
      this.stopLogEvents?.();
      this.stopLogEvents = null;
      this.stopAssetEvents?.();
      this.stopAssetEvents = null;
      this.lastAssetEvent = null;
    };
  }

  /**
   * Register a viewport capture function for a tab. Returns an unregister
   * cleanup. Called by the Viewport component on mount.
   */
  registerViewportCapture(tab: ViewportTab, fn: CaptureFn): () => void {
    this.captures.set(tab, fn);
    return () => {
      if (this.captures.get(tab) === fn) this.captures.delete(tab);
    };
  }

  // ── Observer ──────────────────────────────────────────────────────────

  captureViewport(
    tab: ViewportTab = 'scene',
    format: 'image/png' | 'image/jpeg' = 'image/png',
    quality?: number,
  ): ScreenshotResult {
    const fn = this.captures.get(tab);
    if (!fn) {
      throw new BridgeError('NOT_READY', `No viewport capture registered for "${tab}"`);
    }
    const result = fn(format, quality);
    if (!result) {
      throw new BridgeError('NOT_READY', `Viewport "${tab}" canvas is not available yet`);
    }
    return result;
  }

  /**
   * Capture an editor webview (menus, panels, and rendered content) without
   * activating the window. Pass a label from `window.list` to inspect a
   * detached panel/editor window; the main window is the default.
   */
  async captureWindow(windowLabel = 'main'): Promise<ScreenshotResult> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Full-window capture requires the desktop editor');
    }
    return invoke<ScreenshotResult>('capture_editor_window', { windowLabel });
  }

  /** Read text, roles, values, bounds and stable selectors without OCR. */
  async inspectWindow(
    windowLabel = 'main',
    maxElements = 2_000,
  ): Promise<EditorUiSnapshot> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Window UI inspection requires the desktop editor');
    }
    const boundedMaxElements = Number.isFinite(maxElements)
      ? Math.min(5_000, Math.max(50, Math.trunc(maxElements)))
      : 2_000;
    return invoke<EditorUiSnapshot>('inspect_editor_window', {
      windowLabel,
      maxElements: boundedMaxElements,
    });
  }

  /** Execute one allow-listed DOM action without activating the OS window. */
  async interactWindow(
    action: 'click' | 'setValue',
    selector: string,
    windowLabel = 'main',
    value?: string,
  ): Promise<EditorUiActionResult> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Window UI interaction requires the desktop editor');
    }
    if (!selector) {
      throw new BridgeError('INVALID_ARGS', 'Window UI interaction requires a selector');
    }
    const result = await invoke<EditorUiActionResult>('interact_editor_window', {
      windowLabel,
      selector,
      action,
      value,
    });
    if (!result.ok) {
      throw new BridgeError('INVALID_ARGS', result.error ?? 'Editor UI interaction failed');
    }
    return result;
  }

  getEditorState(): EditorState {
    this.observe();
    const store = this.requireStore();
    const snapshot = store.snapshot();
    return {
      mode: store.mode,
      frame: snapshot.frame,
      simulationTime: snapshot.simulationTime,
      gizmo: store.gizmo,
      sceneCamera: store.sceneCamera,
      gameResolution: store.gameResolution,
      canUndo: store.canUndo,
      canRedo: store.canRedo,
      undoLabel: store.undoLabel,
      redoLabel: store.redoLabel,
      sceneName: this.sceneMeta?.sceneName() ?? null,
      dirty: this.sceneMeta?.dirty() ?? false,
      sceneRevision: this.sceneChanges.revision,
      eventSequence: this.events.currentSequence,
    };
  }

  getSelection(): SelectionInfo {
    const store = this.requireStore();
    return { selected: store.selected, selectedIds: store.selectedIds };
  }

  getProjectState(): AgentProjectLifecycleState & {
    editorReady: boolean;
    eventSequence: number;
  } {
    const provider = this.requireProjectLifecycleProvider();
    this.observeProject();
    return {
      ...structuredClone(provider.getState()),
      editorReady: this.store != null && this.editorBootReady,
      eventSequence: this.events.currentSequence,
    };
  }

  async getRecentProjects(): Promise<{
    projects: RecentProjectInfo[];
    count: number;
    limit: number;
  }> {
    try {
      const projects = await this.requireProjectLifecycleProvider().listRecent();
      this.observeProject();
      return {
        projects: structuredClone(projects),
        count: projects.length,
        limit: 12,
      };
    } catch (error) {
      throw projectBridgeError(error);
    }
  }

  getSceneSnapshot(): unknown {
    this.observe(true);
    return {
      ...this.requireStore().snapshot(),
      revision: this.sceneChanges.revision,
    };
  }

  getHierarchy(): HierarchyNode[] {
    const store = this.requireStore();
    const entities = store.snapshot().entities as unknown as EntityView[];
    return buildHierarchy(entities);
  }

  getEntity(idOrName: number | string): EntityView {
    const store = this.requireStore();
    const entities = store.snapshot().entities as unknown as EntityView[];
    const found = typeof idOrName === 'number'
      ? entities.find((e) => e.entity === idOrName)
      : entities.find((e) => (e.name ?? '') === idOrName);
    if (!found) {
      throw new BridgeError('ENTITY_NOT_FOUND', `No entity matches "${String(idOrName)}"`);
    }
    return found;
  }

  findEntities(params: Record<string, unknown>): {
    total: number;
    truncated: boolean;
    entities: Array<{
      id: number;
      name: string;
      parent: number | null;
      active: boolean;
      components: string[];
    }>;
  } {
    const rawName = params.name;
    const rawComponent = params.component;
    const rawActive = params.active;
    const rawLimit = params.limit ?? 100;
    if (rawName !== undefined && (typeof rawName !== 'string' || !rawName.trim())) {
      throw new BridgeError('INVALID_ARGS', '"name" must be a non-empty string');
    }
    if (
      rawComponent !== undefined
      && (typeof rawComponent !== 'string' || !rawComponent.trim())
    ) {
      throw new BridgeError('INVALID_ARGS', '"component" must be a non-empty string');
    }
    if (rawActive !== undefined && typeof rawActive !== 'boolean') {
      throw new BridgeError('INVALID_ARGS', '"active" must be a boolean');
    }
    if (
      typeof rawLimit !== 'number'
      || !Number.isSafeInteger(rawLimit)
      || rawLimit < 1
      || rawLimit > 1_000
    ) {
      throw new BridgeError('INVALID_ARGS', '"limit" must be an integer from 1 to 1000');
    }
    const name = typeof rawName === 'string' ? rawName.trim().toLocaleLowerCase() : null;
    const component = typeof rawComponent === 'string' ? rawComponent.trim() : null;
    const entities = (
      this.requireStore().snapshot().entities as unknown as EntityView[]
    ).filter((entity) => (
      (name == null || (entity.name ?? '').toLocaleLowerCase().includes(name))
      && (
        component == null
        || Object.prototype.hasOwnProperty.call(entity.components ?? {}, component)
      )
      && (rawActive === undefined || (entity.active ?? true) === rawActive)
    ));
    return {
      total: entities.length,
      truncated: entities.length > rawLimit,
      entities: entities.slice(0, rawLimit).map((entity) => ({
        id: entity.entity,
        name: entity.name ?? `Entity ${entity.entity}`,
        parent: entity.parent ?? null,
        active: entity.active ?? true,
        components: Object.keys(entity.components ?? {}),
      })),
    };
  }

  getEntityComponent(entityId: number, type: string): {
    entity: number;
    component: string;
    value: unknown;
  } {
    const entity = this.getEntity(entityId);
    if (!Object.prototype.hasOwnProperty.call(entity.components ?? {}, type)) {
      throw new BridgeError(
        'COMPONENT_NOT_FOUND',
        `Entity ${entityId} has no component "${type}"`,
      );
    }
    return {
      entity: entityId,
      component: type,
      value: structuredClone(entity.components[type]),
    };
  }

  async listWindows(): Promise<EditorWindowInfo[]> {
    if (!isDesktopEditor()) return [];
    return invoke<EditorWindowInfo[]>('list_editor_windows');
  }

  getLogs(query: LogQuery = {}): LogEntry[] {
    return logService.getEntries(query);
  }

  clearLogs(): { ok: true } {
    logService.clear();
    this.clearLogProvider?.();
    return { ok: true };
  }

  /**
   * Compare the live editor with the most recently observed state. App calls
   * this after its normal refresh path, so UI and AgentBridge share one source
   * of truth without polling the foreground window.
   */
  observe(forceScene = false): void {
    const store = this.store;
    if (!store) return;
    const sceneName = this.sceneMeta?.sceneName() ?? null;
    const dirty = this.sceneMeta?.dirty() ?? false;
    const snapshot = store.snapshot();
    const now = Date.now();
    const shouldObserveScene = (
      forceScene
      || store.mode !== 'play'
      || this.sceneChanges.revision === 0
      || now - this.lastPlaySceneObservationAt >= 100
    );
    const sceneDelta = shouldObserveScene
      ? this.sceneChanges.observe(
        sceneName,
        snapshot.entities as unknown as SceneEntityView[],
      )
      : null;
    if (shouldObserveScene && store.mode === 'play') {
      this.lastPlaySceneObservationAt = now;
    }

    let panelLayout: PanelLayoutSnapshot | null = null;
    try {
      panelLayout = this.panelLayoutProvider?.() ?? null;
    } catch {
      panelLayout = null;
    }
    const panelSignature = panelLayout ? JSON.stringify(panelLayout) : null;
    const current: ObservedEditorState = {
      mode: store.mode,
      sceneName,
      dirty,
      selectedIds: [...store.selectedIds],
      panelSignature,
    };
    const previous = this.observedState;

    if (
      sceneDelta
      || !previous
      || previous.sceneName !== current.sceneName
      || previous.dirty !== current.dirty
    ) {
      this.appendEvent('scene.changed', {
        revision: this.sceneChanges.revision,
        sceneName,
        dirty,
        delta: sceneDelta,
      }, now);
    }
    if (!previous || previous.mode !== current.mode) {
      this.appendEvent('mode.changed', {
        previous: previous?.mode ?? null,
        mode: current.mode,
      }, now);
    }
    if (
      !previous
      || !sameNumberArray(previous.selectedIds, current.selectedIds)
    ) {
      this.appendEvent('selection.changed', {
        selected: store.selected,
        selectedIds: current.selectedIds,
      }, now);
    }
    if (
      panelLayout
      && (!previous || previous.panelSignature !== current.panelSignature)
    ) {
      this.appendEvent('panel.changed', panelLayout, now);
    }
    this.observedState = current;
  }

  getEvents(params: Record<string, unknown>): AgentEventPage {
    this.observe();
    const afterSequence = params.afterSequence ?? 0;
    const limit = params.limit ?? 100;
    const rawTopics = params.topics;
    if (
      typeof afterSequence !== 'number'
      || !Number.isSafeInteger(afterSequence)
      || afterSequence < 0
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"afterSequence" must be a non-negative safe integer',
      );
    }
    if (
      typeof limit !== 'number'
      || !Number.isSafeInteger(limit)
      || limit < 1
      || limit > 1_000
    ) {
      throw new BridgeError('INVALID_ARGS', '"limit" must be an integer from 1 to 1000');
    }
    let topics: AgentEventTopic[] | undefined;
    if (rawTopics !== undefined) {
      if (
        !Array.isArray(rawTopics)
        || rawTopics.some((topic) => (
          typeof topic !== 'string'
          || !AGENT_EVENT_TOPICS.includes(topic as AgentEventTopic)
        ))
      ) {
        throw new BridgeError(
          'INVALID_ARGS',
          `"topics" must contain only: ${AGENT_EVENT_TOPICS.join(', ')}`,
        );
      }
      topics = [...new Set(rawTopics as AgentEventTopic[])];
    }
    return this.events.list({ afterSequence, limit, topics });
  }

  getSceneDiff(fromRevision: number): SceneDiff & {
    sceneName: string | null;
    dirty: boolean;
  } {
    this.observe(true);
    if (
      !Number.isSafeInteger(fromRevision)
      || fromRevision < 0
      || fromRevision > this.sceneChanges.revision
    ) {
      throw new BridgeError(
        'INVALID_ARGS',
        `"fromRevision" must be an integer from 0 to ${this.sceneChanges.revision}`,
      );
    }
    const snapshot = this.requireStore().snapshot();
    return {
      ...this.sceneChanges.diff(
        fromRevision,
        snapshot.entities as unknown as SceneEntityView[],
      ),
      sceneName: this.sceneMeta?.sceneName() ?? null,
      dirty: this.sceneMeta?.dirty() ?? false,
    };
  }

  private recordLogEvent(change: LogChange): void {
    if (change.type === 'added') {
      this.appendEvent('log.added', change.entry);
    } else {
      this.appendEvent('log.cleared', {});
    }
  }

  private appendEvent(
    topic: AgentEventTopic,
    data: unknown,
    time = Date.now(),
  ): AgentEvent {
    const event = this.events.append(topic, data, time);
    if (isDesktopEditor()) {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        method: 'event',
        params: event,
      });
      void invoke('agent_bridge_broadcast', { payload }).catch(() => {
        // The cursor-backed journal remains authoritative if no raw WS client
        // is connected or the native broadcast channel is shutting down.
      });
    }
    return event;
  }

  // ── Discoverability ───────────────────────────────────────────────────

  listCommands(): CommandSummary[] {
    return COMMAND_META.map(({ paramsSchema: _paramsSchema, ...summary }) => ({ ...summary }));
  }

  describeCommand(id: string): CommandMeta & { executionOptionsSchema: unknown } {
    const command = COMMAND_META.find((candidate) => candidate.id === id);
    if (!command) {
      throw new BridgeError('INVALID_ARGS', `Unknown command "${id}"`);
    }
    return structuredClone({
      ...command,
      executionOptionsSchema: COMMAND_EXECUTION_OPTIONS_SCHEMA,
    });
  }

  getPanelLayout(): PanelLayoutSnapshot {
    const layout = this.panelLayoutProvider?.() ?? null;
    if (!layout) {
      throw new BridgeError('NOT_READY', 'The main dock workspace is not ready');
    }
    return structuredClone(layout);
  }

  listMenus(root?: string): EditorMenuItemInfo[] {
    const context = this.menuContext();
    const normalizedRoot = root?.trim();
    return listAllMenuItems()
      .filter((entry) => !normalizedRoot || entry.root === normalizedRoot)
      .map((entry) => {
        let enabled = true;
        try {
          enabled = entry.validate?.(context) ?? true;
        } catch {
          enabled = false;
        }
        return {
          path: entry.path,
          root: entry.root,
          label: entry.label,
          segments: [...entry.segments],
          priority: entry.priority,
          shortcut: entry.shortcut ?? null,
          separatorBefore: entry.separatorBefore,
          enabled,
        };
      });
  }

  getScenes(): ReturnType<AgentSceneProvider['list']> {
    return structuredClone(this.requireSceneProvider().list());
  }

  async previewSceneDelete(rawName: string): Promise<AgentSceneDeletePreview> {
    const state = this.requireSceneProvider().list();
    if (!state.ready) {
      throw new BridgeError('NOT_READY', 'Scene library is still loading');
    }
    const requestedName = normalizeSceneName(rawName);
    if (!requestedName) throw new BridgeError('INVALID_ARGS', 'Scene name is invalid');
    const scene = state.scenes.find(
      (candidate) => candidate.name.toLocaleLowerCase() === requestedName.toLocaleLowerCase(),
    );
    if (!scene) {
      throw new BridgeError('INVALID_ARGS', `Scene not found: ${sceneFileName(requestedName)}`);
    }

    const path = sceneAssetPath(scene.name);
    const files = await refreshProjectFiles();
    const asset = findAsset(files, path);
    if (!asset || asset.kind !== 'scene') {
      throw new BridgeError('IO_ERROR', `Scene asset index is missing ${path}`);
    }
    const buildSettings = await bridgeIo(
      'Failed to read Build Settings',
      () => getProjectBuildSettings(),
    );
    const includedInBuildSettings = buildSettings.scenes.some(
      (candidate) => candidate.toLocaleLowerCase() === path.toLocaleLowerCase(),
    );
    const active = state.activeScene?.toLocaleLowerCase() === scene.name.toLocaleLowerCase();
    const blockers = [
      ...(active ? ['The active scene cannot be deleted; open another scene first'] : []),
      ...(includedInBuildSettings
        ? ['The scene is included in Build Settings; remove it before deleting']
        : []),
    ];
    const tokenPlan = {
      operation: 'delete',
      name: scene.name,
      path,
      revision: asset.revision,
      activeScene: state.activeScene,
      buildScenes: buildSettings.scenes,
    };
    return {
      operation: 'delete',
      previewToken: await previewPlanToken(tokenPlan),
      name: scene.name,
      path,
      revision: asset.revision,
      activeScene: state.activeScene,
      includedInBuildSettings,
      blockers,
      permanent: true,
    };
  }

  async listAssets(params: Record<string, unknown> = {}): Promise<{
    total: number;
    truncated: boolean;
    assets: ProjectFileAsset[];
  }> {
    const files = await refreshProjectFiles();
    const search = typeof params.search === 'string'
      ? params.search.trim().toLocaleLowerCase()
      : '';
    const kind = typeof params.kind === 'string' ? params.kind.trim() : '';
    const folder = typeof params.folder === 'string' && params.folder.trim()
      ? normalizeAssetPath(params.folder)
      : '';
    const requestedLimit = typeof params.limit === 'number' && Number.isFinite(params.limit)
      ? Math.trunc(params.limit)
      : 1_000;
    const limit = Math.min(5_000, Math.max(1, requestedLimit));
    const filtered = files
      .filter((asset) => !kind || asset.kind === kind)
      .filter((asset) => !folder || (
        asset.relPath === folder
        || asset.relPath.startsWith(`${folder}/`)
      ))
      .filter((asset) => !search || (
        asset.relPath.toLocaleLowerCase().includes(search)
        || asset.name.toLocaleLowerCase().includes(search)
      ))
      .sort((left, right) => left.relPath.localeCompare(right.relPath));
    return {
      total: filtered.length,
      truncated: filtered.length > limit,
      assets: structuredClone(filtered.slice(0, limit)),
    };
  }

  async readAssetText(path: string, maxBytes = 1_048_576): Promise<{
    path: string;
    revision: string;
    size: number;
    contents: string;
  }> {
    const normalized = normalizeAssetPath(path);
    const boundedMaxBytes = Number.isFinite(maxBytes)
      ? Math.min(8 * 1024 * 1024, Math.max(1, Math.trunc(maxBytes)))
      : 1_048_576;
    const files = await refreshProjectFiles();
    const asset = findAsset(files, normalized);
    if (!asset) throw new BridgeError('IO_ERROR', `Asset not found: ${normalized}`);
    if (!isProjectTextAssetPath(asset.relPath)) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Asset is not a supported text format: ${asset.relPath}`,
      );
    }
    if (asset.size > boundedMaxBytes) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Asset is ${asset.size} bytes, above maxBytes=${boundedMaxBytes}`,
      );
    }
    const read = await bridgeIo(
      `Failed to read ${normalized}`,
      () => readProjectAssetBytesWithRevision(normalized),
    );
    const bytes = read.contents;
    let contents: string;
    try {
      contents = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new BridgeError('INVALID_ARGS', `Asset is not valid UTF-8 text: ${normalized}`);
    }
    return {
      path: asset.relPath,
      revision: read.revision,
      size: bytes.byteLength,
      contents,
    };
  }

  async findAssetReferences(path: string): Promise<unknown> {
    const normalized = normalizeAssetPath(path);
    return bridgeIo(
      `Failed to scan references for ${normalized}`,
      () => findProjectAssetReferences(normalized),
    );
  }

  async importAssetFile(
    sourcePath: string,
    destinationPath: string,
  ): Promise<unknown> {
    const normalized = normalizeAssetPath(destinationPath);
    const leaf = normalized.split('/').pop() ?? '';
    let safeLeaf: string;
    try {
      safeLeaf = validateImportedAssetName(leaf);
    } catch (error) {
      throw new BridgeError(
        'INVALID_ARGS',
        error instanceof Error ? error.message : String(error),
      );
    }
    if (safeLeaf !== leaf) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Import destination file name is unsafe; use "${safeLeaf}"`,
      );
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed();
    const beforeFiles = await refreshProjectFiles();
    if (findAsset(beforeFiles, normalized)) {
      throw new BridgeError(
        'CONFLICT',
        `Import destination already exists: ${normalized}`,
      );
    }
    const imported = await bridgeIo(
      `Failed to import ${sourcePath}`,
      () => importExternalProjectAsset(sourcePath, normalized),
    );
    const [afterFiles] = await Promise.all([
      refreshProjectFiles(),
      refreshSprites(),
    ]);
    const after = findAsset(afterFiles, imported.destinationPath);
    if (!after || after.metaStatus !== 'ready' || !after.guid) {
      throw new BridgeError(
        'IO_ERROR',
        `Import completed but the indexed asset is unhealthy: ${imported.destinationPath}`,
      );
    }
    const change: ProjectAssetChange = {
      type: 'added',
      relPath: after.relPath,
      previous: null,
      current: after,
    };
    window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
      detail: { changes: [change], source: 'agent' },
    }));
    broadcastProjectAssetsChanged({
      action: 'created',
      destinationPath: after.relPath,
    });
    this.logProvider?.(
      `Imported ${imported.sourcePath} to ${after.relPath} from AgentBridge with GUID ${after.guid}`,
    );
    return {
      sourcePath: imported.sourcePath,
      sourceRevision: imported.sourceRevision,
      destinationPath: after.relPath,
      asset: structuredClone(after),
    };
  }

  async writeAssetText(
    path: string,
    contents: string,
    expectedRevision: string | null,
  ): Promise<{ created: boolean; asset: ProjectFileAsset }> {
    const normalized = normalizeAssetPath(path);
    if (!isProjectTextAssetPath(normalized)) {
      throw new BridgeError(
        'INVALID_ARGS',
        `Asset is not a supported text format: ${normalized}`,
      );
    }
    const byteLength = new TextEncoder().encode(contents).byteLength;
    if (byteLength > 8 * 1024 * 1024) {
      throw new BridgeError('INVALID_ARGS', 'Text asset exceeds the 8 MiB agent write limit');
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed();
    const beforeFiles = await refreshProjectFiles();
    const before = findAsset(beforeFiles, normalized);
    if (before) {
      if (expectedRevision !== before.revision) {
        throw new BridgeError(
          'STALE_REVISION',
          `Asset revision changed: expected ${String(expectedRevision)}, current ${before.revision}`,
          { path: before.relPath, expectedRevision, currentRevision: before.revision },
        );
      }
    } else if (expectedRevision !== null) {
      throw new BridgeError(
        'STALE_REVISION',
        `Asset does not exist; expectedRevision must be null when creating ${normalized}`,
      );
    }

    try {
      await writeProjectAssetText(normalized, contents, expectedRevision);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('asset changed on disk since it was loaded')) {
        const current = findAsset(await refreshProjectFiles(), normalized);
        throw new BridgeError(
          'STALE_REVISION',
          `Asset revision changed while writing ${normalized}`,
          {
            path: current?.relPath ?? normalized,
            expectedRevision,
            currentRevision: current?.revision ?? null,
          },
        );
      }
      throw new BridgeError(
        'IO_ERROR',
        message,
      );
    }
    const afterFiles = await refreshProjectFiles();
    const after = findAsset(afterFiles, normalized);
    if (!after) {
      throw new BridgeError('IO_ERROR', `Asset write completed but index is missing ${normalized}`);
    }
    const change: ProjectAssetChange = before
      ? {
          type: 'modified',
          relPath: after.relPath,
          previous: before,
          current: after,
        }
      : {
          type: 'added',
          relPath: after.relPath,
          previous: null,
          current: after,
        };
    window.dispatchEvent(new CustomEvent(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, {
      detail: { changes: [change], source: 'agent' },
    }));
    broadcastProjectAssetsChanged(before
      ? { action: 'modified', sourcePath: after.relPath }
      : { action: 'created', destinationPath: after.relPath });
    this.logProvider?.(`${before ? 'Updated' : 'Created'} ${after.relPath} from AgentBridge`);
    return { created: before == null, asset: structuredClone(after) };
  }

  async getBuildSettings(): Promise<unknown> {
    return bridgeIo('Failed to read Build Settings', () => getProjectBuildSettings());
  }

  async setBuildScenes(requestedScenes: string[]): Promise<ProjectBuildSettings> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Build Settings require the desktop editor');
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed();
    const current = await bridgeIo(
      'Failed to read Build Settings',
      () => getProjectBuildSettings(),
    );
    const availableByKey = new Map(
      current.availableScenes.map((scene) => [scene.toLocaleLowerCase(), scene]),
    );
    const scenes = requestedScenes.map((scene) => {
      const available = availableByKey.get(scene.toLocaleLowerCase());
      if (!available) {
        throw new BridgeError(
          'INVALID_ARGS',
          `Build scene "${scene}" is not available. Query build.settings for availableScenes.`,
          { scene, availableScenes: current.availableScenes },
        );
      }
      return available;
    });
    const result = await bridgeIo(
      'Failed to save Build Settings',
      () => saveProjectBuildSettings(scenes),
    );
    window.dispatchEvent(new CustomEvent(PROJECT_BUILD_SETTINGS_CHANGED_EVENT, {
      detail: result,
    }));
    this.appendEvent('build.settings', result);
    this.logProvider?.(
      `Agent updated Build Settings: ${result.scenes.length} scene(s), entry ${result.mainScene}`,
    );
    return result;
  }

  async getBuildHistory(limit = 20): Promise<unknown> {
    const boundedLimit = Number.isFinite(limit)
      ? Math.min(100, Math.max(1, Math.trunc(limit)))
      : 20;
    const history = await bridgeIo(
      'Failed to read build history',
      () => listPcBuildHistory(),
    );
    return {
      ...history,
      total: history.entries.length,
      entries: history.entries.slice(0, boundedLimit),
      truncated: history.entries.length > boundedLimit,
    };
  }

  getBuildStatus(): { status: 'idle' } | AgentBuildJob {
    return this.buildJob ? structuredClone(this.buildJob) : { status: 'idle' };
  }

  async startBuild(profile: BuildPlayerProfile, clean: boolean): Promise<AgentBuildJob> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Player builds require the desktop editor');
    }
    if (this.buildJob?.status === 'running') {
      throw new BridgeError('CONFLICT', `Build ${this.buildJob.id} is already running`);
    }
    await this.requireWorkspaceProvider().assertDiskMutationAllowed();
    const settings = await bridgeIo(
      'Failed to read Build Settings',
      () => getProjectBuildSettings(),
    );
    if (!settings.scenes.length) {
      throw new BridgeError('INVALID_ARGS', 'Build Settings has no enabled scenes');
    }

    this.stopBuildProgress?.();
    this.stopBuildProgress = null;
    const job: AgentBuildJob = {
      id: crypto.randomUUID(),
      status: 'running',
      profile,
      clean,
      startedAt: Date.now(),
      finishedAt: null,
      progress: null,
      result: null,
      verification: null,
      error: null,
    };
    this.buildJob = job;
    this.appendEvent('build.progress', {
      jobId: job.id,
      status: job.status,
      profile: job.profile,
      clean: job.clean,
    }, job.startedAt);
    try {
      this.stopBuildProgress = await listenToPcBuildProgress((progress) => {
        if (this.buildJob?.id === job.id && this.buildJob.status === 'running') {
          this.buildJob.progress = { ...progress };
          this.appendEvent('build.progress', {
            jobId: job.id,
            status: 'running',
            progress,
          });
        }
      });
    } catch (error) {
      this.logProvider?.(`Build progress listener failed: ${String(error)}`);
    }
    void buildPcPlayer(profile, clean)
      .then((result) => {
        if (this.buildJob?.id !== job.id) return;
        this.buildJob.status = 'succeeded';
        this.buildJob.result = result;
        this.buildJob.finishedAt = Date.now();
        this.appendEvent('build.progress', {
          jobId: job.id,
          status: 'succeeded',
          result,
        }, this.buildJob.finishedAt);
        this.logProvider?.(`Agent build succeeded: ${result.outputDir}`);
      })
      .catch((error) => {
        if (this.buildJob?.id !== job.id) return;
        const message = error instanceof Error ? error.message : String(error);
        this.buildJob.status = message.toLocaleLowerCase().includes('cancel')
          ? 'cancelled'
          : 'failed';
        this.buildJob.error = message;
        this.buildJob.finishedAt = Date.now();
        this.appendEvent('build.progress', {
          jobId: job.id,
          status: this.buildJob.status,
          error: message,
        }, this.buildJob.finishedAt);
        this.logProvider?.(`Agent build ${this.buildJob.status}: ${message}`);
      })
      .finally(() => {
        if (this.buildJob?.id !== job.id) return;
        this.stopBuildProgress?.();
        this.stopBuildProgress = null;
      });
    return structuredClone(job);
  }

  async cancelBuild(): Promise<{ requested: boolean; jobId: string }> {
    if (!this.buildJob || this.buildJob.status !== 'running') {
      throw new BridgeError('CONFLICT', 'No AgentBridge build is currently running');
    }
    const requested = await bridgeIo(
      'Failed to cancel Player build',
      () => cancelPcBuild(),
    );
    if (!requested) {
      throw new BridgeError('CONFLICT', 'The active build did not accept cancellation');
    }
    this.appendEvent('build.progress', {
      jobId: this.buildJob.id,
      status: 'cancellation-requested',
    });
    return { requested: true, jobId: this.buildJob.id };
  }

  async verifyBuild(
    executable: string,
    expectedContentHash: string,
  ): Promise<VerifyPlayerResult> {
    if (!isDesktopEditor()) {
      throw new BridgeError('NOT_READY', 'Published build verification requires the desktop editor');
    }
    if (this.buildJob?.status === 'running') {
      throw new BridgeError(
        'CONFLICT',
        `Build ${this.buildJob.id} is still running; verify it after completion`,
      );
    }
    const verification = await bridgeIo(
      'Published Player verification failed',
      () => verifyPcPlayer(executable, expectedContentHash),
    );
    const job = this.buildJob;
    if (job?.result?.contentHash === verification.contentHash) {
      job.verification = verification;
    }
    this.appendEvent('build.progress', {
      jobId: job?.id ?? null,
      status: 'verified',
      verification,
    });
    this.logProvider?.(
      `Agent verified published Player: ${verification.fileCount} file(s), ${verification.contentHash}`,
    );
    return verification;
  }

  getComponentSchema(type?: string): unknown {
    if (type) {
      const schema = buildAgentComponentSchema(type);
      if (!schema) {
        throw new BridgeError('COMPONENT_NOT_FOUND', `Unknown component type "${type}"`);
      }
      return schema;
    }
    return listAgentComponentSchemas();
  }

  /** Activate a docked panel without raising or focusing any native window. */
  focusPanel(kind: string): boolean {
    if (!CORE_PANEL_IDS.includes(kind as (typeof CORE_PANEL_IDS)[number])) return false;
    window.dispatchEvent(new CustomEvent('mengine:focus-panel', {
      detail: { panel: kind, activateWindow: false },
    }));
    return true;
  }

  resetPanelLayout(): void {
    window.dispatchEvent(new CustomEvent('mengine:reset-dock-layout'));
  }

  async invokeMenu(path: string): Promise<CommandResult> {
    const normalizedPath = path.trim();
    if (!normalizedPath) {
      throw new BridgeError('INVALID_ARGS', '"path" must be a non-empty string');
    }
    const entry = findMenuItem(normalizedPath);
    if (!entry) {
      throw new BridgeError('INVALID_ARGS', `Unknown menu item "${normalizedPath}"`);
    }
    const context = this.menuContext();
    let enabled = true;
    try {
      enabled = entry.validate?.(context) ?? true;
    } catch {
      enabled = false;
    }
    if (!enabled) {
      throw new BridgeError('READONLY', `Menu item "${entry.path}" is currently disabled`);
    }
    await entry.action(context);
    this.refreshProvider?.();
    return { ok: true, data: { path: entry.path } };
  }

  // ── Dispatcher (write commands) ───────────────────────────────────────

  private assertExpectedSceneRevision(expected: number | undefined): void {
    if (expected === undefined) return;
    if (!Number.isSafeInteger(expected) || expected < 0) {
      throw new BridgeError(
        'INVALID_ARGS',
        '"expectedSceneRevision" must be a non-negative safe integer',
      );
    }
    this.observe(true);
    const current = this.sceneChanges.revision;
    if (expected !== current) {
      throw new BridgeError(
        'STALE_REVISION',
        `Scene revision changed: expected ${expected}, current ${current}`,
        { expectedSceneRevision: expected, currentSceneRevision: current },
      );
    }
  }

  async execute(
    commandId: string,
    args: Record<string, unknown> = {},
    options: { screenshot?: boolean; expectedSceneRevision?: number } = {},
  ): Promise<CommandResult> {
    this.assertExpectedSceneRevision(options.expectedSceneRevision);
    if (commandId === 'project.open') {
      const provider = this.requireAvailableProjectLifecycle();
      const editorBootGeneration = this.editorBootGeneration;
      try {
        const operation = provider.open(requiredString(args, 'root'));
        this.observeProject();
        const snapshot = await operation;
        await this.waitForEditorBootAfter(editorBootGeneration);
        this.observeProject();
        return this.finishAsyncCommand(
          { ok: true, data: projectSummary(snapshot) },
          options,
          true,
        );
      } catch (error) {
        this.observeProject();
        throw projectBridgeError(error);
      }
    }
    if (commandId === 'project.create') {
      const provider = this.requireAvailableProjectLifecycle();
      const editorBootGeneration = this.editorBootGeneration;
      try {
        const operation = provider.create(
          requiredString(args, 'parent'),
          requiredString(args, 'name'),
        );
        this.observeProject();
        const snapshot = await operation;
        await this.waitForEditorBootAfter(editorBootGeneration);
        this.observeProject();
        return this.finishAsyncCommand(
          { ok: true, data: projectSummary(snapshot) },
          options,
          true,
        );
      } catch (error) {
        this.observeProject();
        throw projectBridgeError(error);
      }
    }
    if (commandId === 'project.forget_recent') {
      const provider = this.requireProjectLifecycleProvider();
      const state = provider.getState();
      if (state.busy) {
        throw new BridgeError(
          'CONFLICT',
          `Project lifecycle is busy${state.operation ? ` (${state.operation})` : ''}`,
        );
      }
      try {
        const projects = await provider.forgetRecent(
          requiredString(args, 'path'),
        );
        this.observeProject();
        return this.finishAsyncCommand({
          ok: true,
          data: {
            removedPath: requiredString(args, 'path'),
            projects: structuredClone(projects),
          },
        }, options, true);
      } catch (error) {
        this.observeProject();
        throw projectBridgeError(error);
      }
    }
    if (commandId === 'scene.new') {
      const result = await this.requireSceneProvider().create({
        name: requiredString(args, 'name'),
        overwrite: optionalBoolean(args, 'overwrite', false),
        discardDirty: optionalBoolean(args, 'discardDirty', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'scene.open') {
      const result = await this.requireSceneProvider().open({
        name: requiredString(args, 'name'),
        discardDirty: optionalBoolean(args, 'discardDirty', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'scene.save') {
      const result = await this.requireSceneProvider().save({
        name: optionalString(args, 'name'),
        overwrite: optionalBoolean(args, 'overwrite', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'scene.save_all') {
      const result = await this.requireSceneProvider().saveAll({
        unnamedScene: optionalString(args, 'name'),
        overwrite: optionalBoolean(args, 'overwrite', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options);
    }
    if (commandId === 'scene.load_json') {
      const store = this.requireStore();
      if (store.mode !== 'edit') {
        throw new BridgeError(
          'READONLY',
          'scene.load_json is only available in Edit Mode',
        );
      }
      const json = requiredString(args, 'json', true);
      const summary = validateAgentSceneJson(json);
      store.replaceSceneWorldJson(json);
      this.logProvider?.(
        `Agent replaced current scene world: ${summary.entityCount} entities, ${summary.componentCount} components`,
      );
      return this.finishAsyncCommand({ ok: true, data: summary }, options);
    }
    if (commandId === 'scene.rename') {
      await this.requireWorkspaceProvider().assertDiskMutationAllowed();
      let result: Awaited<ReturnType<AgentSceneProvider['rename']>>;
      try {
        result = await this.requireSceneProvider().rename({
          oldName: requiredString(args, 'oldName'),
          newName: requiredString(args, 'newName'),
        });
      } catch (error) {
        throw sceneLifecycleBridgeError(error);
      }
      this.appendEvent('asset.changed', {
        action: 'sceneRenamed',
        sourcePath: sceneAssetPath(result.oldName),
        destinationPath: sceneAssetPath(result.name),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'scene.delete') {
      await this.requireWorkspaceProvider().assertDiskMutationAllowed();
      const expectedPreviewToken = requiredString(args, 'previewToken');
      const preview = await this.previewSceneDelete(requiredString(args, 'name'));
      if (preview.previewToken !== expectedPreviewToken) {
        throw new BridgeError(
          'STALE_REVISION',
          'Scene deletion preview is stale; preview the operation again',
          {
            expectedPreviewToken,
            currentPreviewToken: preview.previewToken,
          },
        );
      }
      if (preview.blockers.length > 0) {
        throw new BridgeError(
          'CONFLICT',
          preview.blockers.join('; '),
          { blockers: preview.blockers },
        );
      }
      let result: Awaited<ReturnType<AgentSceneProvider['delete']>>;
      try {
        result = await this.requireSceneProvider().delete({
          name: preview.name,
          expectedRevision: preview.revision,
        });
      } catch (error) {
        throw sceneLifecycleBridgeError(error);
      }
      this.appendEvent('asset.changed', {
        action: 'sceneDeleted',
        sourcePath: sceneAssetPath(result.name),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.import_file') {
      const result = await this.importAssetFile(
        requiredString(args, 'sourcePath'),
        requiredString(args, 'destinationPath'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.write_text') {
      const expectedRevision = args.expectedRevision;
      if (expectedRevision !== null && typeof expectedRevision !== 'string') {
        throw new BridgeError(
          'INVALID_ARGS',
          '"expectedRevision" must be the current revision string, or null when creating',
        );
      }
      const result = await this.writeAssetText(
        requiredString(args, 'path'),
        requiredString(args, 'contents', true),
        expectedRevision,
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.rename') {
      const result = await (await this.getAssetOperations()).rename({
        sourcePath: requiredString(args, 'sourcePath'),
        destinationPath: requiredString(args, 'destinationPath'),
        previewToken: requiredString(args, 'previewToken'),
        allowManualReferences: optionalBoolean(args, 'allowManualReferences', false),
        allowSkippedFiles: optionalBoolean(args, 'allowSkippedFiles', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.duplicate') {
      const result = await (await this.getAssetOperations()).duplicate({
        sourcePath: requiredString(args, 'sourcePath'),
        destinationPath: requiredString(args, 'destinationPath'),
        previewToken: requiredString(args, 'previewToken'),
        allowManualReferences: optionalBoolean(args, 'allowManualReferences', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.trash') {
      const result = await (await this.getAssetOperations()).trash({
        sourcePath: requiredString(args, 'sourcePath'),
        previewToken: requiredString(args, 'previewToken'),
        allowSkippedFiles: optionalBoolean(args, 'allowSkippedFiles', false),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'asset.restore') {
      const result = await (await this.getAssetOperations()).restore({
        trashId: requiredString(args, 'trashId'),
        expectedRecordRevision: requiredString(args, 'expectedRecordRevision'),
      });
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.settings.set_scenes') {
      const result = await this.setBuildScenes(
        requiredStringArray(args, 'scenes', { nonEmpty: true, unique: true }),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.start') {
      const profile = optionalEnum(
        args,
        'profile',
        ['debug', 'release'] as const,
        'debug',
      );
      const result = await this.startBuild(
        profile,
        optionalBoolean(args, 'clean', true),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'build.cancel') {
      return this.finishAsyncCommand(
        { ok: true, data: await this.cancelBuild() },
        options,
        true,
      );
    }
    if (commandId === 'build.verify') {
      const result = await this.verifyBuild(
        requiredString(args, 'executable'),
        requiredString(args, 'expectedContentHash'),
      );
      return this.finishAsyncCommand({ ok: true, data: result }, options, true);
    }
    if (commandId === 'menu.invoke') {
      const path = typeof args.path === 'string' ? args.path : '';
      const result = await this.invokeMenu(path);
      return this.finishAsyncCommand(result, options, true);
    }
    if (
      commandId === 'window.ui_click'
      || commandId === 'window.ui_set_value'
    ) {
      const action = commandId === 'window.ui_click'
        ? 'click'
        : 'setValue';
      const selector = typeof args.selector === 'string' ? args.selector : '';
      const windowLabel =
        typeof args.windowLabel === 'string' && args.windowLabel ? args.windowLabel : 'main';
      const value = typeof args.value === 'string' ? args.value : undefined;
      const result: CommandResult = {
        ok: true,
        data: await this.interactWindow(action, selector, windowLabel, value),
      };
      return this.finishAsyncCommand(result, options, windowLabel);
    }
    const handler = WRITE_COMMANDS[commandId];
    if (!handler) {
      throw new BridgeError('INVALID_ARGS', `Unknown command "${commandId}"`);
    }
    const ctx: CommandContext = {
      store: this.requireStore(),
      focusPanel: (kind) => this.focusPanel(kind),
      resetPanelLayout: () => this.resetPanelLayout(),
    };
    const result = handler(ctx, args);
    return this.finishAsyncCommand(result, options);
  }

  // ── Unified query entry (called by transports) ────────────────────────

  async query(queryId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    switch (queryId) {
      case 'editor.state':
        return this.getEditorState();
      case 'project.state':
        return this.getProjectState();
      case 'project.recent':
        return this.getRecentProjects();
      case 'selection.get':
        return this.getSelection();
      case 'scene.snapshot':
        return this.getSceneSnapshot();
      case 'scene.diff':
        return this.getSceneDiff(requiredNonNegativeInteger(params, 'fromRevision'));
      case 'scene.hierarchy':
        return this.getHierarchy();
      case 'scene.list':
        return this.getScenes();
      case 'scene.delete_preview':
        return this.previewSceneDelete(requiredString(params, 'name'));
      case 'entity.get':
        return this.getEntity(requireIdOrName(params));
      case 'entity.find':
        return this.findEntities(params);
      case 'entity.get_component':
        return this.getEntityComponent(
          requiredNonNegativeInteger(params, 'id'),
          requiredString(params, 'component'),
        );
      case 'view.screenshot':
        return this.captureViewport(
          (params.target as ViewportTab) ?? 'scene',
          (params.format as 'image/png' | 'image/jpeg') ?? 'image/png',
          params.quality as number | undefined,
        );
      case 'view.window_screenshot':
        return this.captureWindow(
          typeof params.windowLabel === 'string' && params.windowLabel
            ? params.windowLabel
            : 'main',
        );
      case 'window.list':
        return this.listWindows();
      case 'window.ui_snapshot':
        return this.inspectWindow(
          typeof params.windowLabel === 'string' && params.windowLabel
            ? params.windowLabel
            : 'main',
          typeof params.maxElements === 'number' ? params.maxElements : 2_000,
        );
      case 'panel.get_layout':
        return this.getPanelLayout();
      case 'menu.list':
        return this.listMenus(
          typeof params.root === 'string' && params.root.trim()
            ? params.root
            : undefined,
        );
      case 'asset.list':
        return this.listAssets(params);
      case 'asset.read_text':
        return this.readAssetText(
          requiredString(params, 'path'),
          typeof params.maxBytes === 'number' ? params.maxBytes : 1_048_576,
        );
      case 'asset.find_references':
        return this.findAssetReferences(requiredString(params, 'path'));
      case 'asset.rename_preview':
        return (await this.getAssetOperations()).previewRename(
          requiredString(params, 'sourcePath'),
          requiredString(params, 'destinationPath'),
        );
      case 'asset.duplicate_preview':
        return (await this.getAssetOperations()).previewDuplicate(
          requiredString(params, 'sourcePath'),
          requiredString(params, 'destinationPath'),
        );
      case 'asset.trash_preview':
        return (await this.getAssetOperations()).previewTrash(
          requiredString(params, 'sourcePath'),
        );
      case 'asset.trash_list':
        return (await this.getAssetOperations()).listTrash();
      case 'build.settings':
        return this.getBuildSettings();
      case 'build.status':
        return this.getBuildStatus();
      case 'build.history':
        return this.getBuildHistory(
          typeof params.limit === 'number' ? params.limit : 20,
        );
      case 'console.get_logs':
        return this.getLogs({
          level: params.level as LogQuery['level'],
          since: params.since as number | undefined,
          limit: params.limit as number | undefined,
        });
      case 'console.clear':
        return this.clearLogs();
      case 'events.get':
        return this.getEvents(params);
      case 'commands.list':
        return this.listCommands();
      case 'commands.describe':
        return this.describeCommand(requiredString(params, 'id'));
      case 'schema.components':
        return this.getComponentSchema();
      case 'schema.component':
        return this.getComponentSchema(
          typeof params.type === 'string' ? params.type : undefined,
        );
      default:
        throw new BridgeError('INVALID_ARGS', `Unknown query "${queryId}"`);
    }
  }

  private requireStore(): EditorStore {
    if (!this.store || !this.editorBootReady) {
      throw new BridgeError(
        'NOT_READY',
        'AgentBridge editor workspace is still loading',
      );
    }
    return this.store;
  }

  private requireSceneProvider(): AgentSceneProvider {
    const provider = this.sceneProvider?.() ?? null;
    if (!provider) throw new BridgeError('NOT_READY', 'Scene services are not ready');
    return provider;
  }

  private requireWorkspaceProvider(): AgentWorkspaceProvider {
    const provider = this.workspaceProvider?.() ?? null;
    if (!provider) throw new BridgeError('NOT_READY', 'Workspace services are not ready');
    return provider;
  }

  private requireProjectLifecycleProvider(): AgentProjectLifecycleProvider {
    const provider = this.projectLifecycleProvider?.() ?? null;
    if (!provider) {
      throw new BridgeError('NOT_READY', 'Project lifecycle services are not ready');
    }
    return provider;
  }

  private requireAvailableProjectLifecycle(): AgentProjectLifecycleProvider {
    const provider = this.requireProjectLifecycleProvider();
    const state = provider.getState();
    if (state.busy) {
      throw new BridgeError(
        'CONFLICT',
        `Project lifecycle is busy${state.operation ? ` (${state.operation})` : ''}`,
      );
    }
    if (state.ready || state.project) {
      throw new BridgeError(
        'CONFLICT',
        'A project is already open; project switching is blocked to protect unsaved editor state',
        { project: state.project },
      );
    }
    return provider;
  }

  private async getAssetOperations(): Promise<AgentAssetOperations> {
    if (!this.assetOperations) {
      const { AgentAssetOperations } = await import('./assetOperations');
      this.assetOperations = new AgentAssetOperations(
        () => this.requireWorkspaceProvider().assertDiskMutationAllowed(),
        (message) => this.logProvider?.(message),
      );
    }
    return this.assetOperations;
  }

  private async finishAsyncCommand(
    result: CommandResult,
    options: { screenshot?: boolean; expectedSceneRevision?: number },
    wholeWindow: boolean | string = false,
  ): Promise<CommandResult> {
    this.refreshProvider?.();
    if (this.store && this.editorBootReady) {
      this.observe(true);
      result.sceneRevision = this.sceneChanges.revision;
    } else {
      this.observeProject();
    }
    result.eventSequence = this.events.currentSequence;
    if (!options.screenshot) return result;
    await nextFrame();
    try {
      result.screenshot = wholeWindow
        ? await this.captureWindow(typeof wholeWindow === 'string' ? wholeWindow : 'main')
        : this.captureViewport('scene');
    } catch {
      // Screenshot is best-effort; never fail a completed command.
    }
    return result;
  }

  private menuContext(): MenuItemContext {
    const store = this.requireStore();
    return {
      source: 'menu-bar',
      store,
      selectedIds: store.selectedIds,
      contextEntity: store.selected,
      refresh: () => this.refreshProvider?.(),
      log: (message) => {
        if (this.logProvider) this.logProvider(message);
        else logService.log(message, 'info', 'agent-menu');
      },
    };
  }
}

function requiredString(
  args: Record<string, unknown>,
  key: string,
  allowEmpty = false,
): string {
  const value = args[key];
  if (
    typeof value !== 'string'
    || (!allowEmpty && !value.trim())
  ) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be ${allowEmpty ? 'a string' : 'a non-empty string'}`,
    );
  }
  return allowEmpty ? value : value.trim();
}

function requiredStringArray(
  args: Record<string, unknown>,
  key: string,
  options: { nonEmpty?: boolean; unique?: boolean } = {},
): string[] {
  const value = args[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be an array of non-empty strings`,
    );
  }
  const normalized = value.map((item) => (item as string).trim());
  if (options.nonEmpty && normalized.length === 0) {
    throw new BridgeError('INVALID_ARGS', `"${key}" must contain at least one value`);
  }
  if (options.unique) {
    const keys = normalized.map((item) => item.toLocaleLowerCase());
    if (new Set(keys).size !== keys.length) {
      throw new BridgeError('INVALID_ARGS', `"${key}" must not contain duplicates`);
    }
  }
  return normalized;
}

function projectSummary(snapshot: ProjectSnapshot): AgentProjectSummary {
  return {
    id: snapshot.projectId,
    name: snapshot.projectName,
    root: snapshot.projectRoot,
    scenePath: snapshot.scenePath ?? null,
    revision: snapshot.revision,
  };
}

function projectBridgeError(reason: unknown): BridgeError {
  if (reason instanceof BridgeError) return reason;
  const failure = (
    reason
    && typeof reason === 'object'
    && 'code' in reason
    && 'message' in reason
  )
    ? reason as { code: unknown; message: unknown }
    : null;
  const nativeCode = typeof failure?.code === 'string' ? failure.code : '';
  const message = failure
    ? String(failure.message)
    : reason instanceof Error
      ? reason.message
      : String(reason);
  const code = nativeCode === 'noProject'
    ? 'PROJECT_NOT_OPEN'
    : ['invalidProject', 'invalidProjectName', 'invalidPath', 'json', 'scene']
        .includes(nativeCode)
      ? 'INVALID_ARGS'
      : [
          'projectAlreadyExists',
          'staleRevision',
          'projectMismatch',
          'externalSceneModification',
        ].includes(nativeCode)
        ? 'CONFLICT'
        : nativeCode === 'io'
          ? 'IO_ERROR'
          : 'INTERNAL';
  return new BridgeError(code, message, failure ?? undefined);
}

function sceneLifecycleBridgeError(reason: unknown): BridgeError {
  if (reason instanceof BridgeError) return reason;
  const converted = projectBridgeError(reason);
  if (converted.code === 'INVALID_ARGS' && (
    /active scene/i.test(converted.message)
    || /Build Settings/i.test(converted.message)
    || /already exists/i.test(converted.message)
  )) {
    return new BridgeError('CONFLICT', converted.message, converted.data);
  }
  if (converted.code === 'INTERNAL') {
    return new BridgeError('IO_ERROR', converted.message, converted.data);
  }
  return converted;
}

function requiredNonNegativeInteger(
  args: Record<string, unknown>,
  key: string,
): number {
  const value = args[key];
  if (
    typeof value !== 'number'
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be a non-negative safe integer`,
    );
  }
  return value;
}

function optionalString(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  if (args[key] === undefined) return undefined;
  return requiredString(args, key);
}

function optionalBoolean(
  args: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const value = args[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new BridgeError('INVALID_ARGS', `"${key}" must be a boolean`);
  }
  return value;
}

function optionalEnum<T extends string>(
  args: Record<string, unknown>,
  key: string,
  values: readonly T[],
  fallback: T,
): T {
  const value = args[key] ?? fallback;
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new BridgeError(
      'INVALID_ARGS',
      `"${key}" must be one of: ${values.join(', ')}`,
    );
  }
  return value as T;
}

function normalizeAssetPath(path: string): string {
  try {
    return normalizeProjectAssetPath(path);
  } catch (error) {
    throw new BridgeError(
      'INVALID_ARGS',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function sceneAssetPath(name: string): string {
  return `Assets/Scenes/${sceneFileName(name)}`;
}

async function previewPlanToken(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function findAsset(
  files: readonly ProjectFileAsset[],
  normalizedPath: string,
): ProjectFileAsset | null {
  const key = normalizedPath.toLocaleLowerCase();
  return files.find((asset) => asset.relPath.toLocaleLowerCase() === key) ?? null;
}

async function bridgeIo<T>(label: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new BridgeError('IO_ERROR', `${label}: ${detail}`);
  }
}

function requireIdOrName(params: Record<string, unknown>): number | string {
  if (typeof params.id === 'number') return params.id;
  if (typeof params.name === 'string' && params.name) return params.name;
  throw new BridgeError('INVALID_ARGS', 'entity.get requires a numeric "id" or string "name"');
}

/** Build a full hierarchy tree from flat entities, sorted by siblingIndex. */
function buildHierarchy(entities: EntityView[]): HierarchyNode[] {
  const childrenByParent = new Map<number | null, EntityView[]>();
  for (const entity of entities) {
    const parent = entity.parent ?? null;
    const bucket = childrenByParent.get(parent);
    if (bucket) bucket.push(entity);
    else childrenByParent.set(parent, [entity]);
  }
  for (const bucket of childrenByParent.values()) {
    bucket.sort((a, b) => (a.siblingIndex ?? 0) - (b.siblingIndex ?? 0));
  }
  const toNode = (entity: EntityView): HierarchyNode => ({
    id: entity.entity,
    name: entity.name ?? `Entity ${entity.entity}`,
    active: entity.active ?? true,
    components: Object.keys(entity.components ?? {}),
    children: (childrenByParent.get(entity.entity) ?? []).map(toNode),
  });
  return (childrenByParent.get(null) ?? []).map(toNode);
}

function sameNumberArray(left: readonly number[], right: readonly number[]): boolean {
  return (
    left.length === right.length
    && left.every((value, index) => value === right[index])
  );
}

/** Resolve on the next animation frame (so the viewport can redraw). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 16);
    }
  });
}

/** The process-wide bridge singleton, wired up by App.tsx. */
export const agentBridge = new AgentBridge();
