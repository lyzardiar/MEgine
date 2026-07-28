import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_SORTING_LAYER_SETTINGS } from '../src/sortingLayerModel.ts';
import {
  broadcastSortingLayersChanged,
  getSortingLayers,
  initializeSortingLayerEvents,
  resetSortingLayerEventsForTests,
  SORTING_LAYERS_CHANGED_EVENT,
} from '../src/sortingLayers.ts';
import {
  createEditorBroadcastChannel,
  initializeEditorInstance,
} from '../src/editorInstance.ts';

test('project settings changes notify local and remote editor windows', async () => {
  const originalWindow = globalThis.window;
  const eventTarget = new EventTarget();
  globalThis.window = eventTarget;
  let remote = null;
  try {
    initializeEditorInstance('sorting-layer-events-test');
    initializeSortingLayerEvents();
    const received = [];
    eventTarget.addEventListener(SORTING_LAYERS_CHANGED_EVENT, (event) => {
      received.push(event.detail);
    });

    const localSettings = {
      ...structuredClone(DEFAULT_SORTING_LAYER_SETTINGS),
      tags: ['Untagged', 'Player'],
    };
    broadcastSortingLayersChanged(localSettings, 'project-settings');
    assert.deepEqual(received[0].settings, localSettings);
    assert.equal(received[0].source, 'project-settings');
    assert.equal(received[0].remote, false);
    assert.equal(typeof received[0].timestamp, 'number');
    assert.deepEqual(getSortingLayers(), localSettings);

    const remoteSettings = {
      ...structuredClone(DEFAULT_SORTING_LAYER_SETTINGS),
      tags: ['Untagged', 'Enemy'],
    };
    remote = createEditorBroadcastChannel('mengine.editor.sorting-layers.v1');
    assert.ok(remote);
    remote.postMessage({
      settings: remoteSettings,
      source: 'agent',
      sender: 'remote-project-settings-window',
      timestamp: 123,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(received[1], {
      settings: remoteSettings,
      source: 'agent',
      sender: 'remote-project-settings-window',
      timestamp: 123,
      remote: true,
    });
    assert.deepEqual(getSortingLayers(), remoteSettings);
  } finally {
    remote?.close();
    resetSortingLayerEventsForTests();
    globalThis.window = originalWindow;
  }
});
