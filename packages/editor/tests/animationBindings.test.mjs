import assert from 'node:assert/strict';
import test from 'node:test';
import {
  animationBindingKey,
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
