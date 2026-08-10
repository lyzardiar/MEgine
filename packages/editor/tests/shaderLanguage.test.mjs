import assert from 'node:assert/strict';
import test from 'node:test';

import {
  highlightShaderSource,
  shaderCompletions,
} from '../src/shaderLanguage.ts';

test('shader highlighter classifies WGSL and MEngine language tokens without changing source', () => {
  const source = `// tint\nfn mengine_lit_surface_hook(surface: MEngineSurface) -> MEngineSurface {\n  surface.base_color = vec3<f32>(1.0);\n  return surface;\n}`;
  const tokens = highlightShaderSource(source);
  assert.equal(tokens.map((token) => token.text).join(''), source);
  assert.ok(tokens.some((token) => token.kind === 'comment' && token.text === '// tint'));
  assert.ok(tokens.some((token) => token.kind === 'keyword' && token.text === 'fn'));
  assert.ok(tokens.some((token) => token.kind === 'type' && token.text === 'MEngineSurface'));
  assert.ok(tokens.some((token) => token.kind === 'builtin' && token.text === 'mengine_lit_surface_hook'));
  assert.ok(tokens.some((token) => token.kind === 'property' && token.text === 'base_color'));
  assert.ok(tokens.some((token) => token.kind === 'number' && token.text === '1.0'));
});

test('shader completion follows MEngine surface and UI member contracts', () => {
  const surface = 'surface.ro';
  const surfaceResult = shaderCompletions(surface, surface.length);
  assert.deepEqual(surfaceResult.items.map((item) => item.label), ['roughness']);
  assert.equal(surfaceResult.start, 'surface.'.length);

  const ui = 'input.screen_';
  const uiResult = shaderCompletions(ui, ui.length);
  assert.deepEqual(uiResult.items.map((item) => item.label), ['screen_position']);
});

test('shader completion reflects declared material parameters, keywords, and textures', () => {
  const source = `/* MENGINE_PARAMETERS\n{"parameters":[{"name":"rim_power","type":"float","default":2}],"keywords":[{"name":"USE_RIM"}],"textures":[{"name":"detail","type":"color"}]}\n*/\nfn mengine_lit_surface_hook(surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>) -> MEngineSurface {\n  let value = mengine_\n  return surface;\n}`;
  const cursor = source.indexOf('mengine_\n') + 'mengine_'.length;
  const labels = shaderCompletions(source, cursor).items.map((item) => item.label);
  assert.ok(labels.includes('mengine_param_rim_power'));
  assert.ok(labels.includes('mengine_keyword_USE_RIM'));
  assert.ok(labels.includes('mengine_texture_detail'));
});

test('forced shader completion works at an empty cursor', () => {
  const result = shaderCompletions('', 0, true);
  assert.ok(result.items.some((item) => item.label === 'MEngineSurface'));
  assert.ok(result.items.some((item) => item.label === 'mengine_ui_main_texture'));
});
