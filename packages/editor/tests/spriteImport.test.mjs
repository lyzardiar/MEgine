import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSpriteImportSettings,
  normalizeSpriteImportSettings,
  serializeSpriteImportSettings,
  sliceSpriteGrid,
  spriteImportPath,
  spriteSliceName,
  spriteTexturePath,
  uniqueSpriteSliceName,
} from '../src/spriteImport.ts';

test('sprite references retain a stable sidecar and subresource identity', () => {
  assert.equal(spriteTexturePath(' Assets/hero.png#Run '), 'Assets/hero.png');
  assert.equal(spriteSliceName('Assets/hero.png#Run '), 'Run');
  assert.equal(spriteImportPath('Assets/hero.png#Run'), 'Assets/hero.png.sprite.json');
  assert.equal(spriteSliceName('Assets/hero.png'), null);
});

test('sprite import normalization matches runtime bounds and name validation', () => {
  const settings = normalizeSpriteImportSettings({
    mode: 'multiple',
    pixels_per_unit: 32,
    slices: [{ name: 'Idle', rect: [0, 0, 16, 32], pivot: [0.5, 2] }],
  }, [64, 32]);
  assert.deepEqual(settings.slices[0], {
    name: 'Idle',
    rect: [0, 0, 16, 32],
    pivot: [0.5, 1],
  });
  assert.throws(() => normalizeSpriteImportSettings({
    mode: 'multiple',
    slices: [{ name: 'A', rect: [0, 0, 8, 8] }, { name: 'a', rect: [8, 0, 8, 8] }],
  }, [16, 16]), /duplicate/);
  assert.throws(() => normalizeSpriteImportSettings({
    mode: 'multiple',
    slices: [{ name: 'Outside', rect: [12, 0, 8, 8] }],
  }, [16, 16]), /outside/);
});

test('grid slicing uses deterministic row-major names, offsets, and padding', () => {
  const slices = sliceSpriteGrid([36, 19], {
    cellWidth: 16,
    cellHeight: 8,
    offsetX: 1,
    offsetY: 1,
    paddingX: 2,
    paddingY: 2,
    baseName: 'Run',
    pivot: [0.5, 0],
  });
  assert.deepEqual(slices.map((slice) => [slice.name, slice.rect]), [
    ['Run_0', [1, 1, 16, 8]],
    ['Run_1', [19, 1, 16, 8]],
    ['Run_2', [1, 11, 16, 8]],
    ['Run_3', [19, 11, 16, 8]],
  ]);
  assert.equal(uniqueSpriteSliceName(slices, 'Run_0'), 'Run_0_1');
  assert.equal(JSON.parse(serializeSpriteImportSettings({
    ...createSpriteImportSettings(),
    mode: 'multiple',
    slices,
  }, [36, 19])).slices.length, 4);
});
