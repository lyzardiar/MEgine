import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMaterialAsset,
  parseMaterialAsset,
  serializeMaterialAsset,
} from '../src/materialAsset.ts';

test('material assets have stable authoring defaults', () => {
  assert.deepEqual(createMaterialAsset('Paint'), {
    version: 1,
    name: 'Paint',
    shader: 'pbr',
    surface: 'opaque',
    base_color: [0.8, 0.8, 0.8, 1],
    metallic: 0,
    roughness: 0.5,
    emissive: [0, 0, 0],
    emissive_strength: 1,
    double_sided: false,
    alpha_cutoff: 0.5,
    base_color_texture: '',
    normal_texture: '',
    normal_scale: 1,
    metallic_roughness_texture: '',
    occlusion_strength: 1,
    emissive_texture: '',
    uv_scale: [1, 1],
    uv_offset: [0, 0],
  });
});

test('material parsing normalizes ranges and texture separators', () => {
  const material = parseMaterialAsset(JSON.stringify({
    name: 'Glass',
    surface: 'transparent',
    base_color: [2, -1, 0.5, 0.25],
    metallic: 4,
    roughness: 0,
    base_color_texture: 'Assets\\Textures\\glass.png',
    normal_texture: 'Assets\\Textures\\glass-normal.png',
    normal_scale: -2,
    metallic_roughness_texture: 'Assets\\Textures\\glass-orm.png',
    occlusion_strength: 5,
    emissive_texture: 'Assets\\Textures\\glass-emissive.png',
  }));
  assert.equal(material.surface, 'transparent');
  assert.deepEqual(material.base_color, [1, 0, 0.5, 0.25]);
  assert.equal(material.metallic, 1);
  assert.equal(material.roughness, 0.04);
  assert.equal(material.base_color_texture, 'Assets/Textures/glass.png');
  assert.equal(material.normal_texture, 'Assets/Textures/glass-normal.png');
  assert.equal(material.normal_scale, 0);
  assert.equal(material.metallic_roughness_texture, 'Assets/Textures/glass-orm.png');
  assert.equal(material.occlusion_strength, 1);
  assert.equal(material.emissive_texture, 'Assets/Textures/glass-emissive.png');
  assert.deepEqual(parseMaterialAsset(serializeMaterialAsset(material)), material);
});
