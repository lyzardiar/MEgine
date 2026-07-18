import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SURFACE_SHADER,
  normalizeSurfaceShaderSource,
  surfaceShaderDiagnostics,
  validateSurfaceShaderSource,
} from '../src/surfaceShader.ts';

test('default surface shader satisfies the editor contract', () => {
  assert.deepEqual(surfaceShaderDiagnostics(DEFAULT_SURFACE_SHADER), []);
  assert.doesNotThrow(() => validateSurfaceShaderSource(DEFAULT_SURFACE_SHADER));
});

test('surface shader source normalizes newlines and rejects reserved entry points', () => {
  assert.equal(normalizeSurfaceShaderSource('fn mengine_surface_hook() {}\r\n'), 'fn mengine_surface_hook() {}\n');
  assert.match(
    surfaceShaderDiagnostics('fn other() {}\n@fragment fn fs_main() {}').join(' '),
    /Missing.*@fragment is reserved/,
  );
});
