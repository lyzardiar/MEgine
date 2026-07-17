import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isDesktopEditor, isPrimaryPointerDown } from '../transport/editorTransport';

export const CORE_PANEL_IDS = [
  'hierarchy',
  'scene',
  'game',
  'inspector',
  'project',
  'console',
  'timeline',
] as const;

export type CorePanelId = (typeof CORE_PANEL_IDS)[number];

const PANEL_TITLES: Record<CorePanelId, string> = {
  hierarchy: 'Hierarchy',
  scene: 'Scene',
  game: 'Game',
  inspector: 'Inspector / Property',
  project: 'Project',
  console: 'Console',
  timeline: 'Timeline',
};

const CHANNEL_NAME = 'mengine.editor.panels.v1';
const DETACHED_KEY = 'mengine.editor.detached-panels.v1';

export type PanelWindowMessage =
  | { type: 'panel-opened'; panel: CorePanelId }
  | { type: 'panel-closed'; panel: CorePanelId }
  | { type: 'panel-drag-started'; panel: CorePanelId }
  | { type: 'panel-drag-finished'; panel: CorePanelId }
  | { type: 'panel-dock-requested'; panel: CorePanelId };

export function panelFromLocation(): CorePanelId | null {
  const panel = new URLSearchParams(window.location.search).get('detachedPanel');
  return CORE_PANEL_IDS.includes(panel as CorePanelId) ? panel as CorePanelId : null;
}

export function createPanelChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
}

export function readDetachedPanels(): Set<CorePanelId> {
  if (!isDesktopEditor()) return new Set();
  try {
    const value = JSON.parse(localStorage.getItem(DETACHED_KEY) ?? '[]') as unknown;
    if (!Array.isArray(value)) return new Set();
    return new Set(value.filter((panel): panel is CorePanelId => CORE_PANEL_IDS.includes(panel)));
  } catch {
    return new Set();
  }
}

export function setDetachedPanelOpen(panel: CorePanelId, open: boolean): void {
  if (!isDesktopEditor()) return;
  const panels = readDetachedPanels();
  if (open) panels.add(panel);
  else panels.delete(panel);
  localStorage.setItem(DETACHED_KEY, JSON.stringify([...panels]));
}

export async function reconcileDetachedPanels(): Promise<CorePanelId[]> {
  if (!isDesktopEditor()) return [];
  const stale: CorePanelId[] = [];
  for (const panel of readDetachedPanels()) {
    if (!(await WebviewWindow.getByLabel(`panel-${panel}`))) {
      stale.push(panel);
      setDetachedPanelOpen(panel, false);
    }
  }
  return stale;
}

export function announceDetachedPanelClosed(panel: CorePanelId): void {
  setDetachedPanelOpen(panel, false);
  const channel = createPanelChannel();
  channel?.postMessage({ type: 'panel-closed', panel } satisfies PanelWindowMessage);
  channel?.close();
}

function postPanelMessage(message: PanelWindowMessage): void {
  const channel = createPanelChannel();
  channel?.postMessage(message);
  channel?.close();
}

/** Dock immediately into the main window's first available tab group. */
export function requestPanelDock(panel: CorePanelId): void {
  postPanelMessage({ type: 'panel-dock-requested', panel });
  if (!isDesktopEditor()) window.setTimeout(() => window.close(), 50);
}

/**
 * Drag the native floating window. While it moves, the main WebView samples the
 * global cursor and previews the matching dock leaf. Releasing over that leaf
 * docks the panel; releasing elsewhere leaves it floating.
 */
export async function dragDetachedPanelWindow(panel: CorePanelId): Promise<void> {
  if (!isDesktopEditor()) return;
  const channel = createPanelChannel();
  channel?.postMessage({ type: 'panel-drag-started', panel } satisfies PanelWindowMessage);
  try {
    let sawPointerDown = await isPrimaryPointerDown();
    await getCurrentWindow().startDragging();
    const startedAt = performance.now();
    while (performance.now() - startedAt < 30_000) {
      const down = await isPrimaryPointerDown();
      sawPointerDown ||= down;
      if (sawPointerDown && !down) break;
      if (!sawPointerDown && performance.now() - startedAt > 250) break;
      await new Promise((resolve) => window.setTimeout(resolve, 25));
    }
  } finally {
    channel?.postMessage({ type: 'panel-drag-finished', panel } satisfies PanelWindowMessage);
    channel?.close();
  }
}

export async function closeDetachedPanelWindow(panel: CorePanelId): Promise<void> {
  if (!isDesktopEditor()) return;
  const window = await WebviewWindow.getByLabel(`panel-${panel}`);
  if (window) await window.close();
}

export async function detachPanelWindow(
  panel: CorePanelId,
  screenPosition?: { x: number; y: number },
): Promise<boolean> {
  const url = `/?detachedPanel=${encodeURIComponent(panel)}`;
  const width = panel === 'hierarchy' || panel === 'inspector' ? 440 : 920;
  const height = panel === 'console' || panel === 'project' || panel === 'timeline' ? 480 : 720;

  if (!isDesktopEditor()) {
    const popup = window.open(
      url,
      `mengine-panel-${panel}`,
      `popup=yes,width=${width},height=${height},resizable=yes`,
    );
    return popup != null;
  }

  const label = `panel-${panel}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    setDetachedPanelOpen(panel, true);
    await existing.show();
    await existing.setFocus();
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const webview = new WebviewWindow(label, {
      url,
      title: `MEngine - ${PANEL_TITLES[panel]}`,
      width,
      height,
      x: screenPosition?.x,
      y: screenPosition?.y,
      decorations: false,
      resizable: true,
      focus: true,
    });
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    void webview.once('tauri://created', () => {
      setDetachedPanelOpen(panel, true);
      finish(true);
    });
    void webview.once('tauri://error', (event) => {
      console.error(`Failed to detach ${panel}`, event.payload);
      finish(false);
    });
    window.setTimeout(() => finish(false), 5000);
  });
}

export async function closeAllDetachedPanelWindows(): Promise<void> {
  if (!isDesktopEditor()) return;
  await Promise.all(CORE_PANEL_IDS.map(async (panel) => {
    const window = await WebviewWindow.getByLabel(`panel-${panel}`);
    if (window) await window.close();
  }));
}
