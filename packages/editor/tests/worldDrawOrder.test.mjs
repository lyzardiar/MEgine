import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareWorldDrawOrder,
  entity2DSortingOrder,
  entity2DSortingSettings,
} from '../src/worldDrawOrder.ts';

test('world 2D renderers draw after 3D and by sorting order then depth', () => {
  const items = [
    { name: 'front', depth: 0.9, hierarchyOrder: 0, sortingOrder: 5, sortingLayerOrder: 0, editorGizmo: false },
    { name: '3d', depth: 0.1, hierarchyOrder: 1, sortingOrder: null, sortingLayerOrder: null, editorGizmo: false },
    { name: 'back', depth: 0.2, hierarchyOrder: 2, sortingOrder: -2, sortingLayerOrder: 0, editorGizmo: false },
    { name: 'far-same-order', depth: 0.8, hierarchyOrder: 3, sortingOrder: 5, sortingLayerOrder: 0, editorGizmo: false },
  ];
  items.sort(compareWorldDrawOrder);
  assert.deepEqual(items.map((item) => item.name), ['3d', 'back', 'front', 'far-same-order']);
});

test('Scene gizmos stay visible above sprites and exact ties preserve hierarchy order', () => {
  const items = [
    { name: 'later', depth: 0.5, hierarchyOrder: 3, sortingOrder: 0, sortingLayerOrder: 0, editorGizmo: false },
    { name: 'gizmo', depth: 0.9, hierarchyOrder: 1, sortingOrder: null, sortingLayerOrder: null, editorGizmo: true },
    { name: 'earlier', depth: 0.5, hierarchyOrder: 2, sortingOrder: 0, sortingLayerOrder: 0, editorGizmo: false },
  ];
  items.sort(compareWorldDrawOrder);
  assert.deepEqual(items.map((item) => item.name), ['earlier', 'later', 'gizmo']);
});

test('sorting order resolves all supported world 2D renderer aliases safely', () => {
  assert.equal(entity2DSortingOrder({ SpriteRenderer: { sorting_order: 2 } }), 2);
  assert.equal(entity2DSortingOrder({ AnimatedSprite2D: { sortingOrder: -3 } }), -3);
  assert.equal(entity2DSortingOrder({ Line2D: {} }), 0);
  assert.equal(entity2DSortingOrder({ Tilemap: { sorting_order: 6 } }), 6);
  assert.deepEqual(
    entity2DSortingSettings({ ParticleEmitter2D: { sorting_layer: 'effects', sorting_order: 8 } }),
    { layer: 'effects', order: 8 },
  );
  assert.deepEqual(
    entity2DSortingSettings({ SpineSkeleton: { sortingLayer: 'characters', sortingOrder: 3 } }),
    { layer: 'characters', order: 3 },
  );
  assert.equal(entity2DSortingOrder({ MeshRenderer: {} }), null);
});

test('sorting layer rank precedes per-layer order and allows particles between sprites', () => {
  const items = [
    { name: 'effects-particle', depth: 0.2, hierarchyOrder: 0, sortingOrder: -100, sortingLayerOrder: 2, editorGizmo: false },
    { name: 'default-sprite', depth: 0.2, hierarchyOrder: 1, sortingOrder: 100, sortingLayerOrder: 1, editorGizmo: false },
    { name: 'background-line', depth: 0.2, hierarchyOrder: 2, sortingOrder: 999, sortingLayerOrder: 0, editorGizmo: false },
  ];
  items.sort(compareWorldDrawOrder);
  assert.deepEqual(items.map((item) => item.name), [
    'background-line', 'default-sprite', 'effects-particle',
  ]);
});
