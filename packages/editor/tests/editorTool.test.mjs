import assert from 'node:assert/strict';
import test from 'node:test';
import { isRectMoveMode, transformGizmoMode } from '../src/editorTool.ts';

test('Rect Tool maps to Move only for 3D Transform gizmos', () => {
  assert.equal(transformGizmoMode('rect'), 'translate');
  assert.equal(transformGizmoMode('rotate'), 'rotate');
  assert.equal(isRectMoveMode('rect'), true);
  assert.equal(isRectMoveMode('translate'), true);
  assert.equal(isRectMoveMode('scale'), false);
});
