import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSpriteSpawnComponents,
  spriteEntityName,
} from '../src/spriteCreation.ts';

test('sprite creation derives Unity-style scene names from assets and slices', () => {
  assert.equal(spriteEntityName('Assets/Characters/Hero.png'), 'Hero');
  assert.equal(spriteEntityName('Assets/Characters/Hero.png#Run_03'), 'Run_03');
  assert.equal(spriteEntityName(''), 'Sprite');
});

test('sprite creation preserves authored geometry and safe renderer defaults', () => {
  const spawn = createSpriteSpawnComponents('Assets/UI/Button.png', {
    position: [4, -2, Number.NaN],
    size: [3.64, 1.82],
    pivot: [1.5, -1],
    color: [2, 0.25, Number.NaN, -1],
    parent: 17,
  });
  assert.equal(spawn.name, 'Button');
  assert.equal(spawn.parent, 17);
  assert.deepEqual(spawn.components.Transform.position, [4, -2, 0]);
  assert.deepEqual(spawn.components.SpriteRenderer, {
    sprite: 'Assets/UI/Button.png',
    color: [1, 0.25, 1, 0],
    size: [3.64, 1.82],
    pivot: [1, 0],
    flip_x: false,
    flip_y: false,
    sorting_layer: 'default',
    sorting_order: 0,
  });
});

test('sprite creation sanitizes invalid sizes without changing flip or sorting defaults', () => {
  const spawn = createSpriteSpawnComponents('white', { size: [0, Number.NaN] });
  assert.deepEqual(spawn.components.SpriteRenderer.size, [0.0001, 1]);
});
