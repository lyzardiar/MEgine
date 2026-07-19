import assert from 'node:assert/strict';
import test from 'node:test';

import { createMaterialAsset, serializeMaterialAsset } from '../src/materialAsset.ts';
import {
  applyMaterialInstance,
  createMaterialInstanceAsset,
  parseMaterialInstanceAsset,
  resolveMaterialAssetWithReader,
  serializeMaterialInstanceAsset,
} from '../src/materialInstanceAsset.ts';

test('Material Instance normalizes explicit overrides and inherits parent state', () => {
  const parent = createMaterialAsset('Base');
  parent.shader = 'custom';
  parent.custom_shader = 'Assets/Shaders/Rim.mshader';
  parent.custom_parameters = { rim_color: [1, 0.5, 0, 1] };
  parent.base_color_texture = 'Assets/Textures/Paint.png';
  parent.roughness = 0.8;
  const instance = parseMaterialInstanceAsset(JSON.stringify({
    version: 1,
    name: 'Wet',
    parent: 'Assets\\Materials\\Base.mmat',
    overrides: {
      roughness: 0,
      ior: 1.33,
      clearcoat: 2,
      custom_parameters: { rim_power: [3, 0, 0, 0] },
    },
  }));
  assert.equal(instance.parent, 'Assets/Materials/Base.mmat');
  assert.equal(instance.version, 2);
  assert.deepEqual(instance.overrides, {
    roughness: 0.04,
    ior: 1.33,
    clearcoat: 1,
    custom_parameters: { rim_power: [3, 0, 0, 0] },
  });
  const resolved = applyMaterialInstance(parent, instance);
  assert.equal(resolved.name, 'Wet');
  assert.equal(resolved.roughness, 0.04);
  assert.equal(resolved.ior, 1.33);
  assert.equal(resolved.clearcoat, 1);
  assert.equal(resolved.shader, 'custom');
  assert.equal(resolved.base_color_texture, 'Assets/Textures/Paint.png');
  assert.deepEqual(resolved.custom_parameters, {
    rim_color: [1, 0.5, 0, 1],
    rim_power: [3, 0, 0, 0],
  });
  assert.deepEqual(parseMaterialInstanceAsset(serializeMaterialInstanceAsset(instance)), instance);
});

test('Material Instance resolves nested parents and rejects case-insensitive cycles', async () => {
  const base = createMaterialAsset('Base');
  base.metallic = 0.75;
  const files = new Map([
    ['assets/materials/base.mmat', serializeMaterialAsset(base)],
    ['assets/materials/wet.minst', JSON.stringify({
      version: 1,
      name: 'Wet',
      parent: 'Assets/Materials/Base.mmat',
      overrides: { roughness: 0.12 },
    })],
    ['assets/materials/hero.minst', JSON.stringify({
      version: 1,
      name: 'Hero',
      parent: 'Assets/Materials/Wet.minst',
      overrides: { base_color: [0.2, 0.4, 0.8, 1] },
    })],
  ]);
  const reader = async (path) => {
    const text = files.get(path.toLowerCase());
    if (!text) throw new Error(`missing ${path}`);
    return text;
  };
  const resolved = await resolveMaterialAssetWithReader('Assets/Materials/Hero.minst', reader);
  assert.equal(resolved.name, 'Hero');
  assert.equal(resolved.metallic, 0.75);
  assert.equal(resolved.roughness, 0.12);
  assert.deepEqual(resolved.base_color, [0.2, 0.4, 0.8, 1]);

  files.set('assets/materials/wet.minst', JSON.stringify({
    version: 1,
    parent: 'assets/materials/HERO.minst',
  }));
  await assert.rejects(
    () => resolveMaterialAssetWithReader('Assets/Materials/Hero.minst', reader),
    /cycle.*Hero\.minst.*HERO\.minst/i,
  );
});

test('Material Instance requires a safe supported parent and rejects unknown overrides', () => {
  assert.throws(() => parseMaterialInstanceAsset('{"version":1,"parent":""}'), /parent is required/i);
  assert.throws(() => parseMaterialInstanceAsset(
    '{"version":1,"parent":"Assets/A.png"}',
  ), /must be a \.mmat/i);
  assert.throws(() => parseMaterialInstanceAsset(
    '{"version":1,"parent":"Assets/A.mmat","overrides":{"shader":"unlit"}}',
  ), /unsupported.*override/i);
  assert.throws(() => applyMaterialInstance(createMaterialAsset('Base'), parseMaterialInstanceAsset(
    '{"version":2,"parent":"Assets/A.mmat","overrides":{"custom_parameters":{"rim":[1,0,0,0]}}}',
  )), /only custom materials/i);
  const created = createMaterialInstanceAsset('Child', 'Assets/Materials/Base.mmat');
  assert.deepEqual(created, {
    version: 2,
    name: 'Child',
    parent: 'Assets/Materials/Base.mmat',
    overrides: {},
  });
  assert.equal(parseMaterialInstanceAsset('{"parent":"Assets/Materials/Base.mmat"}').version, 2);
});
