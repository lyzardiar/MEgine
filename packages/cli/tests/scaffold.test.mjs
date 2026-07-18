import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

test('mengine new creates a TypeScript project that is ready for the player build', () => {
  const root = join(tmpdir(), `mengine-cli-new-${process.pid}-${Date.now()}`);
  const name = 'TypeScript Game';
  try {
    mkdirSync(root, { recursive: true });
    const result = spawnSync(process.execPath, [cli, 'new', name], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const project = join(root, name);
    const manifest = JSON.parse(readFileSync(join(project, 'project.json'), 'utf8'));
    assert.equal(manifest.startupScript, 'Assets/Scripts/Main.ts');
    assert.equal(manifest.assetMode, 'all');
    assert.deepEqual(manifest.alwaysInclude, []);
    assert.equal(existsSync(join(project, 'Assets', 'Scripts', 'Main.ts')), true);
    assert.equal(existsSync(join(project, 'Assets', 'Scripts', 'mengine.d.ts')), true);
    const engineTypes = readFileSync(join(project, 'Assets', 'Scripts', 'mengine.d.ts'), 'utf8');
    assert.match(engineTypes, /playAnimation\(entity:/);
    assert.match(engineTypes, /seekAnimation\(entity:/);
    assert.match(engineTypes, /seekAudio\(entity:/);
    assert.equal(existsSync(join(project, 'Assets', 'Models')), true);
    assert.deepEqual(
      JSON.parse(readFileSync(join(project, 'ProjectSettings', 'sorting-layers.json'), 'utf8')),
      { version: 1, layers: [{ id: 'default', name: 'Default' }] },
    );
    assert.match(
      readFileSync(join(project, 'Assets', 'Scripts', 'Main.ts'), 'utf8'),
      /function onSceneLoaded/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
