import { useSyncExternalStore } from 'react';

export type EditorTheme = 'dark' | 'light';

const THEME_STORAGE_KEY = 'mengine.editor.theme.v1';

const listeners = new Set<() => void>();
let currentTheme: EditorTheme = readInitialTheme();

function readInitialTheme(): EditorTheme {
  try {
    const saved = window.localStorage?.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage failures in SSR / restricted WebViews.
  }
  return 'dark';
}

function applyThemeToDocument(theme: EditorTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function initializeTheme(): EditorTheme {
  currentTheme = readInitialTheme();
  applyThemeToDocument(currentTheme);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next: EditorTheme = event.newValue === 'light' ? 'light' : 'dark';
      if (next !== currentTheme) {
        currentTheme = next;
        applyThemeToDocument(next);
        notify();
      }
    });
  }
  return currentTheme;
}

export function getTheme(): EditorTheme {
  return currentTheme;
}

export function setTheme(theme: EditorTheme): void {
  if (theme === currentTheme) {
    applyThemeToDocument(theme);
    return;
  }
  currentTheme = theme;
  applyThemeToDocument(theme);
  try {
    window.localStorage?.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore persistence error.
  }
  notify();
}

export function toggleTheme(): EditorTheme {
  const next: EditorTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): {
  theme: EditorTheme;
  setTheme: (theme: EditorTheme) => void;
  toggleTheme: () => EditorTheme;
} {
  const theme = useSyncExternalStore<EditorTheme>(subscribeTheme, getTheme, () => 'dark');
  return { theme, setTheme, toggleTheme };
}
