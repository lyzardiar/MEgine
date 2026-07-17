import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  BUILD_MANIFEST_FILE,
  PLAYER_CONFIG_FILE,
  buildPcPackage,
} from '../dist/pcPackage.js';

function fixture(name) {
  const root = join(tmpdir(), `mengine-pc-package-${name}-${process.pid}-${Date.now()}`);
  const project = join(root, 'project');
  mkdirSync(join(project, 'Assets', 'Scenes'), { recursive: true });
  mkdirSync(join(project, 'Assets', 'Scripts'), { recursive: true });
  mkdirSync(join(project, 'Assets', 'Textures'), { recursive: true });
  writeFileSync(join(project, 'project.json'), JSON.stringify({
    name: 'Package Test',
    version: 7,
    mainScene: 'Assets/Scenes/Main.mscene',
    startupScript: 'Assets/Scripts/main.js',
  }));
  writeFileSync(join(project, 'Assets', 'Scenes', 'Main.mscene'), '{"version":1}');
  writeFileSync(join(project, 'Assets', 'Scripts', 'main.js'), 'function onTick() {}');
  writeFileSync(join(project, 'Assets', 'Textures', 'pixel.bin'), Buffer.from([1, 2, 3, 4]));
  const runtime = join(root, process.platform === 'win32' ? 'runtime.exe' : 'runtime');
  writeFileSync(runtime, 'runtime-binary');
  return { root, project, runtime, output: join(root, 'Build') };
}

test('buildPcPackage creates a directly launchable, hashed project bundle', () => {
  const paths = fixture('success');
  try {
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      architecture: 'x64',
    });
    assert.equal(manifest.executable, 'Package Test.exe');
    assert.deepEqual(manifest.project, {
      name: 'Package Test',
      version: 7,
      mainScene: 'Assets/Scenes/Main.mscene',
      startupScript: 'Assets/Scripts/main.js',
    });

    const playerConfig = JSON.parse(readFileSync(join(paths.output, PLAYER_CONFIG_FILE), 'utf8'));
    assert.deepEqual(playerConfig, {
      schemaVersion: 1,
      projectName: 'Package Test',
      projectRoot: '.',
      mainScene: 'Assets/Scenes/Main.mscene',
      startupScript: 'Assets/Scripts/main.js',
    });
    assert.equal(readFileSync(join(paths.output, 'Assets', 'Scenes', 'Main.mscene'), 'utf8'), '{"version":1}');
    assert.equal(readFileSync(join(paths.output, manifest.executable), 'utf8'), 'runtime-binary');

    const diskManifest = JSON.parse(readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8'));
    assert.deepEqual(diskManifest, manifest);
    for (const entry of manifest.files) {
      const bytes = readFileSync(join(paths.output, ...entry.path.split('/')));
      assert.equal(entry.size, bytes.length);
      assert.equal(entry.sha256, createHash('sha256').update(bytes).digest('hex'));
    }
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage protects existing output until clean is explicit', () => {
  const paths = fixture('clean');
  try {
    mkdirSync(paths.output, { recursive: true });
    writeFileSync(join(paths.output, 'keep.txt'), 'old');
    const options = {
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
    };
    assert.throws(() => buildPcPackage(options), /--clean/);
    const manifest = buildPcPackage({ ...options, clean: true });
    assert.equal(manifest.project.name, 'Package Test');
    assert.throws(() => readFileSync(join(paths.output, 'keep.txt')), /ENOENT/);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects a main scene outside packaged content roots', () => {
  const paths = fixture('escape');
  try {
    writeFileSync(join(paths.project, 'outside.mscene'), '{}');
    writeFileSync(join(paths.project, 'project.json'), JSON.stringify({
      name: 'Unsafe',
      version: 1,
      mainScene: 'outside.mscene',
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /Assets or Scripts/);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage refuses an output directory that contains the project', () => {
  const paths = fixture('ancestor');
  try {
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.root,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      clean: true,
    }), /cannot contain the project/);
    assert.equal(readFileSync(join(paths.project, 'project.json'), 'utf8').length > 0, true);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});
