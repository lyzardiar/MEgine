import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  approveEditorClose,
  beginNativeEditorClose,
  beginRequestedEditorClose,
  cancelEditorClose,
  createEditorCloseState,
  editorCloseWarning,
} from '../src/editorClose.ts';

test('editor close coordination prevents reentry and allows only an approved native retry', () => {
  const state = createEditorCloseState();
  assert.equal(beginNativeEditorClose(state), 'coordinate');
  assert.equal(beginNativeEditorClose(state), 'prevent');
  assert.equal(beginRequestedEditorClose(state), false);

  cancelEditorClose(state);
  assert.equal(beginRequestedEditorClose(state), true);
  approveEditorClose(state);
  assert.equal(beginNativeEditorClose(state), 'allow');

  cancelEditorClose(state);
  assert.equal(beginNativeEditorClose(state), 'coordinate');
});

test('editor close warning is deterministic, deduplicated, and scope aware', () => {
  assert.equal(editorCloseWarning([], true), null);
  assert.equal(
    editorCloseWarning([' Timeline ', 'main window', 'Timeline', ''], true),
    '以下窗口有未保存的场景或资源修改：\n\n• Timeline\n• main window\n\n关闭编辑器将丢失这些修改，是否继续？',
  );
  assert.match(editorCloseWarning(['Inspector'], false), /关闭此窗口/);
});

test('desktop capability allows the confirmed close coordinator to destroy windows', async () => {
  const capability = JSON.parse(await readFile(
    new URL('../src-tauri/capabilities/main.json', import.meta.url),
    'utf8',
  ));
  assert.ok(capability.permissions.includes('core:window:allow-destroy'));
});
