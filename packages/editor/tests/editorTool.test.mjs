import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRectMoveMode,
  transformGizmoMode,
  usesLocalHandleAxes,
} from '../src/editorTool.ts';

test('Rect Tool maps to Move only for 3D Transform gizmos', () => {
  assert.equal(transformGizmoMode('rect'), 'translate');
  assert.equal(transformGizmoMode('rotate'), 'rotate');
  assert.equal(isRectMoveMode('rect'), true);
  assert.equal(isRectMoveMode('translate'), true);
  assert.equal(isRectMoveMode('scale'), false);
});

test('Scale remains local while Move and Rotate honor the handle orientation', () => {
  assert.equal(usesLocalHandleAxes('translate', 'local'), true);
  assert.equal(usesLocalHandleAxes('translate', 'global'), false);
  assert.equal(usesLocalHandleAxes('rotate', 'global'), false);
  assert.equal(usesLocalHandleAxes('scale', 'global'), true);
});
