import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listRegisteredEditorWindowTypes,
  registerEditorWindowType,
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
        },
        {
          typeId: 'Test.Window.Second',
          title: 'Second',
          width: 640,
          height: 480,
        },
      ],
    );
  } finally {
    unregisterFirst();
    unregisterSecond();
  }
});
