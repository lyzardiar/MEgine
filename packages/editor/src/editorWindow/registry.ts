import type { ReactNode } from 'react';
import type { EditorStore } from '../store';

export type MenuItemSource = 'menu-bar' | 'hierarchy' | 'agent';

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
  /** False when generic Agent invocation would require foreground input or bypass a safer domain tool. */
  agentInvokable?: boolean;
  /** Agent-facing domain tool to use instead of this menu item. */
  agentAlternative?: string;
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
  agentInvokable: boolean;
  agentAlternative?: string;
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

export type EditorWindowTypeInfo = Omit<EditorWindowDefinition, 'render'>;

type Listener = () => void;

type MenuRegistration = {
  entry: MenuItemEntry;
  declaredValidate?: MenuItemValidate;
};

type MenuValidatorRegistration = {
  validate: MenuItemValidate;
};

const menuItems: MenuItemEntry[] = [];
const menuRegistrations = new Map<string, MenuRegistration[]>();
const menuValidatorRegistrations = new Map<string, MenuValidatorRegistration[]>();
const listeners = new Set<Listener>();
const menuListeners = new Set<Listener>();
const windowTypeListeners = new Set<Listener>();
let windows: EditorWindowInstance[] = [];
let idSeq = 1;
let menuRevision = 0;
let windowTypeRevision = 0;
const windowTypeRegistrations = new Map<string, Array<() => EditorWindowDefinition>>();

function notifyWindowTypesChanged() {
  windowTypeRevision += 1;
  for (const listener of windowTypeListeners) listener();
}

export function registerEditorWindowType(
  typeId: string,
  factory: () => EditorWindowDefinition,
): () => void {
  const registrations = windowTypeRegistrations.get(typeId) ?? [];
  registrations.push(factory);
  windowTypeRegistrations.set(typeId, registrations);
  notifyWindowTypesChanged();
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const current = windowTypeRegistrations.get(typeId);
    if (!current) return;
    const index = current.indexOf(factory);
    if (index < 0) return;
    const wasCurrent = index === current.length - 1;
    current.splice(index, 1);
    if (current.length === 0) windowTypeRegistrations.delete(typeId);
    if (wasCurrent) notifyWindowTypesChanged();
  };
}

export function createRegisteredEditorWindow(typeId: string): EditorWindowDefinition | null {
  return windowTypeRegistrations.get(typeId)?.at(-1)?.() ?? null;
}

export function listRegisteredEditorWindowTypes(): EditorWindowTypeInfo[] {
  return [...windowTypeRegistrations.entries()]
    .map(([typeId, registrations]) => {
      const definition = registrations.at(-1)!();
      return {
        typeId,
        title: definition.title,
        width: definition.width,
        height: definition.height,
      };
    })
    .sort((left, right) => left.typeId.localeCompare(right.typeId));
}

export function subscribeEditorWindowTypes(fn: Listener): () => void {
  windowTypeListeners.add(fn);
  return () => windowTypeListeners.delete(fn);
}

export function getEditorWindowTypeRevision(): number {
  return windowTypeRevision;
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

function activeMenuValidator(path: string): MenuItemValidate | undefined {
  return menuValidatorRegistrations.get(path)?.at(-1)?.validate;
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
  const registrations = menuRegistrations.get(normalizedPath) ?? [];
  const previousRegistration = registrations.at(-1);
  const previous = previousRegistration?.entry;
  const declaredValidate = options.validate ?? previousRegistration?.declaredValidate;
  const idx = menuItems.findIndex((m) => m.path === normalizedPath);
  const entry: MenuItemEntry = {
    path: normalizedPath,
    root,
    label,
    segments: parts,
    action,
    priority: options.priority ?? previous?.priority ?? 1000,
    shortcut: options.shortcut ?? previous?.shortcut,
    separatorBefore: options.separatorBefore ?? previous?.separatorBefore ?? false,
    validate: activeMenuValidator(normalizedPath) ?? declaredValidate,
    agentInvokable: options.agentInvokable ?? false,
    agentAlternative: options.agentAlternative,
  };
  const registration = { entry, declaredValidate };
  registrations.push(registration);
  menuRegistrations.set(normalizedPath, registrations);
  if (idx >= 0) menuItems[idx] = entry;
  else menuItems.push(entry);
  notifyMenuChanged();

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const currentRegistrations = menuRegistrations.get(normalizedPath);
    if (!currentRegistrations) return;
    const registrationIndex = currentRegistrations.indexOf(registration);
    if (registrationIndex < 0) return;
    const wasCurrent = registrationIndex === currentRegistrations.length - 1;
    currentRegistrations.splice(registrationIndex, 1);
    if (currentRegistrations.length === 0) menuRegistrations.delete(normalizedPath);
    if (!wasCurrent) return;

    const current = menuItems.findIndex((item) => item === entry);
    if (current < 0) return;
    const restored = currentRegistrations.at(-1);
    if (restored) {
      restored.entry.validate =
        activeMenuValidator(normalizedPath) ?? restored.declaredValidate;
      menuItems[current] = restored.entry;
    } else {
      menuItems.splice(current, 1);
    }
    notifyMenuChanged();
  };
}

/** Register the Unity-style validation method independently from its command. */
export function registerMenuItemValidator(path: string, validate: MenuItemValidate): () => void {
  const normalized = normalizeMenuPath(path);
  if (!normalized) return () => undefined;
  const normalizedPath = normalized.path;
  const validators = menuValidatorRegistrations.get(normalizedPath) ?? [];
  const registration = { validate };
  validators.push(registration);
  menuValidatorRegistrations.set(normalizedPath, validators);
  const menuRegistration = menuRegistrations.get(normalizedPath)?.at(-1);
  if (menuRegistration) menuRegistration.entry.validate = validate;
  notifyMenuChanged();

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    const currentValidators = menuValidatorRegistrations.get(normalizedPath);
    if (!currentValidators) return;
    const registrationIndex = currentValidators.indexOf(registration);
    if (registrationIndex < 0) return;
    currentValidators.splice(registrationIndex, 1);
    if (currentValidators.length === 0) {
      menuValidatorRegistrations.delete(normalizedPath);
    }
    const currentMenuRegistration = menuRegistrations.get(normalizedPath)?.at(-1);
    if (currentMenuRegistration) {
      currentMenuRegistration.entry.validate =
        activeMenuValidator(normalizedPath) ?? currentMenuRegistration.declaredValidate;
    }
    notifyMenuChanged();
  };
}

export function listMenuItems(root: string): MenuItemEntry[] {
  return menuItems
    .filter((item) => item.root === root)
    .sort((a, b) => a.priority - b.priority || a.path.localeCompare(b.path));
}

export function listAllMenuItems(): MenuItemEntry[] {
  return [...menuItems]
    .sort((a, b) =>
      a.root.localeCompare(b.root)
      || a.priority - b.priority
      || a.path.localeCompare(b.path));
}

export function findMenuItem(path: string): MenuItemEntry | null {
  const normalized = normalizeMenuPath(path);
  if (!normalized) return null;
  return menuItems.find((item) => item.path === normalized.path) ?? null;
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
    windows = [
      ...windows.filter((_, index) => index !== existing),
      { ...windows[existing], ...next },
    ];
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
