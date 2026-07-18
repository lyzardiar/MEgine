import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
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
  publishStagedBuild,
} from '../dist/pcPackage.js';

function fixture(name) {
  const root = join(tmpdir(), `mengine-pc-package-${name}-${process.pid}-${Date.now()}`);
  const project = join(root, 'project');
  mkdirSync(join(project, 'Assets', 'Scenes'), { recursive: true });
  mkdirSync(join(project, 'Assets', 'Scripts'), { recursive: true });
  mkdirSync(join(project, 'Assets', 'Textures'), { recursive: true });
  mkdirSync(join(project, 'Assets', 'Materials'), { recursive: true });
  mkdirSync(join(project, 'Assets', 'Animations'), { recursive: true });
  mkdirSync(join(project, 'Assets', 'Audio'), { recursive: true });
  mkdirSync(join(project, 'ProjectSettings'), { recursive: true });
  writeFileSync(join(project, 'project.json'), JSON.stringify({
    name: 'Package Test',
    version: 7,
    mainScene: 'Assets/Scenes/Main.mscene',
    buildScenes: [
      'Assets/Scenes/Main.mscene',
      'Assets/Scenes/Level2.mscene',
    ],
    startupScript: 'Assets/Scripts/main.js',
  }));
  writeFileSync(join(project, 'Assets', 'Scenes', 'Main.mscene'), '{"version":1}');
  writeFileSync(join(project, 'Assets', 'Scenes', 'Level2.mscene'), '{"version":1,"name":"Level2"}');
  writeFileSync(join(project, 'Assets', 'Scripts', 'main.js'), 'function onTick() {}');
  writeFileSync(join(project, 'ProjectSettings', 'sorting-layers.json'), JSON.stringify({
    version: 1,
    layers: [
      { id: 'default', name: 'Default' },
      { id: 'effects', name: 'Effects' },
    ],
  }));
  writeFileSync(join(project, 'Assets', 'Textures', 'pixel.bin'), Buffer.from([1, 2, 3, 4]));
  const runtime = join(root, process.platform === 'win32' ? 'runtime.exe' : 'runtime');
  writeFileSync(runtime, 'runtime-binary');
  return { root, project, runtime, output: join(root, 'Build') };
}

test('buildPcPackage creates a directly launchable, hashed project bundle', () => {
  const paths = fixture('success');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Level2.mscene'), JSON.stringify({
      version: 1,
      name: 'Level2',
      world: {
        entities: [{
          entity: 1,
          components: {
            Transform: { position: [0, 0, 0] },
            __MEnginePrefab: { source: 'Assets/Prefabs/Enemy.prefab' },
          },
        }],
      },
    }));
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      architecture: 'x64',
    });
    assert.equal(manifest.executable, 'Package Test.exe');
    assert.deepEqual(manifest.assetValidation, {
      rootScenes: 2,
      references: 2,
      validatedFiles: 2,
    });
    assert.deepEqual(manifest.project, {
      name: 'Package Test',
      version: 7,
      mainScene: 'Assets/Scenes/Main.mscene',
      buildScenes: [
        'Assets/Scenes/Main.mscene',
        'Assets/Scenes/Level2.mscene',
      ],
      startupScript: 'Assets/Scripts/main.js',
    });

    const playerConfig = JSON.parse(readFileSync(join(paths.output, PLAYER_CONFIG_FILE), 'utf8'));
    assert.deepEqual(playerConfig, {
      schemaVersion: 1,
      projectName: 'Package Test',
      projectRoot: '.',
      mainScene: 'Assets/Scenes/Main.mscene',
      buildScenes: [
        'Assets/Scenes/Main.mscene',
        'Assets/Scenes/Level2.mscene',
      ],
      startupScript: 'Assets/Scripts/main.js',
    });
    assert.equal(readFileSync(join(paths.output, 'Assets', 'Scenes', 'Main.mscene'), 'utf8'), '{"version":1}');
    const packagedLevel = JSON.parse(
      readFileSync(join(paths.output, 'Assets', 'Scenes', 'Level2.mscene'), 'utf8'),
    );
    assert.deepEqual(packagedLevel.world.entities[0].components.Transform, { position: [0, 0, 0] });
    assert.equal(packagedLevel.world.entities[0].components.__MEnginePrefab, undefined);
    assert.equal(readFileSync(join(paths.output, manifest.executable), 'utf8'), 'runtime-binary');
    assert.deepEqual(
      JSON.parse(readFileSync(join(paths.output, 'ProjectSettings', 'sorting-layers.json'), 'utf8')),
      {
        version: 1,
        layers: [
          { id: 'default', name: 'Default' },
          { id: 'effects', name: 'Effects' },
        ],
      },
    );

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

test('buildPcPackage validates transitive material animator and audio dependencies', () => {
  const paths = fixture('asset-dependencies');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      version: 1,
      world: {
        entities: [{
          entity: 1,
          components: {
            MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/Hero.mmat' },
            Animator: { controller: 'Assets/Animations/Hero.mcontroller' },
            AudioSource: { clip: 'Assets/Audio/theme.ogg' },
          },
        }],
      },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Materials', 'Hero.mmat'), JSON.stringify({
      version: 2,
      base_color_texture: 'Assets/Textures/hero.png',
      occlusion_texture: 'Assets/Textures/hero-ao.png',
    }));
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Hero.mcontroller'), JSON.stringify({
      version: 1,
      states: [{ name: 'Idle', clip: 'Assets/Animations/Idle.manim' }],
    }));
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Idle.manim'), '{}');
    writeFileSync(join(paths.project, 'Assets', 'Audio', 'theme.ogg'), 'audio');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'hero.png'), 'texture');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'hero-ao.png'), 'texture');
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.deepEqual(manifest.assetValidation, {
      rootScenes: 2,
      references: 8,
      validatedFiles: 8,
    });
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage includes validated custom material surface shaders', () => {
  const paths = fixture('custom-surface-shader');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Shaders'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/Rim.mmat' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Materials', 'Rim.mmat'), JSON.stringify({
      version: 4,
      shader: 'custom',
      custom_shader: 'Assets/Shaders/Rim.mshader',
    }));
    writeFileSync(join(paths.project, 'Assets', 'Shaders', 'Rim.mshader'), `
      fn mengine_surface_hook(
        color: vec4<f32>, uv: vec2<f32>,
        world_position: vec3<f32>, world_normal: vec3<f32>
      ) -> vec4<f32> { return vec4<f32>(color.rgb + uv.x, color.a); }
    `);
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(existsSync(join(paths.output, 'Assets', 'Shaders', 'Rim.mshader')), true);
    assert.deepEqual(manifest.assetValidation, {
      rootScenes: 2,
      references: 4,
      validatedFiles: 4,
    });
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage includes scene HDR environment textures', () => {
  const paths = fixture('environment-texture');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        EnvironmentLight: { texture: 'Assets/Textures/studio-environment.hdr' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'studio-environment.hdr'), 'hdr');
    buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(
      existsSync(join(paths.output, 'Assets', 'Textures', 'studio-environment.hdr')),
      true,
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects custom shaders that declare engine entry points', () => {
  const paths = fixture('invalid-custom-surface-shader');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Shaders'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/Broken.mmat' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Materials', 'Broken.mmat'), JSON.stringify({
      shader: 'custom',
      custom_shader: 'Assets/Shaders/Broken.mshader',
    }));
    writeFileSync(join(paths.project, 'Assets', 'Shaders', 'Broken.mshader'), `
      fn mengine_surface_hook() {}
      @fragment fn fs_main() {}
    `);
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /@fragment is reserved by the engine/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage validates tilemap sprite subresources and shared import metadata', () => {
  const paths = fixture('sprite-subresources');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        Tilemap: {
          cells: [[0, 0], [1, 0]],
          sprites: [
            'Assets/Textures/tiles.png#Grass',
            'Assets/Textures/tiles.png#Stone',
          ],
        },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'tiles.png'), 'texture');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'tiles.png.sprite.json'), JSON.stringify({
      version: 1,
      mode: 'multiple',
      slices: [
        { name: 'Grass', rect: [0, 0, 16, 16] },
        { name: 'Stone', rect: [16, 0, 16, 16] },
      ],
    }));
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.deepEqual(manifest.assetValidation, {
      rootScenes: 2,
      references: 6,
      validatedFiles: 4,
    });
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects a missing named sprite slice', () => {
  const paths = fixture('missing-sprite-slice');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        SpriteRenderer: { sprite: 'Assets/Textures/hero.png#Missing' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'hero.png'), 'texture');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'hero.png.sprite.json'), JSON.stringify({
      version: 1,
      mode: 'multiple',
      slices: [{ name: 'Idle', rect: [0, 0, 16, 16] }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /missing sprite slice 'Missing'/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects ambiguous sorting layers before publishing output', () => {
  const paths = fixture('invalid-sorting-layers');
  try {
    writeFileSync(join(paths.project, 'ProjectSettings', 'sorting-layers.json'), JSON.stringify({
      version: 1,
      layers: [
        { id: 'default', name: 'Default' },
        { id: 'DEFAULT', name: 'Other' },
      ],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /duplicate sorting layer id 'DEFAULT'/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects missing transitive assets without publishing output', () => {
  const paths = fixture('missing-asset-dependency');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        MeshRenderer: { material: 'Assets/Materials/Broken.mmat' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Materials', 'Broken.mmat'), JSON.stringify({
      normal_texture: 'Assets/Textures/missing-normal.png',
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /missing material normal_texture: Assets\/Textures\/missing-normal\.png.*Broken\.mmat/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage validates Spine atlas pages before publishing', () => {
  const paths = fixture('spine-atlas-dependency');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Spine'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        SpineSkeleton: {
          skeleton: 'Assets/Spine/Hero.json',
          atlas: 'Assets/Spine/Hero.atlas',
        },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Spine', 'Hero.json'), '{}');
    writeFileSync(
      join(paths.project, 'Assets', 'Spine', 'Hero.atlas'),
      'Hero.png\nsize: 64,64\nfilter: Linear,Linear\nrepeat: none\n',
    );
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /missing Spine atlas page: Assets\/Spine\/Hero\.png.*Hero\.atlas/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage validates external glTF buffers and images', () => {
  const paths = fixture('gltf-dependencies');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Models'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        MeshRenderer: { mesh: 'Assets/Models/Environment.gltf', material: 'default' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Models', 'Environment.gltf'), JSON.stringify({
      asset: { version: '2.0' },
      buffers: [{ uri: 'Environment.bin', byteLength: 4 }],
      images: [{ uri: 'missing-albedo.png' }],
    }));
    writeFileSync(join(paths.project, 'Assets', 'Models', 'Environment.bin'), 'mesh');
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /missing glTF image: Assets\/Models\/missing-albedo\.png.*Environment\.gltf/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage type-checks TypeScript and emits only runnable JavaScript', () => {
  const paths = fixture('typescript');
  try {
    const projectJson = JSON.parse(readFileSync(join(paths.project, 'project.json'), 'utf8'));
    projectJson.startupScript = 'Assets/Scripts/Main.ts';
    writeFileSync(join(paths.project, 'project.json'), JSON.stringify(projectJson));
    rmSync(join(paths.project, 'Assets', 'Scripts', 'main.js'));
    writeFileSync(
      join(paths.project, 'Assets', 'Scripts', 'mengine.d.ts'),
      'declare const engine: { setClearColor(r: number, g: number, b: number, a?: number): void };',
    );
    writeFileSync(
      join(paths.project, 'Assets', 'Scripts', 'Main.ts'),
      'let elapsed: number = 0;\nfunction onTick(dt: number, _frame: number) { elapsed += scaled(dt); engine.setClearColor(elapsed, 0, 0, 1); }',
    );
    writeFileSync(
      join(paths.project, 'Assets', 'Scripts', 'helpers.ts'),
      'function scaled(value: number): number { return value * 2; }',
    );

    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
    });
    assert.equal(manifest.project.startupScript, 'Assets/Scripts/Main.js');
    assert.match(
      readFileSync(join(paths.output, 'Assets', 'Scripts', 'Main.js'), 'utf8'),
      /function onTick/,
    );
    assert.match(
      readFileSync(join(paths.output, 'Assets', 'Scripts', 'Main.js'), 'utf8'),
      /function scaled/,
    );
    assert.equal(existsSync(join(paths.output, 'Assets', 'Scripts', 'helpers.js')), false);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Scripts', 'Main.ts')), false);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Scripts', 'mengine.d.ts')), false);
    assert.equal(
      JSON.parse(readFileSync(join(paths.output, PLAYER_CONFIG_FILE), 'utf8')).startupScript,
      'Assets/Scripts/Main.js',
    );
    assert.equal(
      JSON.parse(readFileSync(join(paths.output, 'project.json'), 'utf8')).startupScript,
      'Assets/Scripts/Main.js',
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects TypeScript errors without publishing a partial build', () => {
  const paths = fixture('typescript-error');
  try {
    const projectJson = JSON.parse(readFileSync(join(paths.project, 'project.json'), 'utf8'));
    projectJson.startupScript = 'Assets/Scripts/Main.ts';
    writeFileSync(join(paths.project, 'project.json'), JSON.stringify(projectJson));
    writeFileSync(
      join(paths.project, 'Assets', 'Scripts', 'Main.ts'),
      'const invalid: number = "not a number";',
    );
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
    }), /TypeScript compilation failed/);
    assert.equal(existsSync(paths.output), false);
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

test('publishStagedBuild restores the previous build when the final rename fails', () => {
  const paths = fixture('publish-rollback');
  const stage = join(paths.root, '.Build.stage');
  try {
    mkdirSync(paths.output, { recursive: true });
    mkdirSync(stage, { recursive: true });
    writeFileSync(join(paths.output, 'version.txt'), 'previous');
    writeFileSync(join(stage, 'version.txt'), 'next');

    assert.throws(() => publishStagedBuild(stage, paths.output, {
      exists: existsSync,
      rename(from, to) {
        if (from === stage && to === paths.output) throw new Error('injected final rename failure');
        renameSync(from, to);
      },
      remove(path) {
        rmSync(path, { recursive: true, force: true });
      },
    }), /injected final rename failure/);

    assert.equal(readFileSync(join(paths.output, 'version.txt'), 'utf8'), 'previous');
    assert.equal(readFileSync(join(stage, 'version.txt'), 'utf8'), 'next');
    assert.deepEqual(
      readdirSync(paths.root).filter((name) => name.includes('.mengine-backup-')),
      [],
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage produces byte-identical manifests from identical inputs', () => {
  const paths = fixture('reproducible');
  const secondOutput = join(paths.root, 'Build-again');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'z-last.bin'), 'z');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'A-first.bin'), 'a');
    const options = {
      projectDir: paths.project,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      architecture: 'x64',
    };
    buildPcPackage({ ...options, outputDir: paths.output });
    buildPcPackage({ ...options, outputDir: secondOutput });

    assert.equal(
      readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8'),
      readFileSync(join(secondOutput, BUILD_MANIFEST_FILE), 'utf8'),
    );
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

test('buildPcPackage validates every configured build scene', () => {
  const paths = fixture('missing-build-scene');
  try {
    const manifest = JSON.parse(readFileSync(join(paths.project, 'project.json'), 'utf8'));
    manifest.buildScenes.push('Assets/Scenes/Missing.mscene');
    writeFileSync(join(paths.project, 'project.json'), JSON.stringify(manifest));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /build scene not found: Assets\/Scenes\/Missing\.mscene/);
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
