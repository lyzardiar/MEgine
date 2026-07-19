import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SURFACE_SHADER,
  normalizeSurfaceShaderParameterValue,
  normalizeSurfaceShaderSource,
  parseSurfaceShaderKeywords,
  parseSurfaceShaderParameters,
  surfaceShaderDiagnostics,
  validateSurfaceShaderSource,
} from '../src/surfaceShader.ts';

test('default surface shader satisfies the editor contract', () => {
  assert.deepEqual(surfaceShaderDiagnostics(DEFAULT_SURFACE_SHADER), []);
  assert.doesNotThrow(() => validateSurfaceShaderSource(DEFAULT_SURFACE_SHADER));
});

test('surface shader parameter schema reflects stable typed defaults', () => {
  const source = `/* MENGINE_PARAMETERS
  {"parameters":[
    {"name":"rim_color","label":"Rim Color","type":"color","default":[2,0.5,-1,1]},
    {"name":"rim_power","type":"float","default":2,"min":0,"max":8}
  ]}
  */
  ${DEFAULT_SURFACE_SHADER}`;
  const parameters = parseSurfaceShaderParameters(source);
  assert.deepEqual(parameters, [{
    name: 'rim_color',
    label: 'Rim Color',
    type: 'color',
    default: [1, 0.5, 0, 1],
    min: 0,
    max: 1,
  }, {
    name: 'rim_power',
    label: 'rim power',
    type: 'float',
    default: [2, 0, 0, 0],
    min: 0,
    max: 8,
  }]);
  assert.deepEqual(normalizeSurfaceShaderParameterValue(parameters[1], [99, 5, 5, 5]), [8, 0, 0, 0]);
  assert.deepEqual(surfaceShaderDiagnostics(source), []);
});

test('surface shader parameter schema rejects drift-prone declarations', () => {
  const wrap = (json) => `/* MENGINE_PARAMETERS\n${json}\n*/\n${DEFAULT_SURFACE_SHADER}`;
  assert.match(surfaceShaderDiagnostics(wrap('{"parameters":[{"name":"bad-name","type":"float","default":0}]}')).join(' '), /ASCII identifier/);
  assert.match(surfaceShaderDiagnostics(wrap('{"parameters":[{"name":"x","type":"float","default":0},{"name":"x","type":"float","default":1}]}')).join(' '), /Duplicate/);
  assert.match(surfaceShaderDiagnostics(wrap('{"parameters":[{"name":"tint","label":42,"type":"color","default":[1,1,1,1]}]}')).join(' '), /label must be a string/);
  assert.match(surfaceShaderDiagnostics(wrap('{"parameters":[{"name":"tint","type":"color","default":[1,1,1,1],"min":2}]}')).join(' '), /invalid range/);
  assert.match(surfaceShaderDiagnostics(wrap('{"parameters":[{"name":"tint","type":"color","default":[1,1,1,1],"max":2}]}')).join(' '), /invalid range/);
  assert.match(surfaceShaderDiagnostics(`${wrap('{"parameters":[]}')}\n${wrap('{"parameters":[]}')}`).join(' '), /only one parameter block/);
});

test('surface shader keyword schema reflects stable defaults and rejects drift', () => {
  const wrap = (json) => `/* MENGINE_PARAMETERS\n${json}\n*/\n${DEFAULT_SURFACE_SHADER}`;
  const source = wrap('{"keywords":[{"name":"USE_RIM","label":"Use Rim","default":true},{"name":"USE_DETAIL"}]}');
  assert.deepEqual(parseSurfaceShaderKeywords(source), [
    { name: 'USE_RIM', label: 'Use Rim', default: true },
    { name: 'USE_DETAIL', label: 'USE DETAIL', default: false },
  ]);
  assert.deepEqual(surfaceShaderDiagnostics(source), []);
  assert.match(surfaceShaderDiagnostics(wrap('{"keywords":[{"name":"BAD-NAME"}]}')).join(' '), /ASCII identifier/);
  assert.match(surfaceShaderDiagnostics(wrap('{"keywords":[{"name":"DUP"},{"name":"DUP"}]}')).join(' '), /Duplicate/);
  assert.match(surfaceShaderDiagnostics(wrap('{"keywords":[{"name":"FLAG","default":1}]}')).join(' '), /boolean/);
});

test('surface shader source normalizes newlines and rejects reserved entry points', () => {
  assert.equal(normalizeSurfaceShaderSource('fn mengine_surface_hook() {}\r\n'), 'fn mengine_surface_hook() {}\n');
  assert.match(
    surfaceShaderDiagnostics('fn other() {}\n@fragment fn fs_main() {}').join(' '),
    /Missing.*@fragment is reserved/,
  );
  assert.deepEqual(surfaceShaderDiagnostics(`
    fn mengine_lit_surface_hook(
      surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
    ) -> MEngineSurface { return surface; }
  `), []);
});
