import assert from 'node:assert/strict';
import test from 'node:test';
import { panelWindowBlockers } from '../src/agent/panelSafety.ts';

const windowState = (label, overrides = {}) => ({
  label,
  title: label,
  kind: label === 'main' ? 'main' : 'panel',
  panelKind: label === 'main' ? null : label.slice('panel-'.length),
  typeId: null,
  editorType: null,
  url: 'http://localhost',
  visible: false,
  focused: false,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  scaleFactor: 1,
  ...overrides,
});

test('panel window safety reports only visible or focused target hosts', () => {
  const blockers = panelWindowBlockers([
    windowState('panel-console', { visible: true }),
    windowState('main', { focused: true }),
    windowState('panel-profiler', { visible: true }),
    windowState('editor-help', { visible: true, kind: 'editor' }),
    windowState('panel-project'),
  ], ['main', 'panel-console', 'panel-project']);

  assert.deepEqual(blockers, [
    {
      label: 'main',
      title: 'main',
      kind: 'main',
      visible: false,
      focused: true,
    },
    {
      label: 'panel-console',
      title: 'panel-console',
      kind: 'panel',
      visible: true,
      focused: false,
    },
  ]);
});

test('panel window safety deduplicates target labels and permits hidden hosts', () => {
  assert.deepEqual(
    panelWindowBlockers(
      [windowState('main'), windowState('panel-console')],
      ['main', 'main', 'panel-console'],
    ),
    [],
  );
});
