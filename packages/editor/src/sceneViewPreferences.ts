import { createEditorBroadcastChannel } from './editorInstance.ts';
import {
  normalizeSceneSnapSettings,
  type SceneSnapSettings,
} from './sceneSnap.ts';

const SCENE_2D_KEY = 'mengine.scene.2d';
const SCENE_SNAP_KEY = 'mengine.scene.snap';
const SCENE_GRID_KEY = 'mengine.scene.grid';
const SCENE_SMART_GUIDES_KEY = 'mengine.scene.smart-guides';
const SCENE_VIEW_CHANNEL = 'mengine.editor.scene-view.v1';

export const SCENE_VIEW_PREFERENCES_CHANGED_EVENT =
  'mengine:scene-view-preferences-changed';

export type SceneViewPreferences = {
  mode2D: boolean;
  gridVisible: boolean;
  smartGuidesEnabled: boolean;
  snap: SceneSnapSettings;
};

export type SceneViewPreferencesPatch = {
  mode2D?: boolean;
  gridVisible?: boolean;
  smartGuidesEnabled?: boolean;
  snap?: Partial<SceneSnapSettings>;
};

type SceneViewPreferencesMessage = {
  preferences: SceneViewPreferences;
  sender: string;
  timestamp: number;
};

export type SceneViewPreferencesChangeDetail = SceneViewPreferencesMessage & {
  remote: boolean;
};

const sceneViewSender = crypto.randomUUID();
let sceneViewChannel: BroadcastChannel | null = null;
let sceneViewPreferencesCache: SceneViewPreferences | null = null;

function loadStoredSnap(): SceneSnapSettings {
  try {
    return normalizeSceneSnapSettings(
      JSON.parse(localStorage.getItem(SCENE_SNAP_KEY) ?? '{}'),
    );
  } catch {
    return normalizeSceneSnapSettings(null);
  }
}

export function readSceneViewPreferences(): SceneViewPreferences {
  if (sceneViewPreferencesCache) {
    return structuredClone(sceneViewPreferencesCache);
  }
  try {
    sceneViewPreferencesCache = {
      mode2D: localStorage.getItem(SCENE_2D_KEY) === '1',
      gridVisible: localStorage.getItem(SCENE_GRID_KEY) !== '0',
      smartGuidesEnabled:
        localStorage.getItem(SCENE_SMART_GUIDES_KEY) !== '0',
      snap: loadStoredSnap(),
    };
  } catch {
    sceneViewPreferencesCache = {
      mode2D: false,
      gridVisible: true,
      smartGuidesEnabled: true,
      snap: normalizeSceneSnapSettings(null),
    };
  }
  return structuredClone(sceneViewPreferencesCache);
}

function persistSceneViewPreferences(preferences: SceneViewPreferences): void {
  try {
    localStorage.setItem(SCENE_2D_KEY, preferences.mode2D ? '1' : '0');
    localStorage.setItem(
      SCENE_GRID_KEY,
      preferences.gridVisible ? '1' : '0',
    );
    localStorage.setItem(
      SCENE_SMART_GUIDES_KEY,
      preferences.smartGuidesEnabled ? '1' : '0',
    );
    localStorage.setItem(SCENE_SNAP_KEY, JSON.stringify(preferences.snap));
  } catch {
    /* Keep the live editor state usable when storage is unavailable. */
  }
}

function dispatchSceneViewPreferences(
  message: SceneViewPreferencesMessage,
  remote: boolean,
): void {
  window.dispatchEvent(
    new CustomEvent<SceneViewPreferencesChangeDetail>(
      SCENE_VIEW_PREFERENCES_CHANGED_EVENT,
      {
        detail: {
          preferences: structuredClone(message.preferences),
          sender: message.sender,
          timestamp: message.timestamp,
          remote,
        },
      },
    ),
  );
}

export function initializeSceneViewPreferencesEvents(): void {
  if (sceneViewChannel) return;
  sceneViewChannel = createEditorBroadcastChannel(SCENE_VIEW_CHANNEL);
  sceneViewChannel?.addEventListener(
    'message',
    (event: MessageEvent<SceneViewPreferencesMessage>) => {
      const message = event.data;
      if (
        !message
        || message.sender === sceneViewSender
        || !message.preferences
      ) return;
      const preferences: SceneViewPreferences = {
        mode2D: message.preferences.mode2D === true,
        gridVisible: message.preferences.gridVisible !== false,
        smartGuidesEnabled:
          message.preferences.smartGuidesEnabled !== false,
        snap: normalizeSceneSnapSettings(message.preferences.snap),
      };
      sceneViewPreferencesCache = preferences;
      persistSceneViewPreferences(preferences);
      dispatchSceneViewPreferences(
        { ...message, preferences },
        true,
      );
    },
  );
}

export function resetSceneViewPreferencesEventsForTests(): void {
  sceneViewChannel?.close();
  sceneViewChannel = null;
  sceneViewPreferencesCache = null;
}

export function updateSceneViewPreferences(
  patch: SceneViewPreferencesPatch,
): SceneViewPreferences {
  initializeSceneViewPreferencesEvents();
  const current = readSceneViewPreferences();
  const preferences: SceneViewPreferences = {
    mode2D:
      typeof patch.mode2D === 'boolean' ? patch.mode2D : current.mode2D,
    gridVisible:
      typeof patch.gridVisible === 'boolean'
        ? patch.gridVisible
        : current.gridVisible,
    smartGuidesEnabled:
      typeof patch.smartGuidesEnabled === 'boolean'
        ? patch.smartGuidesEnabled
        : current.smartGuidesEnabled,
    snap: normalizeSceneSnapSettings({
      ...current.snap,
      ...(patch.snap ?? {}),
    }),
  };
  sceneViewPreferencesCache = preferences;
  persistSceneViewPreferences(preferences);
  const message: SceneViewPreferencesMessage = {
    preferences,
    sender: sceneViewSender,
    timestamp: Date.now(),
  };
  dispatchSceneViewPreferences(message, false);
  sceneViewChannel?.postMessage(message);
  return structuredClone(preferences);
}
