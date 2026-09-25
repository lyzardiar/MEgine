import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('project boot reports the blocking dialog without resolving it or waiting for timeout', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    const { agentBridge } = await server.ssrLoadModule('/src/agent/AgentBridge.ts');
    const dialogs = await server.ssrLoadModule('/src/editorDialog.ts');
    const pending = dialogs.confirmEditor('Restore the autosaved scene?', { title: 'Scene recovery' });
    const dialog = dialogs.getActiveEditorDialog();
    await assert.rejects(agentBridge.waitForEditorBootAfter(0), (error) => {
      assert.equal(error.code, 'NOT_READY');
      assert.equal(error.data.reason, 'dialog');
      assert.equal(error.data.activeDialog.id, dialog.id);
      assert.equal(error.data.nextQuery, 'project.state');
      return true;
    });
    assert.equal(dialogs.getActiveEditorDialog().id, dialog.id);
    dialogs.respondToEditorDialog(dialog.id, 'cancel');
    assert.equal(await pending, false);
    agentBridge.editorBootReady = true;
    agentBridge.editorBootGeneration = 1;
    await agentBridge.waitForEditorBootAfter(0);
  } finally {
    await server.close();
  }
});
