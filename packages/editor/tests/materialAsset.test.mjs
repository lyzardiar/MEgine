import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createMaterialAsset,
  isMaterialTexturePath,
  materialReferenceDiagnostics,
  parseMaterialAsset,
  serializeMaterialAsset,
} from '../src/materialAsset.ts';

test('material assets have stable authoring defaults', () => {
  assert.deepEqual(createMaterialAsset('Paint'), {
    version: 4,
    name: 'Paint',
    shader: 'pbr',
    custom_shader: '',
    surface: 'opaque',
    blend_mode: 'alpha',
    transparent_depth_write: false,
    render_queue: -1,
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
    occlusion_texture: '',
    occlusion_strength: 1,
    emissive_texture: '',
    uv_scale: [1, 1],
    uv_offset: [0, 0],
    uv_rotation: 0,
    wrap_u: 'repeat',
    wrap_v: 'repeat',
    filter: 'linear',
  });
});

test('material parsing normalizes ranges and texture separators', () => {
  const material = parseMaterialAsset(JSON.stringify({
    name: 'Glass',
    surface: 'transparent',
    blend_mode: 'premultiplied',
    transparent_depth_write: true,
    render_queue: 9999,
    base_color: [2, -1, 0.5, 0.25],
    metallic: 4,
    roughness: 0,
    base_color_texture: 'Assets\\Textures\\glass.png',
    normal_texture: 'Assets\\Textures\\glass-normal.png',
    normal_scale: -2,
    metallic_roughness_texture: 'Assets\\Textures\\glass-orm.png',
    occlusion_texture: 'Assets\\Textures\\glass-ao.png',
    occlusion_strength: 5,
    emissive_texture: 'Assets\\Textures\\glass-emissive.png',
    uv_rotation: -90,
    wrap_u: 'clamp',
    wrap_v: 'mirror',
    filter: 'nearest',
  }));
  assert.equal(material.surface, 'transparent');
  assert.equal(material.blend_mode, 'premultiplied');
  assert.equal(material.transparent_depth_write, true);
  assert.equal(material.render_queue, 5000);
  assert.deepEqual(material.base_color, [1, 0, 0.5, 0.25]);
  assert.equal(material.metallic, 1);
  assert.equal(material.roughness, 0.04);
  assert.equal(material.base_color_texture, 'Assets/Textures/glass.png');
  assert.equal(material.normal_texture, 'Assets/Textures/glass-normal.png');
  assert.equal(material.normal_scale, 0);
  assert.equal(material.metallic_roughness_texture, 'Assets/Textures/glass-orm.png');
  assert.equal(material.occlusion_texture, 'Assets/Textures/glass-ao.png');
  assert.equal(material.occlusion_strength, 1);
  assert.equal(material.emissive_texture, 'Assets/Textures/glass-emissive.png');
  assert.equal(material.uv_rotation, 270);
  assert.equal(material.wrap_u, 'clamp');
  assert.equal(material.wrap_v, 'mirror');
  assert.equal(material.filter, 'nearest');
  assert.deepEqual(parseMaterialAsset(serializeMaterialAsset(material)), material);
});

test('legacy material assets upgrade to safe pipeline defaults', () => {
  const legacy = parseMaterialAsset(JSON.stringify({
    version: 2,
    name: 'Legacy',
    surface: 'transparent',
  }));
  assert.equal(legacy.version, 4);
  assert.equal(legacy.blend_mode, 'alpha');
  assert.equal(legacy.transparent_depth_write, false);
  assert.equal(legacy.render_queue, -1);
  assert.equal(legacy.custom_shader, '');
  assert.throws(() => parseMaterialAsset('{"version":5}'), /Unsupported material version/);
  assert.throws(() => parseMaterialAsset('{"version":4,"filter":"cubic"}'), /Invalid material filter/);
});

test('custom material shader references normalize project separators', () => {
  const material = parseMaterialAsset(JSON.stringify({
    shader: 'custom',
    custom_shader: ' Assets\\Shaders\\Rim.mshader ',
  }));
  assert.equal(material.shader, 'custom');
  assert.equal(material.custom_shader, 'Assets/Shaders/Rim.mshader');
});

test('material references report missing and unsupported authoring assets', () => {
  const material = createMaterialAsset('Broken');
  material.shader = 'custom';
  material.custom_shader = 'Assets/Shaders/Rim.mshader';
  material.base_color_texture = 'Assets/Textures/paint.png';
  material.normal_texture = 'Assets/Textures/paint.txt';
  assert.deepEqual(materialReferenceDiagnostics(material, [
    'Assets/Shaders/Other.mshader',
    'Assets/Textures/paint.png',
  ]), [
    {
      field: 'custom_shader',
      message: 'Missing Surface Shader: Assets/Shaders/Rim.mshader',
    },
    {
      field: 'normal_texture',
      message: 'Unsupported texture asset: Assets/Textures/paint.txt',
    },
  ]);
  assert.equal(isMaterialTexturePath('Assets/Textures/data.EXR'), true);
  assert.equal(isMaterialTexturePath('Assets/Textures/data.json'), false);
});

test('custom materials require a valid surface shader reference', () => {
  const material = createMaterialAsset('Custom');
  material.shader = 'custom';
  assert.match(materialReferenceDiagnostics(material, [])[0].message, /require/i);
  material.custom_shader = 'Assets/Shaders/Rim.wgsl';
  assert.match(materialReferenceDiagnostics(material, [])[0].message, /\.mshader/i);
});
