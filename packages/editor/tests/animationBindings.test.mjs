import assert from 'node:assert/strict';
import test from 'node:test';
import {
  animationBindingKey,
  groupAnimationPropertyBindings,
  listAnimationPropertyBindings,
  parseAnimationBindingKey,
} from '../src/animationBindings.ts';

test('animation property picker enumerates root and descendant scalar/vector properties', () => {
  const entities = [
    { entity: 1, name: 'Root', parent: null, components: {
      Transform: { position: [0, 1, 2], active: true },
      Unsupported: { values: ['a', 'b'] },
    } },
    { entity: 2, name: 'Arm', parent: 1, components: { Transform: { rotation: [0, 0, 0, 1] } } },
    { entity: 3, name: 'Hand', parent: 2, components: { SpriteRenderer: { color: [1, 1, 1, 1], sprite: 'white' } } },
    { entity: 4, name: 'Other', parent: null, components: { Transform: { position: [9, 9, 9] } } },
  ];
  const bindings = listAnimationPropertyBindings(entities, 1);
  assert.ok(bindings.some((binding) => binding.target === '.' && binding.component === 'Transform' && binding.property === 'position'));
  assert.ok(bindings.some((binding) => binding.target === 'Arm/Hand' && binding.property === 'sprite'));
  assert.ok(!bindings.some((binding) => binding.target.includes('Other')));
  assert.ok(!bindings.some((binding) => binding.component === 'Unsupported'));
});

test('animation binding keys round-trip without path ambiguity', () => {
  const binding = { target: 'Arm/Hand', component: 'Transform', property: 'position' };
  assert.deepEqual(parseAnimationBindingKey(animationBindingKey(binding)), {
    ...binding,
    label: 'Arm/Hand / Transform.position',
  });
  assert.equal(parseAnimationBindingKey('broken'), null);
});

test('animation property picker groups bindings by target and component', () => {
  const groups = groupAnimationPropertyBindings([
    { target: '.', component: 'Transform', property: 'position', label: 'Root / Transform.position' },
    { target: '.', component: 'Transform', property: 'scale', label: 'Root / Transform.scale' },
    { target: 'Arm', component: 'Transform', property: 'rotation', label: 'Arm / Transform.rotation' },
    { target: 'Arm', component: 'SpriteRenderer', property: 'color', label: 'Arm / SpriteRenderer.color' },
  ]);
  assert.deepEqual(groups.map((group) => ({
    label: group.label,
    properties: group.bindings.map((binding) => binding.property),
  })), [
    { label: 'Root / Transform', properties: ['position', 'scale'] },
    { label: 'Arm / Transform', properties: ['rotation'] },
    { label: 'Arm / SpriteRenderer', properties: ['color'] },
  ]);
});
