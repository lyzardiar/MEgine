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
    version: 10,
    name: 'Paint',
    shader: 'pbr',
    custom_shader: '',
    custom_parameters: {},
    custom_keywords: {},
    custom_textures: {},
    surface: 'opaque',
    blend_mode: 'alpha',
    transparent_depth_write: false,
    render_queue: -1,
    base_color: [0.8, 0.8, 0.8, 1],
    metallic: 0,
    roughness: 0.5,
    ior: 1.5,
    clearcoat: 0,
    clearcoat_roughness: 0.1,
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
    mipmap_filter: 'linear',
    anisotropy: 1,
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
  assert.equal(material.ior, 1.5);
  assert.equal(material.clearcoat, 0);
  assert.equal(material.clearcoat_roughness, 0.1);
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
  assert.equal(material.mipmap_filter, 'linear');
  assert.equal(material.anisotropy, 1);
  assert.deepEqual(parseMaterialAsset(serializeMaterialAsset(material)), material);
});

test('legacy material assets upgrade to safe pipeline defaults', () => {
  const legacy = parseMaterialAsset(JSON.stringify({
    version: 2,
    name: 'Legacy',
    surface: 'transparent',
  }));
  assert.equal(legacy.version, 10);
  assert.equal(legacy.blend_mode, 'alpha');
  assert.equal(legacy.transparent_depth_write, false);
  assert.equal(legacy.render_queue, -1);
  assert.equal(legacy.custom_shader, '');
  assert.equal(legacy.mipmap_filter, 'linear');
  assert.equal(legacy.anisotropy, 1);
  assert.equal(legacy.clearcoat, 0);
  assert.equal(legacy.clearcoat_roughness, 0.1);
  assert.equal(legacy.ior, 1.5);
  assert.throws(() => parseMaterialAsset('{"version":11}'), /Unsupported material version/);
  assert.throws(() => parseMaterialAsset('{"version":6,"filter":"cubic"}'), /Invalid material filter/);
  assert.throws(() => parseMaterialAsset('{"version":6,"mipmap_filter":"cubic"}'), /Invalid material mipmap_filter/);
});

test('anisotropic material sampling is bounded and forces compatible filters', () => {
  const material = parseMaterialAsset(JSON.stringify({
    version: 6,
    filter: 'nearest',
    mipmap_filter: 'nearest',
    anisotropy: 32,
  }));
  assert.equal(material.anisotropy, 16);
  assert.equal(material.filter, 'linear');
  assert.equal(material.mipmap_filter, 'linear');
});

test('clearcoat material parameters are bounded and round trip', () => {
  const material = parseMaterialAsset(JSON.stringify({
    version: 6,
    clearcoat: 2,
    clearcoat_roughness: 0,
  }));
  assert.equal(material.clearcoat, 1);
  assert.equal(material.clearcoat_roughness, 0.04);
  assert.deepEqual(parseMaterialAsset(serializeMaterialAsset(material)), material);
});

test('material v7 index of refraction is bounded and round trips', () => {
  const low = parseMaterialAsset('{"version":7,"ior":0.5}');
  const high = parseMaterialAsset('{"version":7,"ior":4}');
  assert.equal(low.ior, 1);
  assert.equal(high.ior, 2.5);
  high.ior = 1.33;
  assert.deepEqual(parseMaterialAsset(serializeMaterialAsset(high)), high);
});

test('custom material shader references normalize project separators', () => {
  const material = parseMaterialAsset(JSON.stringify({
    shader: 'custom',
    custom_shader: ' Assets\\Shaders\\Rim.mshader ',
  }));
  assert.equal(material.shader, 'custom');
  assert.equal(material.custom_shader, 'Assets/Shaders/Rim.mshader');
});

test('material v10 upgrades reflected values and stores keyword and texture overrides', () => {
  const material = parseMaterialAsset(JSON.stringify({
    version: 8,
    shader: 'custom',
    custom_shader: 'Assets/Shaders/Rim.mshader',
    custom_parameters: {
      rim_power: [2, 0, 0, 0],
      rim_color: [1, 0.5, 0, 1],
    },
    custom_keywords: { USE_RIM: true, USE_DETAIL: false },
    custom_textures: { detail: ' Assets\\Textures\\detail.png ' },
  }));
  assert.deepEqual(material.custom_parameters, {
    rim_color: [1, 0.5, 0, 1],
    rim_power: [2, 0, 0, 0],
  });
  assert.deepEqual(material.custom_keywords, { USE_DETAIL: false, USE_RIM: true });
  assert.deepEqual(material.custom_textures, { detail: 'Assets/Textures/detail.png' });
  assert.deepEqual(parseMaterialAsset(serializeMaterialAsset(material)), material);
  assert.throws(() => parseMaterialAsset(JSON.stringify({
    version: 8,
    shader: 'pbr',
    custom_parameters: { rim_power: [2, 0, 0, 0] },
  })), /Only custom materials/);
  assert.throws(() => parseMaterialAsset(JSON.stringify({
    version: 8,
    shader: 'custom',
    custom_parameters: { 'bad-name': [2, 0, 0, 0] },
  })), /Invalid custom material parameter name/);
  assert.throws(() => parseMaterialAsset(JSON.stringify({
    version: 10,
    shader: 'custom',
    custom_keywords: { USE_RIM: 1 },
  })), /must be a boolean/);
  assert.throws(() => parseMaterialAsset(JSON.stringify({
    version: 10,
    shader: 'custom',
    custom_textures: { detail: '../outside.png' },
  })), /must reference an Assets image/);
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
