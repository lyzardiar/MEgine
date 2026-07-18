import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { buildPcPackage } from '../dist/pcPackage.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('official spinning-cube sample is a standard editor and PC Build project', () => {
  const root = join(tmpdir(), `mengine-official-sample-${process.pid}-${Date.now()}`);
  const project = join(repositoryRoot, 'samples', 'spinning-cube');
  const runtime = join(root, process.platform === 'win32' ? 'runtime.exe' : 'runtime');
  const output = join(root, 'Build');
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(runtime, 'runtime-binary');

    const manifest = buildPcPackage({
      projectDir: project,
      outputDir: output,
      runtimePath: runtime,
      engineVersion: 'sample-contract-test',
    });

    assert.equal(manifest.project.mainScene, 'Assets/Scenes/Main.mscene');
    assert.deepEqual(manifest.project.buildScenes, ['Assets/Scenes/Main.mscene']);
    assert.equal(manifest.project.startupScript, 'Assets/Scripts/Main.js');
    assert.equal(existsSync(join(output, 'Assets', 'Scenes', 'Main.mscene')), true);
    assert.equal(existsSync(join(output, 'Assets', 'Scripts', 'Main.js')), true);
    assert.match(
      readFileSync(join(output, 'Assets', 'Scripts', 'Main.js'), 'utf8'),
      /pushCommandJson/,
    );
    assert.equal(existsSync(join(output, 'scene.mscene')), false);
    assert.equal(existsSync(join(output, 'main.js')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
