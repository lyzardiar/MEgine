import type { ReactNode } from 'react';
import type { EditorStore } from '../store';

export type MenuItemSource = 'menu-bar' | 'hierarchy';

/** Runtime context passed to Unity-style menu commands. */
export type MenuItemContext = {
  source: MenuItemSource;
  store: EditorStore;
  /** Selection snapshot when the menu is rendered. */
  selectedIds: readonly number[];
  /** Object that opened a context menu, or the primary selection in the menu bar. */
  contextEntity: number | null;
  refresh: () => void;
  log: (message: string) => void;
};

export type MenuItemAction = (context: MenuItemContext) => void | Promise<void>;
export type MenuItemValidate = (context: MenuItemContext) => boolean;

export type MenuItemOptions = {
  /** Smaller values are displayed first, matching Unity MenuItem priority. */
  priority?: number;
  shortcut?: string;
  /** Draw a separator immediately before this item or its root submenu. */
  separatorBefore?: boolean;
  validate?: MenuItemValidate;
};

export type MenuItemEntry = {
  /** Full path e.g. Window/Decorator Gallery */
  path: string;
  /** Root menu name e.g. Window */
  root: string;
  /** Leaf display label. */
  label: string;
  /** All normalized path segments, including root. */
  segments: readonly string[];
  action: MenuItemAction;
  priority: number;
  shortcut?: string;
  separatorBefore: boolean;
  validate?: MenuItemValidate;
};

export type EditorWindowInstance = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  render: () => ReactNode;
  onClose?: () => void;
};

export type EditorWindowDefinition = {
  typeId: string;
  title: string;
  width: number;
  height: number;
  render: () => ReactNode;
};

type Listener = () => void;

const menuItems: MenuItemEntry[] = [];
const pendingMenuValidators = new Map<string, MenuItemValidate>();
const listeners = new Set<Listener>();
const menuListeners = new Set<Listener>();
let windows: EditorWindowInstance[] = [];
let idSeq = 1;
let menuRevision = 0;
const windowTypes = new Map<string, () => EditorWindowDefinition>();

export function registerEditorWindowType(
  typeId: string,
  factory: () => EditorWindowDefinition,
): () => void {
  windowTypes.set(typeId, factory);
  return () => {
    if (windowTypes.get(typeId) === factory) windowTypes.delete(typeId);
  };
}

export function createRegisteredEditorWindow(typeId: string): EditorWindowDefinition | null {
  return windowTypes.get(typeId)?.() ?? null;
}

function notify() {
  for (const l of listeners) l();
}

export function subscribeEditorWindows(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getOpenEditorWindows(): EditorWindowInstance[] {
  return windows;
}

function normalizeMenuPath(path: string): { path: string; parts: string[] } | null {
  const parts = path.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    console.warn(`[MenuItem] path needs Root/Label, got: ${path}`);
    return null;
  }
  return { path: parts.join('/'), parts };
}

function notifyMenuChanged() {
  menuRevision += 1;
  for (const listener of menuListeners) listener();
}

/**
 * Register or replace a menu command. Paths create popup submenus automatically.
 * Returns an unregister callback suitable for extensions and hot reload.
 */
export function registerMenuItem(
  path: string,
  action: MenuItemAction,
  options: MenuItemOptions = {},
): () => void {
  const normalized = normalizeMenuPath(path);
  if (!normalized) return () => undefined;
  const { path: normalizedPath, parts } = normalized;
  const root = parts[0];
  const label = parts[parts.length - 1];
  // replace existing same path
  const idx = menuItems.findIndex((m) => m.path === normalizedPath);
  const previous = idx >= 0 ? menuItems[idx] : undefined;
  const entry: MenuItemEntry = {
    path: normalizedPath,
    root,
    label,
    segments: parts,
    action,
    priority: options.priority ?? previous?.priority ?? 1000,
    shortcut: options.shortcut ?? previous?.shortcut,
    separatorBefore: options.separatorBefore ?? previous?.separatorBefore ?? false,
    validate:
      options.validate ?? previous?.validate ?? pendingMenuValidators.get(normalizedPath),
  };
  if (idx >= 0) menuItems[idx] = entry;
  else menuItems.push(entry);
  notifyMenuChanged();

  return () => {
    const current = menuItems.findIndex((item) => item === entry);
    if (current < 0) return;
    menuItems.splice(current, 1);
    notifyMenuChanged();
  };
}

/** Register the Unity-style validation method independently from its command. */
export function registerMenuItemValidator(path: string, validate: MenuItemValidate): () => void {
  const normalized = normalizeMenuPath(path);
  if (!normalized) return () => undefined;
  const normalizedPath = normalized.path;
  pendingMenuValidators.set(normalizedPath, validate);
  const entry = menuItems.find((item) => item.path === normalizedPath);
  if (entry) entry.validate = validate;
  notifyMenuChanged();

  return () => {
    if (pendingMenuValidators.get(normalizedPath) === validate) {
      pendingMenuValidators.delete(normalizedPath);
    }
    const current = menuItems.find((item) => item.path === normalizedPath);
    if (current?.validate === validate) current.validate = undefined;
    notifyMenuChanged();
  };
}

export function listMenuItems(root: string): MenuItemEntry[] {
  return menuItems
    .filter((item) => item.root === root)
    .sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
}

export function subscribeMenuItems(fn: Listener): () => void {
  menuListeners.add(fn);
  return () => menuListeners.delete(fn);
}

export function getMenuRevision(): number {
  return menuRevision;
}

export function openEditorWindow(win: Omit<EditorWindowInstance, 'id'> & { id?: string }) {
  const id = win.id ?? `ew-${idSeq++}`;
  const existing = windows.findIndex((w) => w.id === id);
  const next: EditorWindowInstance = {
    id,
    title: win.title,
    x: win.x,
    y: win.y,
    width: win.width,
    height: win.height,
    render: win.render,
    onClose: win.onClose,
  };
  if (existing >= 0) {
    windows = [...windows];
    windows[existing] = { ...windows[existing], ...next };
  } else {
    windows = [...windows, next];
  }
  notify();
  return id;
}

export function closeEditorWindow(id: string) {
  const w = windows.find((x) => x.id === id);
  windows = windows.filter((x) => x.id !== id);
  w?.onClose?.();
  notify();
}

export function updateEditorWindow(
  id: string,
  patch: Partial<Pick<EditorWindowInstance, 'x' | 'y' | 'width' | 'height' | 'title'>>,
) {
  windows = windows.map((w) => (w.id === id ? { ...w, ...patch } : w));
  notify();
}

export function focusEditorWindow(id: string) {
  const idx = windows.findIndex((x) => x.id === id);
  if (idx < 0) return;
  // Already topmost — skip notify to avoid render storms
  if (idx === windows.length - 1) return;
  const w = windows[idx];
  windows = [...windows.filter((x) => x.id !== id), w];
  notify();
}
