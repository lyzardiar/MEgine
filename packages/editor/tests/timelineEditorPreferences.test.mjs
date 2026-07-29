import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initializeTimelineEditorPreferencesEvents,
  readTimelineEditorPreferences,
  resetTimelineEditorPreferencesEventsForTests,
  TIMELINE_EDITOR_PREFERENCES_CHANGED_EVENT,
  updateTimelineEditorPreferences,
} from '../src/timelineEditorPreferences.ts';
import {
  createEditorBroadcastChannel,
  initializeEditorInstance,
} from '../src/editorInstance.ts';

test('Timeline editor preferences persist and notify local and remote editor windows', async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const eventTarget = new EventTarget();
  const values = new Map();
  let storageAvailable = true;
  globalThis.window = eventTarget;
  globalThis.localStorage = {
    getItem(key) {
      if (!storageAvailable) throw new Error('storage unavailable');
      return values.get(String(key)) ?? null;
    },
    setItem(key, value) {
      if (!storageAvailable) throw new Error('storage unavailable');
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
  let remote = null;
  try {
    initializeEditorInstance('timeline-editor-preferences-test');
    initializeTimelineEditorPreferencesEvents();
    const changes = [];
    eventTarget.addEventListener(
      TIMELINE_EDITOR_PREFERENCES_CHANGED_EVENT,
      (event) => changes.push(event.detail),
    );

    const local = updateTimelineEditorPreferences({
      animationTimeline: {
        timeDisplayMode: 'seconds',
        snapping: false,
      },
      sequencer: {
        snapping: false,
        rippleMode: true,
        inspectorOpen: false,
        loopPreview: true,
      },
    });
    assert.deepEqual(local, {
      animationTimeline: {
        timeDisplayMode: 'seconds',
        snapping: false,
      },
      sequencer: {
        snapping: false,
        rippleMode: true,
        inspectorOpen: false,
        loopPreview: true,
      },
    });
    assert.deepEqual(readTimelineEditorPreferences(), local);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].remote, false);
    assert.deepEqual(changes[0].preferences, local);
    assert.equal(
      values.get('mengine.timeline.time_display'),
      'seconds',
    );
    assert.equal(values.get('mengine.sequencer.ripple'), '1');

    remote = createEditorBroadcastChannel(
      'mengine.editor.timeline-preferences.v1',
    );
    assert.ok(remote);
    remote.postMessage({
      preferences: {
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
      },
      sender: 'remote-timeline-window',
      timestamp: 123,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(changes.length, 2);
    assert.equal(changes[1].remote, true);
    assert.equal(changes[1].sender, 'remote-timeline-window');
    assert.deepEqual(readTimelineEditorPreferences(), changes[1].preferences);

    storageAvailable = false;
    const memoryOnly = updateTimelineEditorPreferences({
      animationTimeline: { snapping: false },
      sequencer: { loopPreview: true },
    });
    assert.deepEqual(readTimelineEditorPreferences(), memoryOnly);
    assert.equal(memoryOnly.animationTimeline.snapping, false);
    assert.equal(memoryOnly.sequencer.loopPreview, true);
  } finally {
    remote?.close();
    resetTimelineEditorPreferencesEventsForTests();
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  }
});
