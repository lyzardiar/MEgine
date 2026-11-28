import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { BUILD_TARGETS, listBuildTargets, resolveBuildTarget } from '../dist/platforms.js';
import { buildWebPackage, WEB_MANIFEST_FILE } from '../dist/webPackage.js';

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

test('buildWebPackage stages Web Player shell, project Assets, and deterministic SHA-256 manifest', () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
  const shellDir = join(repoRoot, 'platforms', 'web');
  const tempRoot = mkdtempSync(join(tmpdir(), 'mengine-web-pkg-'));
  try {
    const projectDir = join(tempRoot, 'SampleGame');
    const outDir = join(tempRoot, 'out-web');
    mkdirSync(join(projectDir, 'Assets', 'Scenes'), { recursive: true });
    mkdirSync(join(projectDir, 'Assets', 'Scripts'), { recursive: true });
    writeFileSync(
      join(projectDir, 'project.json'),
      JSON.stringify({
        name: 'SampleGame',
        mainScene: 'Assets/Scenes/Main.mscene',
        startupScript: 'Assets/Scripts/Main.ts',
        buildScenes: ['Assets/Scenes/Main.mscene'],
      }),
    );
    writeFileSync(join(projectDir, 'Assets', 'Scenes', 'Main.mscene'), '{"version":1,"name":"Main"}');
    writeFileSync(join(projectDir, 'Assets', 'Scripts', 'Main.ts'), 'export function onTick() {}');

    const manifest = buildWebPackage({
      projectDir,
      outputDir: outDir,
      shellDir,
      engineVersion: '0.1.0-test',
      clean: true,
    });

    assert.equal(manifest.target, 'web-wasm');
    assert.equal(manifest.scriptBackend, 'web-native-js');
    assert.equal(manifest.graphicsPrimary, 'webgpu');
    assert.equal(manifest.graphicsFallback, 'webgl2');
    assert.equal(manifest.project.name, 'SampleGame');
    assert.ok(existsSync(join(outDir, 'index.html')));
    assert.ok(existsSync(join(outDir, 'src', 'webEngineHost.ts')));
    assert.ok(existsSync(join(outDir, 'Assets', 'Scenes', 'Main.mscene')));
    assert.ok(existsSync(join(outDir, WEB_MANIFEST_FILE)));

    const parsed = JSON.parse(readFileSync(join(outDir, WEB_MANIFEST_FILE), 'utf8'));
    assert.equal(parsed.contentHash, manifest.contentHash);
    assert.ok(parsed.files.some((f) => f.path === 'index.html'));
    assert.ok(parsed.files.some((f) => f.path === 'Assets/Scenes/Main.mscene'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
