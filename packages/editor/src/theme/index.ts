import { useSyncExternalStore } from 'react';

export type EditorTheme = 'dark' | 'light';
export type EditorAccent = 'pink' | 'cobalt' | 'emerald';
export type EditorDensity = 'compact' | 'standard' | 'comfortable';

const THEME_STORAGE_KEY = 'mengine.editor.theme.v1';
const ACCENT_STORAGE_KEY = 'mengine.editor.accent.v1';
const DENSITY_STORAGE_KEY = 'mengine.editor.density.v1';
const FONT_SIZE_STORAGE_KEY = 'mengine.editor.fontSize.v1';

const ACCENT_CYCLE: readonly EditorAccent[] = ['pink', 'cobalt', 'emerald'];

const listeners = new Set<() => void>();
let currentTheme: EditorTheme = readInitialTheme();
let currentAccent: EditorAccent = readInitialAccent();
let currentDensity: EditorDensity = readInitialDensity();
let currentFontSize: number = readInitialFontSize();

function readInitialTheme(): EditorTheme {
  try {
    const saved = window.localStorage?.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Ignore storage failures in SSR / restricted WebViews.
  }
  return 'dark';
}

function readInitialAccent(): EditorAccent {
  try {
    const saved = window.localStorage?.getItem(ACCENT_STORAGE_KEY);
    if (saved === 'pink' || saved === 'cobalt' || saved === 'emerald') return saved;
  } catch {
    // Ignore storage failures.
  }
  return 'pink';
}

function readInitialDensity(): EditorDensity {
  try {
    const saved = window.localStorage?.getItem(DENSITY_STORAGE_KEY);
    if (saved === 'compact' || saved === 'standard' || saved === 'comfortable') return saved;
  } catch {
    // Ignore storage failures.
  }
  return 'standard';
}

function readInitialFontSize(): number {
  try {
    const saved = Number(window.localStorage?.getItem(FONT_SIZE_STORAGE_KEY));
    if (Number.isFinite(saved) && saved >= 11 && saved <= 14) return Math.round(saved);
  } catch {
    // Ignore storage failures.
  }
  return 12;
}

function applyThemeToDocument(theme: EditorTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function applyAccentToDocument(accent: EditorAccent): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.accent = accent;
}

function applyDensityToDocument(density: EditorDensity): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.density = density;
}

function applyFontSizeToDocument(fontSize: number): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--me-font-size-base', `${fontSize}px`);
  document.documentElement.style.fontSize = `${fontSize}px`;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function initializeTheme(): EditorTheme {
  currentTheme = readInitialTheme();
  currentAccent = readInitialAccent();
  currentDensity = readInitialDensity();
  currentFontSize = readInitialFontSize();
  applyThemeToDocument(currentTheme);
  applyAccentToDocument(currentAccent);
  applyDensityToDocument(currentDensity);
  applyFontSizeToDocument(currentFontSize);
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key === THEME_STORAGE_KEY) {
        const next: EditorTheme = event.newValue === 'light' ? 'light' : 'dark';
        if (next !== currentTheme) {
          currentTheme = next;
          applyThemeToDocument(next);
          notify();
        }
      } else if (event.key === ACCENT_STORAGE_KEY) {
        const next: EditorAccent = event.newValue === 'cobalt' || event.newValue === 'emerald'
          ? event.newValue
          : 'pink';
        if (next !== currentAccent) {
          currentAccent = next;
          applyAccentToDocument(next);
          notify();
        }
      } else if (event.key === DENSITY_STORAGE_KEY) {
        const next: EditorDensity = event.newValue === 'compact' || event.newValue === 'comfortable'
          ? event.newValue
          : 'standard';
        if (next !== currentDensity) {
          currentDensity = next;
          applyDensityToDocument(next);
          notify();
        }
      } else if (event.key === FONT_SIZE_STORAGE_KEY) {
        const parsed = Number(event.newValue);
        if (Number.isFinite(parsed) && parsed >= 11 && parsed <= 14 && parsed !== currentFontSize) {
          currentFontSize = Math.round(parsed);
          applyFontSizeToDocument(currentFontSize);
          notify();
        }
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

export function getAccent(): EditorAccent {
  return currentAccent;
}

export function setAccent(accent: EditorAccent): void {
  if (accent === currentAccent) {
    applyAccentToDocument(accent);
    return;
  }
  currentAccent = accent;
  applyAccentToDocument(accent);
  try {
    window.localStorage?.setItem(ACCENT_STORAGE_KEY, accent);
  } catch {
    // Ignore persistence error.
  }
  notify();
}

export function cycleAccent(): EditorAccent {
  const idx = ACCENT_CYCLE.indexOf(currentAccent);
  const next = ACCENT_CYCLE[(idx + 1) % ACCENT_CYCLE.length];
  setAccent(next);
  return next;
}

export function getDensity(): EditorDensity {
  return currentDensity;
}

export function setDensity(density: EditorDensity): void {
  if (density === currentDensity) {
    applyDensityToDocument(density);
    return;
  }
  currentDensity = density;
  applyDensityToDocument(density);
  try {
    window.localStorage?.setItem(DENSITY_STORAGE_KEY, density);
  } catch {
    // Ignore persistence error.
  }
  notify();
}

export function getFontSize(): number {
  return currentFontSize;
}

export function setFontSize(size: number): void {
  const clamped = Math.min(14, Math.max(11, Math.round(size)));
  if (clamped === currentFontSize) {
    applyFontSizeToDocument(clamped);
    return;
  }
  currentFontSize = clamped;
  applyFontSizeToDocument(clamped);
  try {
    window.localStorage?.setItem(FONT_SIZE_STORAGE_KEY, String(clamped));
  } catch {
    // Ignore persistence error.
  }
  notify();
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
  accent: EditorAccent;
  setAccent: (accent: EditorAccent) => void;
  cycleAccent: () => EditorAccent;
  density: EditorDensity;
  setDensity: (density: EditorDensity) => void;
  fontSize: number;
  setFontSize: (size: number) => void;
} {
  const theme = useSyncExternalStore<EditorTheme>(subscribeTheme, getTheme, () => 'dark');
  const accent = useSyncExternalStore<EditorAccent>(subscribeTheme, getAccent, () => 'pink');
  const density = useSyncExternalStore<EditorDensity>(subscribeTheme, getDensity, () => 'standard');
  const fontSize = useSyncExternalStore<number>(subscribeTheme, getFontSize, () => 12);
  return {
    theme,
    setTheme,
    toggleTheme,
    accent,
    setAccent,
    cycleAccent,
    density,
    setDensity,
    fontSize,
    setFontSize,
  };
}
