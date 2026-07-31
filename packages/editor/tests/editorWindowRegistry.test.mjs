import assert from 'node:assert/strict';
import test from 'node:test';
import {
  closeEditorWindow,
  createRegisteredEditorWindow,
  getOpenEditorWindows,
  listRegisteredEditorWindowTypes,
  openEditorWindow,
  registerEditorWindowType,
  subscribeEditorWindowTypes,
} from '../src/editorWindow/registry.ts';

test('registered editor window types are discoverable and sorted by stable id', () => {
  const unregisterSecond = registerEditorWindowType('Test.Window.Second', () => ({
    typeId: 'Test.Window.Second',
    title: 'Second',
    width: 640,
    height: 480,
    render: () => null,
  }));
  const unregisterFirst = registerEditorWindowType('Test.Window.First', () => ({
    typeId: 'Test.Window.First',
    title: 'First',
    width: 320,
    height: 240,
    requiresProject: false,
    render: () => null,
  }));

  try {
    assert.deepEqual(
      listRegisteredEditorWindowTypes().filter((entry) => (
        entry.typeId.startsWith('Test.Window.')
      )),
      [
        {
          typeId: 'Test.Window.First',
          title: 'First',
          width: 320,
          height: 240,
          requiresProject: false,
        },
        {
          typeId: 'Test.Window.Second',
          title: 'Second',
          width: 640,
          height: 480,
          requiresProject: true,
        },
      ],
    );
  } finally {
    unregisterFirst();
    unregisterSecond();
  }
});

test('editor window type overrides restore only factories that remain registered', () => {
  const typeId = 'Test.Window.Override';
  const revisions = [];
  const unsubscribe = subscribeEditorWindowTypes(() => revisions.push(
    listRegisteredEditorWindowTypes()
      .find((entry) => entry.typeId === typeId)?.title ?? null,
  ));
  const factory = (title) => () => ({
    typeId,
    title,
    width: 400,
    height: 300,
    render: () => null,
  });
  const unregisterBase = registerEditorWindowType(typeId, factory('Base'));
  const unregisterMiddle = registerEditorWindowType(typeId, factory('Middle'));
  const unregisterTop = registerEditorWindowType(typeId, factory('Top'));

  assert.equal(createRegisteredEditorWindow(typeId)?.title, 'Top');
  unregisterMiddle();
  unregisterTop();
  assert.equal(createRegisteredEditorWindow(typeId)?.title, 'Base');
  unregisterBase();
  assert.equal(createRegisteredEditorWindow(typeId), null);
  unsubscribe();
  assert.deepEqual(revisions, ['Base', 'Middle', 'Top', 'Base', null]);
});

test('reopening an in-workspace editor window updates it and brings it to the front', () => {
  const windowDefinition = (id, title) => ({
    id,
    title,
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    render: () => null,
  });
  openEditorWindow(windowDefinition('Test.Floating.First', 'First'));
  openEditorWindow(windowDefinition('Test.Floating.Second', 'Second'));
  openEditorWindow(windowDefinition('Test.Floating.First', 'First Updated'));

  const testWindows = getOpenEditorWindows().filter((entry) => (
    entry.id.startsWith('Test.Floating.')
  ));
  assert.deepEqual(
    testWindows.map((entry) => [entry.id, entry.title]),
    [
      ['Test.Floating.Second', 'Second'],
      ['Test.Floating.First', 'First Updated'],
    ],
  );

  closeEditorWindow('Test.Floating.First');
  closeEditorWindow('Test.Floating.Second');
});
