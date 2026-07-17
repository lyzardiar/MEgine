import assert from 'node:assert/strict';
import test from 'node:test';
import { compareWorldDrawOrder, entity2DSortingOrder } from '../src/worldDrawOrder.ts';

test('world 2D renderers draw after 3D and by sorting order then depth', () => {
  const items = [
    { name: 'front', depth: 0.9, hierarchyOrder: 0, sortingOrder: 5, editorGizmo: false },
    { name: '3d', depth: 0.1, hierarchyOrder: 1, sortingOrder: null, editorGizmo: false },
    { name: 'back', depth: 0.2, hierarchyOrder: 2, sortingOrder: -2, editorGizmo: false },
    { name: 'far-same-order', depth: 0.8, hierarchyOrder: 3, sortingOrder: 5, editorGizmo: false },
  ];
  items.sort(compareWorldDrawOrder);
  assert.deepEqual(items.map((item) => item.name), ['3d', 'back', 'front', 'far-same-order']);
});

test('Scene gizmos stay visible above sprites and exact ties preserve hierarchy order', () => {
  const items = [
    { name: 'later', depth: 0.5, hierarchyOrder: 3, sortingOrder: 0, editorGizmo: false },
    { name: 'gizmo', depth: 0.9, hierarchyOrder: 1, sortingOrder: null, editorGizmo: true },
    { name: 'earlier', depth: 0.5, hierarchyOrder: 2, sortingOrder: 0, editorGizmo: false },
  ];
  items.sort(compareWorldDrawOrder);
  assert.deepEqual(items.map((item) => item.name), ['earlier', 'later', 'gizmo']);
});

test('sorting order resolves all supported world 2D renderer aliases safely', () => {
  assert.equal(entity2DSortingOrder({ SpriteRenderer: { sorting_order: 2 } }), 2);
  assert.equal(entity2DSortingOrder({ AnimatedSprite2D: { sortingOrder: -3 } }), -3);
  assert.equal(entity2DSortingOrder({ Line2D: {} }), 0);
  assert.equal(entity2DSortingOrder({ MeshRenderer: {} }), null);
});
