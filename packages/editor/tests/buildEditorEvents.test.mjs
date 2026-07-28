import assert from 'node:assert/strict';
import test from 'node:test';
import {
  broadcastProjectBuildArtifactsChanged,
  broadcastProjectBuildSettingsChanged,
  initializeBuildEditorEvents,
  PROJECT_BUILD_ARTIFACTS_CHANGED_EVENT,
  PROJECT_BUILD_SETTINGS_CHANGED_EVENT,
  resetBuildEditorEventsForTests,
} from '../src/buildEditorEvents.ts';
import {
  createEditorBroadcastChannel,
  initializeEditorInstance,
} from '../src/editorInstance.ts';

test('build artifact changes notify local and remote editor windows', async () => {
  const originalWindow = globalThis.window;
  const eventTarget = new EventTarget();
  globalThis.window = eventTarget;
  let remote = null;
  try {
    initializeEditorInstance('build-editor-events-test');
    initializeBuildEditorEvents();
    const received = [];
    eventTarget.addEventListener(PROJECT_BUILD_ARTIFACTS_CHANGED_EVENT, (event) => {
      received.push(event.detail);
    });

    const local = {
      source: 'build-settings',
      status: 'build-created',
      result: { id: 'local-build' },
    };
    broadcastProjectBuildArtifactsChanged(local);
    assert.deepEqual(received[0].detail, local);
    assert.equal(received[0].remote, false);
    assert.equal(typeof received[0].timestamp, 'number');

    remote = createEditorBroadcastChannel('mengine.editor.build.v1');
    assert.ok(remote);
    remote.postMessage({
      type: 'artifacts',
      detail: {
        source: 'agent',
        status: 'history-patch-created',
        result: { id: 'remote-patch' },
      },
      sender: 'remote-build-window',
      timestamp: 123,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(received[1], {
      detail: {
        source: 'agent',
        status: 'history-patch-created',
        result: { id: 'remote-patch' },
      },
      remote: true,
      timestamp: 123,
    });
  } finally {
    remote?.close();
    resetBuildEditorEventsForTests();
    globalThis.window = originalWindow;
  }
});

test('build settings changes notify local and remote editor windows after persistence', async () => {
  const originalWindow = globalThis.window;
  const eventTarget = new EventTarget();
  globalThis.window = eventTarget;
  let remote = null;
  try {
    initializeEditorInstance('build-editor-events-test');
    initializeBuildEditorEvents();
    const received = [];
    eventTarget.addEventListener(PROJECT_BUILD_SETTINGS_CHANGED_EVENT, (event) => {
      received.push(event.detail);
    });

    const local = {
      revision: 'local',
      mainScene: 'Assets/Scenes/Main.mscene',
      scenes: ['Assets/Scenes/Main.mscene'],
      availableScenes: ['Assets/Scenes/Main.mscene'],
      assetMode: 'all',
      alwaysInclude: [],
      shaderVariantLimit: 256,
    };
    broadcastProjectBuildSettingsChanged(local);
    assert.deepEqual(received[0], local);

    const remoteSettings = {
      ...local,
      revision: 'remote',
      assetMode: 'referenced',
    };
    remote = createEditorBroadcastChannel('mengine.editor.build.v1');
    assert.ok(remote);
    remote.postMessage({
      type: 'settings',
      detail: remoteSettings,
      sender: 'remote-build-settings-window',
      timestamp: 123,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(received[1], remoteSettings);
  } finally {
    remote?.close();
    resetBuildEditorEventsForTests();
    globalThis.window = originalWindow;
  }
});
