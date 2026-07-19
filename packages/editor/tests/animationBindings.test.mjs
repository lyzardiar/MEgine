import assert from 'node:assert/strict';
import test from 'node:test';
import {
  animationBindingKey,
  groupAnimationPropertyBindings,
  listAnimationPropertyBindings,
  navigateAnimationPropertyBindingIndex,
  parseAnimationBindingKey,
  searchAnimationPropertyBindings,
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

test('animation property search matches all tokens and reports truncated results', () => {
  const bindings = [
    { target: '.', component: 'Transform', property: 'position', label: 'Root / Transform.position' },
    { target: '.', component: 'Transform', property: 'scale', label: 'Root / Transform.scale' },
    { target: 'Arm', component: 'Transform', property: 'position', label: 'Arm / Transform.position' },
    { target: 'Arm', component: 'SpriteRenderer', property: 'color', label: 'Arm / SpriteRenderer.color' },
  ];
  const filtered = searchAnimationPropertyBindings(bindings, 'arm trans');
  assert.deepEqual(filtered.bindings.map((binding) => binding.label), ['Arm / Transform.position']);
  assert.equal(filtered.matchCount, 1);
  assert.equal(filtered.truncated, false);

  const limited = searchAnimationPropertyBindings(bindings, '', 2);
  assert.deepEqual(limited.bindings, bindings.slice(0, 2));
  assert.equal(limited.matchCount, 4);
  assert.equal(limited.truncated, true);
});

test('animation property keyboard navigation wraps arrows and clamps page movement', () => {
  assert.equal(navigateAnimationPropertyBindingIndex(0, -1, 'next'), -1);
  assert.equal(navigateAnimationPropertyBindingIndex(5, -1, 'next'), 0);
  assert.equal(navigateAnimationPropertyBindingIndex(5, -1, 'previous'), 4);
  assert.equal(navigateAnimationPropertyBindingIndex(5, 4, 'next'), 0);
  assert.equal(navigateAnimationPropertyBindingIndex(5, 0, 'previous'), 4);
  assert.equal(navigateAnimationPropertyBindingIndex(20, 4, 'page_next', 10), 14);
  assert.equal(navigateAnimationPropertyBindingIndex(20, 14, 'page_next', 10), 19);
  assert.equal(navigateAnimationPropertyBindingIndex(20, 14, 'page_previous', 10), 4);
  assert.equal(navigateAnimationPropertyBindingIndex(20, 4, 'page_previous', 10), 0);
  assert.equal(navigateAnimationPropertyBindingIndex(5, 2, 'first'), 0);
  assert.equal(navigateAnimationPropertyBindingIndex(5, 2, 'last'), 4);
});
