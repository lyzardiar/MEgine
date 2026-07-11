import type { ReactNode } from 'react';

export type MenuItemEntry = {
  /** Full path e.g. Window/Decorator Gallery */
  path: string;
  /** Root menu name e.g. Window */
  root: string;
  /** Display label under root */
  label: string;
  action: () => void;
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

type Listener = () => void;

const menuItems: MenuItemEntry[] = [];
const listeners = new Set<Listener>();
let windows: EditorWindowInstance[] = [];
let idSeq = 1;

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

export function registerMenuItem(path: string, action: () => void) {
  const parts = path.split('/').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    console.warn(`[MenuItem] path needs Root/Label, got: ${path}`);
    return;
  }
  const root = parts[0];
  const label = parts.slice(1).join('/');
  // replace existing same path
  const idx = menuItems.findIndex((m) => m.path === path);
  const entry: MenuItemEntry = { path, root, label, action };
  if (idx >= 0) menuItems[idx] = entry;
  else menuItems.push(entry);
}

export function listMenuItems(root: string): MenuItemEntry[] {
  return menuItems.filter((m) => m.root === root);
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
