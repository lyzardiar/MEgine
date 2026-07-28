import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  broadcastProjectAssetsChanged,
  broadcastProjectAssetsExternalChanges,
  initializeAssetEditorEvents,
  PROJECT_ASSETS_CHANGED_EVENT,
  PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT,
  resetAssetEditorEventsForTests,
} from '../src/assetEditorEvents.ts';
import {
  createEditorBroadcastChannel,
  initializeEditorInstance,
} from '../src/editorInstance.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('asset lifecycle and external changes notify local and remote editor windows', async () => {
  const originalWindow = globalThis.window;
  const eventTarget = new EventTarget();
  globalThis.window = eventTarget;
  let remote = null;
  try {
    initializeEditorInstance('asset-editor-events-test');
    initializeAssetEditorEvents();
    const assetChanges = [];
    const externalChanges = [];
    eventTarget.addEventListener(PROJECT_ASSETS_CHANGED_EVENT, (event) => {
      assetChanges.push(event.detail);
    });
    eventTarget.addEventListener(PROJECT_ASSETS_EXTERNAL_CHANGE_EVENT, (event) => {
      externalChanges.push(event.detail);
    });

    broadcastProjectAssetsChanged({
      action: 'modified',
      sourcePath: 'Assets/Materials/Local.mat',
    });
    assert.equal(assetChanges[0].action, 'modified');
    assert.equal(assetChanges[0].sourcePath, 'Assets/Materials/Local.mat');
    assert.equal(assetChanges[0].remote, false);
    assert.equal(typeof assetChanges[0].timestamp, 'number');

    const external = [{
      type: 'modified',
      relPath: 'Assets/Animations/External.manim',
      previous: null,
      current: null,
    }];
    broadcastProjectAssetsExternalChanges(external);
    assert.deepEqual(externalChanges[0].changes, external);
    assert.equal(externalChanges[0].remote, false);
    assert.deepEqual(assetChanges[1].changes, external);
    assert.equal(assetChanges[1].source, 'external');
    assert.equal(assetChanges[1].remote, false);

    remote = createEditorBroadcastChannel('mengine.editor.assets.v1');
    assert.ok(remote);
    remote.postMessage({
      action: 'created',
      destinationPath: 'Assets/Timelines/Remote.mtimeline',
      sender: 'remote-asset-window',
      timestamp: 123,
    });
    remote.postMessage({
      type: 'external',
      changes: [{
        type: 'deleted',
        relPath: 'Assets/Materials/Removed.mat',
        previous: null,
        current: null,
      }],
      sender: 'remote-asset-window',
      timestamp: 456,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepEqual(assetChanges[2], {
      action: 'created',
      destinationPath: 'Assets/Timelines/Remote.mtimeline',
      sender: 'remote-asset-window',
      timestamp: 123,
      remote: true,
    });
    assert.equal(assetChanges[3].source, 'external');
    assert.equal(assetChanges[3].remote, true);
    assert.equal(assetChanges[3].timestamp, 456);
    assert.equal(assetChanges[3].changes[0].relPath, 'Assets/Materials/Removed.mat');
    assert.equal(externalChanges[1].remote, true);
    assert.equal(externalChanges[1].timestamp, 456);
  } finally {
    remote?.close();
    resetAssetEditorEventsForTests();
    globalThis.window = originalWindow;
  }
});

test('authored asset writers publish changes through the cross-window event bus', () => {
  const app = fs.readFileSync(path.join(root, 'src', 'App.tsx'), 'utf8');
  assert.match(app, /broadcastProjectAssetsExternalChanges\(changes\)/);

  for (const file of [
    'assetImport.ts',
    path.join('panels', 'Animator.tsx'),
    path.join('panels', 'AvatarMask.tsx'),
    path.join('panels', 'SpriteEditor.tsx'),
    path.join('panels', 'SpriteAtlasEditor.tsx'),
    path.join('panels', 'Timeline.tsx'),
    path.join('panels', 'Sequencer.tsx'),
  ]) {
    const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
    assert.match(source, /broadcastProjectAssetsChanged\(\{/);
  }
});
