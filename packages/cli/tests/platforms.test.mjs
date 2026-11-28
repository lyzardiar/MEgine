import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILD_TARGETS, listBuildTargets, resolveBuildTarget } from '../dist/platforms.js';

test('CLI multi-platform target matrix matches Desktop/Mobile/Web script VM policies', () => {
  const active = listBuildTargets(false).map((t) => t.id).sort();
  assert.deepEqual(active, ['android-arm64', 'web-wasm', 'windows-x64']);

  assert.equal(resolveBuildTarget('windows-x64').scriptBackend, 'v8');
  assert.equal(resolveBuildTarget('android-arm64').scriptBackend, 'v8');
  assert.equal(resolveBuildTarget('android-arm64').graphicsFallback, 'gles');
  assert.equal(resolveBuildTarget('ios-arm64').stage, 'adapter-reserved');
  assert.equal(resolveBuildTarget('ios-arm64').scriptBackend, 'quickjs');
  assert.equal(resolveBuildTarget('web-wasm').scriptBackend, 'web-native-js');
  assert.equal(resolveBuildTarget('web-wasm').graphicsPrimary, 'webgpu');
  assert.equal(resolveBuildTarget('macos-arm64').stage, 'adapter-reserved');
  assert.equal(resolveBuildTarget('linux-x64').stage, 'adapter-reserved');
  assert.equal(Object.keys(BUILD_TARGETS).length, 6);
  assert.throws(() => resolveBuildTarget('unknown-target'), /Unknown target/);
});
