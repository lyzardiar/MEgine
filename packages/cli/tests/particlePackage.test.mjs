import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildPcPackage } from '../dist/pcPackage.js';

test('referenced particle definitions include inline material textures and meshes', () => {
  const root = fileURLToPath(new URL(`../../../tmp/docs-artifacts/unity-import/particle-package-${process.pid}/`, import.meta.url));
  const project = join(root, 'project');
  for (const folder of ['Scenes', 'Effects', 'Textures', 'Models']) mkdirSync(join(project, 'Assets', folder), { recursive: true });
  const save = (path, value) => writeFileSync(join(project, path), JSON.stringify(value));
  save('project.json', { name: 'Particle dependency test', version: 1, mainScene: 'Assets/Scenes/Main.mscene', assetMode: 'referenced' });
  save('Assets/Scenes/Main.mscene', { world: { entities: [{ components: { ParticleEmitter3D: { definition: 'Assets/Effects/Spark.mparticle' } } }] } });
  save('Assets/Effects/Spark.mparticle', { version: 1, renderer: { mesh: 'Assets/Models/Spark.gltf' }, material: { textures: { _MainTex: { path: 'Assets/Textures/Spark.png' } } } });
  save('Assets/Models/Spark.gltf', { asset: { version: '2.0' } });
  const runtime = join(root, process.platform === 'win32' ? 'runtime.exe' : 'runtime');
  writeFileSync(runtime, 'runtime-test-fixture');
  const build = () => buildPcPackage({ projectDir: project, outputDir: join(root, 'build'), runtimePath: runtime, engineVersion: 'test' });
  try {
    assert.throws(build, /missing particle texture/);
    writeFileSync(join(project, 'Assets/Textures/Spark.png'), 'texture-fixture');
    const result = build();
    for (const path of ['Assets/Effects/Spark.mparticle', 'Assets/Textures/Spark.png', 'Assets/Models/Spark.gltf']) assert.ok(result.files.some(file => file.path === path), path);
    assert.ok(result.files.find(file => file.path === 'Assets/Models/Spark.gltf').includedBy.some(reason => reason.kind === 'particle mesh'));
  } finally {
    assert.ok(resolve(root).includes(`${process.pid}`));
    rmSync(root, { recursive: true, force: true });
  }
});
