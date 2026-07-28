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
import { isDesktopEditor } from '../transport/editorTransport';
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
import { logService, type LogEntry, type LogQuery } from './LogService';
import { WRITE_COMMANDS, COMMAND_META, type CommandContext, type CommandResult, type CommandMeta } from './commands';
import { getComponentCatalog } from '../componentCatalog';
import {
  findMenuItem,
  listAllMenuItems,
  type MenuItemContext,
} from '../editorWindow/registry';
import { CORE_PANEL_IDS } from '../panels/detachedPanelWindow';

type CaptureFn = (
  format: 'image/png' | 'image/jpeg',
  quality?: number,
) => ScreenshotResult | null;

interface SceneMetaProviders {
  sceneName: () => string | null;
  dirty: () => boolean;
}

interface EntityView {
  entity: number;
  name?: string | null;
  parent?: number | null;
  siblingIndex?: number;
  active?: boolean;
  components: Record<string, unknown>;
}

class AgentBridge {
  private store: EditorStore | null = null;
  private sceneMeta: SceneMetaProviders | null = null;
  private captures = new Map<ViewportTab, CaptureFn>();
  private refreshProvider: (() => void) | null = null;
  private logProvider: ((message: string) => void) | null = null;
  private panelLayoutProvider: (() => PanelLayoutSnapshot | null) | null = null;

  /** Wire the bridge to the live editor store. Called once from App. */
  connect(store: EditorStore): void {
    this.store = store;
  }

  /** Provide scene name / dirty state, which live in React (App) not the store. */
  connectSceneMeta(providers: SceneMetaProviders): void {
    this.sceneMeta = providers;
  }

  /** Wire the UI refresh callback, invoked after every write command. */
  connectRefresh(refresh: () => void): void {
    this.refreshProvider = refresh;
  }

  connectLog(log: (message: string) => void): void {
    this.logProvider = log;
  }

  connectPanelLayout(provider: () => PanelLayoutSnapshot | null): void {
    this.panelLayoutProvider = provider;
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
    const store = this.requireStore();
    return {
      mode: store.mode,
      gizmo: store.gizmo,
      canUndo: store.canUndo,
      canRedo: store.canRedo,
      undoLabel: store.undoLabel,
      redoLabel: store.redoLabel,
      sceneName: this.sceneMeta?.sceneName() ?? null,
      dirty: this.sceneMeta?.dirty() ?? false,
    };
  }

  getSelection(): SelectionInfo {
    const store = this.requireStore();
    return { selected: store.selected, selectedIds: store.selectedIds };
  }

  getSceneSnapshot(): unknown {
    return this.requireStore().snapshot();
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

  async listWindows(): Promise<EditorWindowInfo[]> {
    if (!isDesktopEditor()) return [];
    return invoke<EditorWindowInfo[]>('list_editor_windows');
  }

  getLogs(query: LogQuery = {}): LogEntry[] {
    return logService.getEntries(query);
  }

  clearLogs(): { ok: true } {
    logService.clear();
    return { ok: true };
  }

  // ── Discoverability ───────────────────────────────────────────────────

  listCommands(): CommandMeta[] {
    return COMMAND_META.map((meta) => ({ ...meta }));
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

  getComponentSchema(type?: string): unknown {
    const catalog = getComponentCatalog();
    const build = (entry: { type: string; label: string; description: string; create: () => Record<string, unknown>; requires?: string[] }) => {
      let defaults: Record<string, unknown> = {};
      try {
        defaults = entry.create() ?? {};
      } catch {
        defaults = {};
      }
      return {
        type: entry.type,
        label: entry.label,
        description: entry.description,
        requires: entry.requires ?? [],
        fields: Object.entries(defaults).map(([name, value]) => ({
          name,
          type: inferFieldType(value),
          default: value,
        })),
      };
    };
    if (type) {
      const entry = catalog.find((e) => e.type === type);
      if (!entry) throw new BridgeError('COMPONENT_NOT_FOUND', `Unknown component type "${type}"`);
      return build(entry);
    }
    return catalog.map(build);
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

  async execute(
    commandId: string,
    args: Record<string, unknown> = {},
    options: { screenshot?: boolean } = {},
  ): Promise<CommandResult> {
    if (commandId === 'menu.invoke') {
      const path = typeof args.path === 'string' ? args.path : '';
      const result = await this.invokeMenu(path);
      await nextFrame();
      if (options.screenshot) {
        try {
          result.screenshot = await this.captureWindow('main');
        } catch {
          // Screenshot is best-effort; never fail a completed menu action.
        }
      }
      return result;
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
      await nextFrame();
      if (options.screenshot) {
        try {
          result.screenshot = await this.captureWindow(windowLabel);
        } catch {
          // Screenshot is best-effort; never fail a completed interaction.
        }
      }
      return result;
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
    this.refreshProvider?.();
    if (options.screenshot) {
      // Let the viewport redraw before capturing the visual result.
      await nextFrame();
      try {
        result.screenshot = this.captureViewport('scene');
      } catch {
        // Screenshot is best-effort; never fail the command over it.
      }
    }
    return result;
  }

  // ── Unified query entry (called by transports) ────────────────────────

  async query(queryId: string, params: Record<string, unknown> = {}): Promise<unknown> {
    switch (queryId) {
      case 'editor.state':
        return this.getEditorState();
      case 'selection.get':
        return this.getSelection();
      case 'scene.snapshot':
        return this.getSceneSnapshot();
      case 'scene.hierarchy':
        return this.getHierarchy();
      case 'entity.get':
        return this.getEntity(requireIdOrName(params));
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
      case 'console.get_logs':
        return this.getLogs({
          level: params.level as LogQuery['level'],
          since: params.since as number | undefined,
          limit: params.limit as number | undefined,
        });
      case 'console.clear':
        return this.clearLogs();
      case 'commands.list':
        return this.listCommands();
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
    if (!this.store) {
      throw new BridgeError('NOT_READY', 'AgentBridge is not connected to an editor store');
    }
    return this.store;
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

/** Infer a coarse field type from a component default value. */
function inferFieldType(value: unknown): string {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) {
    if (value.length >= 2 && value.length <= 4 && value.every((v) => typeof v === 'number')) {
      return `vec${value.length}`;
    }
    return 'array';
  }
  if (value === null || value === undefined) return 'null';
  return 'object';
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
