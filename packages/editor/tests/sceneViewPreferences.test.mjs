import assert from 'node:assert/strict';
import test from 'node:test';
import {
  initializeSceneViewPreferencesEvents,
  readSceneViewPreferences,
  resetSceneViewPreferencesEventsForTests,
  SCENE_VIEW_PREFERENCES_CHANGED_EVENT,
  updateSceneViewPreferences,
} from '../src/sceneViewPreferences.ts';
import {
  createEditorBroadcastChannel,
  initializeEditorInstance,
} from '../src/editorInstance.ts';

test('Scene view preferences persist and notify local and remote editor windows', async () => {
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
    initializeEditorInstance('scene-view-preferences-test');
    initializeSceneViewPreferencesEvents();
    const changes = [];
    eventTarget.addEventListener(
      SCENE_VIEW_PREFERENCES_CHANGED_EVENT,
      (event) => changes.push(event.detail),
    );

    const local = updateSceneViewPreferences({
      mode2D: true,
      gridVisible: false,
      pivotMode: 'center',
      handleOrientation: 'global',
      snap: { enabled: true, move: 4 },
    });
    assert.deepEqual(local, {
      mode2D: true,
      gridVisible: false,
      smartGuidesEnabled: true,
      pivotMode: 'center',
      handleOrientation: 'global',
      snap: { enabled: true, move: 4, rotate: 15, scale: 0.1 },
    });
    assert.deepEqual(readSceneViewPreferences(), local);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].remote, false);
    assert.deepEqual(changes[0].preferences, local);

    remote = createEditorBroadcastChannel('mengine.editor.scene-view.v1');
    assert.ok(remote);
    remote.postMessage({
      preferences: {
        mode2D: false,
        gridVisible: true,
        smartGuidesEnabled: false,
        pivotMode: 'pivot',
        handleOrientation: 'local',
        snap: { enabled: false, move: 8, rotate: 30, scale: 0.25 },
      },
      sender: 'remote-scene-view-window',
      timestamp: 123,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.equal(changes.length, 2);
    assert.equal(changes[1].remote, true);
    assert.equal(changes[1].sender, 'remote-scene-view-window');
    assert.deepEqual(readSceneViewPreferences(), changes[1].preferences);

    storageAvailable = false;
    const memoryOnly = updateSceneViewPreferences({
      gridVisible: false,
      snap: { move: 12 },
    });
    assert.deepEqual(readSceneViewPreferences(), memoryOnly);
    assert.equal(memoryOnly.gridVisible, false);
    assert.equal(memoryOnly.snap.move, 12);
  } finally {
    remote?.close();
    resetSceneViewPreferencesEventsForTests();
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
  }
});
