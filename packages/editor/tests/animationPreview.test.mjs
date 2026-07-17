import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAnimationPreview,
  resolveAnimationTarget,
} from '../src/animationPreview.ts';

const entities = [
  {
    entity: 1,
    name: 'Root',
    parent: null,
    components: {
      Transform: { position: [0, 1, 2], scale: [1, 1, 1] },
    },
  },
  {
    entity: 2,
    name: 'Arm',
    parent: 1,
    components: {
      Transform: { position: [3, 4, 5], scale: [1, 1, 1] },
    },
  },
];

test('resolves root, entity id, and relative hierarchy targets', () => {
  assert.equal(resolveAnimationTarget(entities, 1, '.'), 1);
  assert.equal(resolveAnimationTarget(entities, 1, '2'), 2);
  assert.equal(resolveAnimationTarget(entities, 1, './Arm'), 2);
  assert.equal(resolveAnimationTarget(entities, 1, 'Missing'), null);
});

test('applies preview values to a cloned snapshot only', () => {
  const preview = applyAnimationPreview(entities, 1, [
    { target: '.', component: 'Transform', property: 'position', value: [9, 8, 7] },
    { target: 'Arm', component: 'Transform', property: 'scale.y', value: 2 },
  ]);

  assert.deepEqual(preview[0].components.Transform.position, [9, 8, 7]);
  assert.deepEqual(preview[1].components.Transform.scale, [1, 2, 1]);
  assert.deepEqual(entities[0].components.Transform.position, [0, 1, 2]);
  assert.deepEqual(entities[1].components.Transform.scale, [1, 1, 1]);
});

test('ignores missing components and unsafe property paths', () => {
  const preview = applyAnimationPreview(entities, 1, [
    { target: '.', component: 'Missing', property: 'value', value: 3 },
    { target: '.', component: 'Transform', property: '__proto__.polluted', value: true },
    { target: '.', component: 'Transform', property: 'constructor.prototype.polluted', value: true },
  ]);
  assert.deepEqual(preview, entities);
  assert.equal({}.polluted, undefined);
});
