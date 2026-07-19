import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAnimationPreview,
  blendAnimationPreviewSamples,
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

test('blends matching scalar vector quaternion and discrete samples like Runtime', () => {
  const source = [
    { target: '.', component: 'Transform', property: 'position', value: [0, 0, 0] },
    { target: '.', component: 'Transform', property: 'rotation', value: [0, 0, 0, 1] },
    { target: '.', component: 'State', property: 'visible', value: false },
    { target: '.', component: 'Transform', property: 'scale', value: [2, 2, 2] },
  ];
  const destination = [
    { target: '.', component: 'Transform', property: 'position', value: [10, 4, 2] },
    { target: '.', component: 'Transform', property: 'rotation', value: [0, 0, 1, 0] },
    { target: '.', component: 'State', property: 'visible', value: true },
    { target: '.', component: 'State', property: 'label', value: 'Run' },
  ];
  const blended = blendAnimationPreviewSamples(source, destination, 0.5);
  assert.deepEqual(blended.find((sample) => sample.property === 'position').value, [5, 2, 1]);
  const rotation = blended.find((sample) => sample.property === 'rotation').value;
  assert.ok(Math.abs(rotation[2] - Math.SQRT1_2) < 1e-6);
  assert.ok(Math.abs(rotation[3] - Math.SQRT1_2) < 1e-6);
  assert.equal(blended.find((sample) => sample.property === 'visible').value, true);
  assert.deepEqual(blended.find((sample) => sample.property === 'scale').value, [2, 2, 2]);
  assert.equal(blended.find((sample) => sample.property === 'label').value, 'Run');
  assert.deepEqual(blendAnimationPreviewSamples(source, destination, 1)
    .find((sample) => sample.property === 'scale').value, [2, 2, 2]);
  assert.equal(blendAnimationPreviewSamples(source, destination, 0.49)
    .find((sample) => sample.property === 'visible').value, false);
});
