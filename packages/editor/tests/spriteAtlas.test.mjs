import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSpriteAtlasAsset,
  normalizeSpriteAtlasAsset,
  planSpriteAtlas,
  serializeSpriteAtlasAsset,
  spriteAtlasTexturePath,
} from '../src/spriteAtlas.ts';

test('sprite atlas assets normalize paths, settings, and duplicates', () => {
  const asset = normalizeSpriteAtlasAsset({
    version: 1,
    name: ' UI ',
    max_size: 1024,
    padding: 3.8,
    pixels_per_unit: 32,
    sprites: ['assets/UI/a.png', 'Assets/UI/a.png', 'Assets/UI/sheet.png#Idle'],
  });
  assert.deepEqual(asset, {
    version: 1,
    name: 'UI',
    max_size: 1024,
    padding: 3,
    pixels_per_unit: 32,
    sprites: ['Assets/UI/a.png', 'Assets/UI/sheet.png#Idle'],
  });
  assert.equal(spriteAtlasTexturePath('Assets/Atlases/UI.matlas'), 'Assets/Atlases/UI.png');
  assert.equal(JSON.parse(serializeSpriteAtlasAsset(createSpriteAtlasAsset())).version, 1);
});

test('atlas packing is deterministic, power-of-two, and collision-safe', () => {
  const inputs = [
    { reference: 'Assets/A/idle.png', width: 20, height: 10, pivot: [0.5, 0.5] },
    { reference: 'Assets/B/idle.png', width: 18, height: 12, pivot: [0, 1] },
    { reference: 'Assets/A/run.png', width: 40, height: 8, pivot: [0.5, 0] },
  ];
  const first = planSpriteAtlas(inputs, 256, 2);
  const second = planSpriteAtlas([...inputs].reverse(), 256, 2);
  assert.deepEqual(first, second);
  assert.equal(first.width, 128);
  assert.equal(first.height, 32);
  assert.equal(new Set(first.entries.map((entry) => entry.name)).size, 3);
  assert.ok(first.entries.filter((entry) => entry.name.startsWith('idle_')).length === 2);
});

test('atlas packing rejects oversized and overflowing inputs', () => {
  assert.throws(() => planSpriteAtlas([
    { reference: 'Assets/huge.png', width: 256, height: 10, pivot: [0.5, 0.5] },
  ], 256, 2), /exceeds/);
  const many = Array.from({ length: 20 }, (_, index) => ({
    reference: `Assets/${index}.png`, width: 100, height: 100, pivot: [0.5, 0.5],
  }));
  assert.throws(() => planSpriteAtlas(many, 256, 2), /do not fit/);
});
