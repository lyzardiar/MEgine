import assert from 'node:assert/strict';
import test from 'node:test';
import {
  editorBroadcastChannelName,
  getEditorInstanceIdForChannels,
  initializeEditorInstance,
} from '../src/editorInstance.ts';

test('editor channel names are stable and scoped to one immutable native instance', () => {
  assert.equal(getEditorInstanceIdForChannels(), 'browser');
  assert.throws(
    () => editorBroadcastChannelName('mengine.editor.workspace.v1'),
    /must be initialized/,
  );
  assert.equal(initializeEditorInstance(' editor-123 '), 'editor-123');
  assert.equal(getEditorInstanceIdForChannels(), 'editor-123');
  assert.equal(
    editorBroadcastChannelName('mengine.editor.workspace.v1'),
    'mengine.editor.workspace.v1:editor-123',
  );
  assert.equal(initializeEditorInstance('editor-123'), 'editor-123');
  assert.throws(
    () => initializeEditorInstance('editor-456'),
    /cannot change after initialization/,
  );
  assert.throws(() => editorBroadcastChannelName('  '), /must not be empty/);
});
