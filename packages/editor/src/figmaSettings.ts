import { createEditorBroadcastChannel } from './editorInstance.ts';
import {
  FIGMA_COMPONENT_KINDS,
  FIGMA_IMPORT_MAX_NODES,
  type FigmaComponentKind,
} from './ui/figmaImport.ts';

const STORAGE_KEY = 'mengine.figma.settings.v1';
const CHANNEL_NAME = 'mengine.editor.figma-settings.v1';

export const FIGMA_SETTINGS_CHANGED_EVENT = 'mengine:figma-settings-changed';

export type FigmaBridgePreferences = {
  assetFolder: string;
  maxNodes: number;
  imageScale: 1 | 2 | 3 | 4;
  componentMappings: Record<string, FigmaComponentKind>;
};

export type FigmaBridgePreferencesPatch = Partial<FigmaBridgePreferences>;

type FigmaSettingsMessage = {
  preferences: FigmaBridgePreferences;
  sender: string;
  timestamp: number;
};

export type FigmaSettingsChangeDetail = FigmaSettingsMessage & {
  remote: boolean;
};

const DEFAULTS: FigmaBridgePreferences = {
  assetFolder: 'Assets/Figma',
  maxNodes: FIGMA_IMPORT_MAX_NODES,
  imageScale: 1,
  componentMappings: {},
};

const sender = crypto.randomUUID();
let channel: BroadcastChannel | null = null;
let cache: FigmaBridgePreferences | null = null;

function normalizeAssetFolder(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 6
    || value.length > 256
    || !/^Assets(?:\/[A-Za-z0-9 _.-]+)*$/u.test(value)
    || value.includes('..')
  ) return DEFAULTS.assetFolder;
  return value.replace(/\/+$/u, '');
}

function normalizeMappings(value: unknown): Record<string, FigmaComponentKind> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = new Set<string>(FIGMA_COMPONENT_KINDS);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([id, kind]) => (
        /^[A-Za-z0-9:;._-]{1,128}$/u.test(id)
        && allowed.has(String(kind))
      ))
      .slice(0, 512)
      .sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, FigmaComponentKind>;
}

export function normalizeFigmaBridgePreferences(
  value: FigmaBridgePreferencesPatch | null | undefined,
): FigmaBridgePreferences {
  const maxNodes = Number(value?.maxNodes);
  const imageScale = Number(value?.imageScale);
  return {
    assetFolder: normalizeAssetFolder(value?.assetFolder),
    maxNodes: Number.isSafeInteger(maxNodes)
      ? Math.min(FIGMA_IMPORT_MAX_NODES, Math.max(1, maxNodes))
      : DEFAULTS.maxNodes,
    imageScale: ([1, 2, 3, 4].includes(imageScale) ? imageScale : 1) as 1 | 2 | 3 | 4,
    componentMappings: normalizeMappings(value?.componentMappings),
  };
}

function persist(preferences: FigmaBridgePreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Keep live preferences usable when storage is unavailable. */
  }
}

function dispatch(message: FigmaSettingsMessage, remote: boolean): void {
  window.dispatchEvent(new CustomEvent<FigmaSettingsChangeDetail>(
    FIGMA_SETTINGS_CHANGED_EVENT,
    { detail: { ...message, preferences: structuredClone(message.preferences), remote } },
  ));
}

export function initializeFigmaSettingsEvents(): void {
  if (channel) return;
  channel = createEditorBroadcastChannel(CHANNEL_NAME);
  channel?.addEventListener('message', (event: MessageEvent<FigmaSettingsMessage>) => {
    const message = event.data;
    if (!message || message.sender === sender || !message.preferences) return;
    const preferences = normalizeFigmaBridgePreferences(message.preferences);
    cache = preferences;
    persist(preferences);
    dispatch({ ...message, preferences }, true);
  });
}

export function readFigmaBridgePreferences(): FigmaBridgePreferences {
  initializeFigmaSettingsEvents();
  if (cache) return structuredClone(cache);
  try {
    cache = normalizeFigmaBridgePreferences(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    cache = normalizeFigmaBridgePreferences(null);
  }
  return structuredClone(cache);
}

export function updateFigmaBridgePreferences(
  patch: FigmaBridgePreferencesPatch,
): FigmaBridgePreferences {
  initializeFigmaSettingsEvents();
  const current = readFigmaBridgePreferences();
  const preferences = normalizeFigmaBridgePreferences({
    ...current,
    ...patch,
    componentMappings: patch.componentMappings ?? current.componentMappings,
  });
  cache = preferences;
  persist(preferences);
  const message: FigmaSettingsMessage = { preferences, sender, timestamp: Date.now() };
  dispatch(message, false);
  channel?.postMessage(message);
  return structuredClone(preferences);
}

export function resetFigmaBridgePreferences(): FigmaBridgePreferences {
  return updateFigmaBridgePreferences(DEFAULTS);
}

export function resetFigmaSettingsEventsForTests(): void {
  channel?.close();
  channel = null;
  cache = null;
}
