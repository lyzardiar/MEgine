import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alertEditor,
  confirmEditor,
  getActiveEditorDialog,
  initializeEditorDialogSync,
  listEditorDialogs,
  promptEditor,
  resetEditorDialogsForTests,
  respondToEditorDialog,
  subscribeEditorDialog,
} from '../src/editorDialog.ts';
import {
  createEditorBroadcastChannel,
  initializeEditorInstance,
} from '../src/editorInstance.ts';

test.afterEach(() => {
  resetEditorDialogsForTests();
});

test('editor dialogs are queued and resolved without blocking the JavaScript thread', async () => {
  const revisions = [];
  const unsubscribe = subscribeEditorDialog(() => {
    revisions.push(getActiveEditorDialog()?.id ?? null);
  });
  const confirmation = confirmEditor('Discard changes?', {
    title: 'Unsaved Changes',
    confirmLabel: 'Discard',
  });
  const prompt = promptEditor('Scene name', 'Main');
  const first = getActiveEditorDialog();

  assert.equal(first.kind, 'confirm');
  assert.equal(first.title, 'Unsaved Changes');
  assert.equal(first.confirmLabel, 'Discard');
  assert.deepEqual(listEditorDialogs(), [{ ...first, windowLabel: 'main' }]);
  assert.equal(respondToEditorDialog('stale-id', 'accept'), null);
  assert.deepEqual(
    respondToEditorDialog(first.id, 'accept'),
    {
      dialogId: first.id,
      kind: 'confirm',
      action: 'accept',
    },
  );
  assert.equal(await confirmation, true);

  const second = getActiveEditorDialog();
  assert.equal(second.kind, 'prompt');
  assert.equal(second.defaultValue, 'Main');
  assert.deepEqual(
    respondToEditorDialog(second.id, 'accept', 'Level 01'),
    {
      dialogId: second.id,
      kind: 'prompt',
      action: 'accept',
      value: 'Level 01',
    },
  );
  assert.equal(await prompt, 'Level 01');
  assert.equal(getActiveEditorDialog(), null);
  assert.deepEqual(listEditorDialogs(), []);
  assert.deepEqual(revisions, [first.id, second.id, null]);
  unsubscribe();
});

test('cancel and alert results preserve their native-dialog semantics', async () => {
  const confirmation = confirmEditor('Continue?');
  const confirmSnapshot = getActiveEditorDialog();
  respondToEditorDialog(confirmSnapshot.id, 'cancel');
  assert.equal(await confirmation, false);

  const prompt = promptEditor('Name', 'Untitled');
  const promptSnapshot = getActiveEditorDialog();
  respondToEditorDialog(promptSnapshot.id, 'cancel', 'ignored');
  assert.equal(await prompt, null);

  const alert = alertEditor('Finished');
  const alertSnapshot = getActiveEditorDialog();
  assert.equal(alertSnapshot.cancelLabel, null);
  respondToEditorDialog(alertSnapshot.id, 'accept');
  assert.equal(await alert, undefined);
});

test('prompt results and defaults are bounded for safe Agent transport', async () => {
  const prompt = promptEditor('Name', 'x'.repeat(5000));
  const snapshot = getActiveEditorDialog();
  assert.equal(snapshot.defaultValue.length, 4096);
  respondToEditorDialog(snapshot.id, 'accept', 'y'.repeat(5000));
  assert.equal((await prompt).length, 4096);
});

test('remote dialog state is listed and notifies main-window subscribers', async () => {
  initializeEditorInstance('editor-dialog-sync-test');
  const stopSync = initializeEditorDialogSync('main');
  const remote = createEditorBroadcastChannel('mengine-editor-dialogs-v1');
  assert.ok(remote);
  const revisions = [];
  const unsubscribe = subscribeEditorDialog(() => {
    revisions.push(listEditorDialogs().map((dialog) => `${dialog.windowLabel}:${dialog.id}`));
  });
  const dialog = {
    id: 'remote-dialog',
    kind: 'confirm',
    title: 'Remote Confirm',
    message: 'Continue?',
    defaultValue: null,
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
    createdAt: 123,
  };

  remote.postMessage({
    type: 'state',
    source: 'panel-material',
    dialog,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(listEditorDialogs(), [{
    ...dialog,
    windowLabel: 'panel-material',
  }]);

  remote.postMessage({ type: 'closed', source: 'panel-material' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(listEditorDialogs(), []);
  assert.deepEqual(revisions, [
    ['panel-material:remote-dialog'],
    [],
  ]);

  unsubscribe();
  remote.close();
  stopSync();
});
