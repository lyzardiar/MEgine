import { createEditorBroadcastChannel } from './editorInstance.ts';

const ANIMATION_TIMELINE_TIME_DISPLAY_KEY =
  'mengine.timeline.time_display';
const ANIMATION_TIMELINE_SNAPPING_KEY = 'mengine.timeline.snapping';
const SEQUENCER_SNAPPING_KEY = 'mengine.sequencer.snapping';
const SEQUENCER_RIPPLE_KEY = 'mengine.sequencer.ripple';
const SEQUENCER_INSPECTOR_KEY = 'mengine.sequencer.inspector';
const SEQUENCER_LOOP_PREVIEW_KEY = 'mengine.sequencer.loop_preview';
const TIMELINE_EDITOR_PREFERENCES_CHANNEL =
  'mengine.editor.timeline-preferences.v1';

export const TIMELINE_EDITOR_PREFERENCES_CHANGED_EVENT =
  'mengine:timeline-editor-preferences-changed';

export type AnimationTimelineTimeDisplayMode = 'frames' | 'seconds';

export type TimelineEditorPreferences = {
  animationTimeline: {
    timeDisplayMode: AnimationTimelineTimeDisplayMode;
    snapping: boolean;
  };
  sequencer: {
    snapping: boolean;
    rippleMode: boolean;
    inspectorOpen: boolean;
    loopPreview: boolean;
  };
};

export type TimelineEditorPreferencesPatch = {
  animationTimeline?: Partial<
    TimelineEditorPreferences['animationTimeline']
  >;
  sequencer?: Partial<TimelineEditorPreferences['sequencer']>;
};

type TimelineEditorPreferencesMessage = {
  preferences: TimelineEditorPreferences;
  sender: string;
  timestamp: number;
};

export type TimelineEditorPreferencesChangeDetail =
  TimelineEditorPreferencesMessage & {
    remote: boolean;
  };

const timelineEditorPreferencesSender = crypto.randomUUID();
let timelineEditorPreferencesChannel: BroadcastChannel | null = null;
let timelineEditorPreferencesCache: TimelineEditorPreferences | null = null;

function defaultTimelineEditorPreferences(): TimelineEditorPreferences {
  return {
    animationTimeline: {
      timeDisplayMode: 'frames',
      snapping: true,
    },
    sequencer: {
      snapping: true,
      rippleMode: false,
      inspectorOpen: true,
      loopPreview: false,
    },
  };
}

function normalizeTimelineEditorPreferences(
  value: unknown,
): TimelineEditorPreferences {
  const defaults = defaultTimelineEditorPreferences();
  const root =
    value && typeof value === 'object'
      ? value as Partial<TimelineEditorPreferences>
      : {};
  const animationTimeline: Partial<
    TimelineEditorPreferences['animationTimeline']
  > =
    root.animationTimeline && typeof root.animationTimeline === 'object'
      ? root.animationTimeline
      : {};
  const sequencer: Partial<TimelineEditorPreferences['sequencer']> =
    root.sequencer && typeof root.sequencer === 'object'
      ? root.sequencer
      : {};
  return {
    animationTimeline: {
      timeDisplayMode:
        animationTimeline.timeDisplayMode === 'seconds'
          ? 'seconds'
          : defaults.animationTimeline.timeDisplayMode,
      snapping:
        typeof animationTimeline.snapping === 'boolean'
          ? animationTimeline.snapping
          : defaults.animationTimeline.snapping,
    },
    sequencer: {
      snapping:
        typeof sequencer.snapping === 'boolean'
          ? sequencer.snapping
          : defaults.sequencer.snapping,
      rippleMode:
        typeof sequencer.rippleMode === 'boolean'
          ? sequencer.rippleMode
          : defaults.sequencer.rippleMode,
      inspectorOpen:
        typeof sequencer.inspectorOpen === 'boolean'
          ? sequencer.inspectorOpen
          : defaults.sequencer.inspectorOpen,
      loopPreview:
        typeof sequencer.loopPreview === 'boolean'
          ? sequencer.loopPreview
          : defaults.sequencer.loopPreview,
    },
  };
}

export function readTimelineEditorPreferences(): TimelineEditorPreferences {
  if (timelineEditorPreferencesCache) {
    return structuredClone(timelineEditorPreferencesCache);
  }
  try {
    timelineEditorPreferencesCache = {
      animationTimeline: {
        timeDisplayMode:
          localStorage.getItem(ANIMATION_TIMELINE_TIME_DISPLAY_KEY)
            === 'seconds'
            ? 'seconds'
            : 'frames',
        snapping:
          localStorage.getItem(ANIMATION_TIMELINE_SNAPPING_KEY) !== '0',
      },
      sequencer: {
        snapping: localStorage.getItem(SEQUENCER_SNAPPING_KEY) !== '0',
        rippleMode: localStorage.getItem(SEQUENCER_RIPPLE_KEY) === '1',
        inspectorOpen:
          localStorage.getItem(SEQUENCER_INSPECTOR_KEY) !== '0',
        loopPreview:
          localStorage.getItem(SEQUENCER_LOOP_PREVIEW_KEY) === '1',
      },
    };
  } catch {
    timelineEditorPreferencesCache = defaultTimelineEditorPreferences();
  }
  return structuredClone(timelineEditorPreferencesCache);
}

function persistTimelineEditorPreferences(
  preferences: TimelineEditorPreferences,
): void {
  try {
    localStorage.setItem(
      ANIMATION_TIMELINE_TIME_DISPLAY_KEY,
      preferences.animationTimeline.timeDisplayMode,
    );
    localStorage.setItem(
      ANIMATION_TIMELINE_SNAPPING_KEY,
      preferences.animationTimeline.snapping ? '1' : '0',
    );
    localStorage.setItem(
      SEQUENCER_SNAPPING_KEY,
      preferences.sequencer.snapping ? '1' : '0',
    );
    localStorage.setItem(
      SEQUENCER_RIPPLE_KEY,
      preferences.sequencer.rippleMode ? '1' : '0',
    );
    localStorage.setItem(
      SEQUENCER_INSPECTOR_KEY,
      preferences.sequencer.inspectorOpen ? '1' : '0',
    );
    localStorage.setItem(
      SEQUENCER_LOOP_PREVIEW_KEY,
      preferences.sequencer.loopPreview ? '1' : '0',
    );
  } catch {
    /* Keep the live editor state usable when storage is unavailable. */
  }
}

function dispatchTimelineEditorPreferences(
  message: TimelineEditorPreferencesMessage,
  remote: boolean,
): void {
  window.dispatchEvent(
    new CustomEvent<TimelineEditorPreferencesChangeDetail>(
      TIMELINE_EDITOR_PREFERENCES_CHANGED_EVENT,
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

export function initializeTimelineEditorPreferencesEvents(): void {
  if (timelineEditorPreferencesChannel) return;
  timelineEditorPreferencesChannel = createEditorBroadcastChannel(
    TIMELINE_EDITOR_PREFERENCES_CHANNEL,
  );
  timelineEditorPreferencesChannel?.addEventListener(
    'message',
    (event: MessageEvent<TimelineEditorPreferencesMessage>) => {
      const message = event.data;
      if (
        !message
        || message.sender === timelineEditorPreferencesSender
        || !message.preferences
      ) return;
      const preferences = normalizeTimelineEditorPreferences(
        message.preferences,
      );
      timelineEditorPreferencesCache = preferences;
      persistTimelineEditorPreferences(preferences);
      dispatchTimelineEditorPreferences(
        { ...message, preferences },
        true,
      );
    },
  );
}

export function resetTimelineEditorPreferencesEventsForTests(): void {
  timelineEditorPreferencesChannel?.close();
  timelineEditorPreferencesChannel = null;
  timelineEditorPreferencesCache = null;
}

export function updateTimelineEditorPreferences(
  patch: TimelineEditorPreferencesPatch,
): TimelineEditorPreferences {
  initializeTimelineEditorPreferencesEvents();
  const current = readTimelineEditorPreferences();
  const preferences = normalizeTimelineEditorPreferences({
    animationTimeline: {
      ...current.animationTimeline,
      ...(patch.animationTimeline ?? {}),
    },
    sequencer: {
      ...current.sequencer,
      ...(patch.sequencer ?? {}),
    },
  });
  timelineEditorPreferencesCache = preferences;
  persistTimelineEditorPreferences(preferences);
  const message: TimelineEditorPreferencesMessage = {
    preferences,
    sender: timelineEditorPreferencesSender,
    timestamp: Date.now(),
  };
  dispatchTimelineEditorPreferences(message, false);
  timelineEditorPreferencesChannel?.postMessage(message);
  return structuredClone(preferences);
}
