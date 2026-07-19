import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isMaterialPropertyBlockTextureAsset,
  materialPropertyBlockBindingDiagnostics,
  materialPropertyParameterMap,
  materialPropertyTextureMap,
} from '../src/materialPropertyBlock.ts';

const parameters = [{
  name: 'power', label: 'Power', type: 'float', default: [2, 0, 0, 0], min: 0, max: 8,
}];
const textures = [{
  name: 'detail', label: 'Detail', type: 'color', default: 'Assets/Textures/default.png',
}];

test('Material Property Block custom bindings preserve parallel values and normalize texture paths', () => {
  const data = {
    custom_parameter_names: ['power'],
    custom_parameter_values: [[4, 0, 0, 0]],
    custom_texture_names: ['detail'],
    custom_texture_values: [' Assets\\Textures\\detail.png '],
  };
  assert.deepEqual(materialPropertyParameterMap(data).get('power'), [4, 0, 0, 0]);
  assert.equal(materialPropertyTextureMap(data).get('detail'), 'Assets/Textures/detail.png');
  assert.deepEqual(materialPropertyBlockBindingDiagnostics(data, parameters, textures), []);
  assert.equal(isMaterialPropertyBlockTextureAsset({ relPath: 'Assets/Data/mask.tga' }), true);
  assert.equal(isMaterialPropertyBlockTextureAsset({ relPath: 'Assets/Data/light.hdr' }), false);
});

test('Material Property Block diagnostics reject mismatched stale duplicate and unsafe bindings', () => {
  const diagnostics = materialPropertyBlockBindingDiagnostics({
    custom_parameter_names: ['power', 'power', 'removed'],
    custom_parameter_values: [[4, 0, 0, 0], [5, 0, 0, 0]],
    custom_texture_names: ['detail', 'removed'],
    custom_texture_values: ['../outside.png', 'Assets/Textures/stale.png'],
  }, parameters, textures);
  assert.ok(diagnostics.some((entry) => entry.message.includes('equal lengths')));
  assert.ok(diagnostics.some((entry) => entry.message.includes("'power'")));
  assert.ok(diagnostics.some((entry) => entry.message.includes("'detail'")));
  assert.ok(diagnostics.some((entry) => entry.message.includes("'removed'")));
});
