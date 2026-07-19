import assert from 'node:assert/strict';
import test from 'node:test';

import { createMaterialAsset } from '../src/materialAsset.ts';
import { resolveMaterialPreviewAppearance } from '../src/materialPreview.ts';

test('material asset preview carries PBR and unlit authoring values', () => {
  const material = createMaterialAsset('Neon');
  material.shader = 'unlit';
  material.base_color = [0.2, 0.4, 0.8, 0.7];
  material.metallic = 0.75;
  material.roughness = 0.2;
  material.ior = 1.33;
  material.clearcoat = 0.8;
  material.clearcoat_roughness = 0.12;
  material.emissive = [2, 1, 0.5];
  material.emissive_strength = 3;
  assert.deepEqual(resolveMaterialPreviewAppearance('Assets/Neon.mmat', material, null), {
    baseColor: [0.2, 0.4, 0.8, 0.7],
    metallic: 0.75,
    roughness: 0.2,
    ior: 1.33,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
    emissive: [2, 1, 0.5],
    emissiveStrength: 3,
    unlit: true,
  });
});

test('per-renderer PBR component overrides a material asset preview', () => {
  const asset = createMaterialAsset('Asset');
  asset.base_color = [1, 0, 0, 1];
  assert.deepEqual(resolveMaterialPreviewAppearance('Assets/Asset.mmat', asset, {
    base_color: [0, 1, 0, 0.5],
    metallic: 2,
    roughness: 0,
    ior: 1.33,
    emissive: [0, 0, 1],
    emissive_strength: 2,
    unlit: true,
  }), {
    baseColor: [0, 1, 0, 0.5],
    metallic: 1,
    roughness: 0.04,
    ior: 1.33,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    emissive: [0, 0, 1],
    emissiveStrength: 2,
    unlit: true,
  });
});

test('material property block overrides only enabled asset parameters', () => {
  const asset = createMaterialAsset('Asset');
  asset.shader = 'unlit';
  asset.base_color = [0.2, 0.3, 0.4, 1];
  asset.metallic = 0.7;
  asset.roughness = 0.6;
  asset.emissive = [1, 2, 3];
  asset.emissive_strength = 4;
  assert.deepEqual(resolveMaterialPreviewAppearance('Assets/Asset.mmat', asset, null, {
    override_base_color: true,
    base_color: [1, 0.5, 0.25, 0.75],
    override_metallic: false,
    metallic: 0.1,
    override_roughness: true,
    roughness: 0,
    override_ior: true,
    ior: 2,
    override_clearcoat: true,
    clearcoat: 0.85,
    override_clearcoat_roughness: true,
    clearcoat_roughness: 0.16,
    override_emissive: false,
    emissive: [9, 9, 9],
    override_emissive_strength: true,
    emissive_strength: 2,
  }), {
    baseColor: [1, 0.5, 0.25, 0.75],
    metallic: 0.7,
    roughness: 0.04,
    ior: 2,
    clearcoat: 0.85,
    clearcoatRoughness: 0.16,
    emissive: [1, 2, 3],
    emissiveStrength: 2,
    unlit: true,
  });
});

test('built-in material preview presets match runtime presets', () => {
  assert.deepEqual(resolveMaterialPreviewAppearance('gold', null, null), {
    baseColor: [1, 0.55, 0.08, 1],
    metallic: 0.9,
    roughness: 0.22,
    ior: 1.5,
    clearcoat: 0,
    clearcoatRoughness: 0.1,
    emissive: [0, 0, 0],
    emissiveStrength: 1,
    unlit: false,
  });
  assert.equal(resolveMaterialPreviewAppearance('unlit', null, null).unlit, true);
});
