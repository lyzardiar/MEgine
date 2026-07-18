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
  buildContentHash,
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
  mkdirSync(join(project, 'Assets', 'Timelines'), { recursive: true });
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
    assert.equal(manifest.profile, 'release');
    assert.match(manifest.contentHash, /^[0-9a-f]{64}$/);
    assert.equal(manifest.contentHash, buildContentHash(manifest.files));
    assert.deepEqual(manifest.assetValidation, {
      assetMode: 'all',
      rootScenes: 2,
      references: 3,
      validatedFiles: 3,
      omittedAssetFiles: 0,
      omittedAssetBytes: 0,
      strippedEditorEntities: 0,
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
      assetMode: 'all',
      alwaysInclude: [],
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
    assert.equal(existsSync(join(paths.output, 'Assets', 'Textures', 'pixel.bin')), true);
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

test('buildPcPackage strips EditorOnly scene and prefab subtrees', () => {
  const paths = fixture('editor-only');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Prefabs'), { recursive: true });
    for (const name of ['runtime.png', 'editor.png', 'editor-child.png']) {
      writeFileSync(join(paths.project, 'Assets', 'Textures', name), name);
    }
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      version: 1,
      name: 'Main',
      world: {
        selected: 3,
        entities: [
          { entity: 1, name: 'Runtime', components: {
            SpriteRenderer: { sprite: 'Assets/Textures/runtime.png' },
            __Selection: { color: 'blue' },
          } },
          { entity: 2, name: 'Editor Root', components: {
            EditorOnly: {},
            SpriteRenderer: { sprite: 'Assets/Textures/editor.png' },
          } },
          { entity: 3, parent: 2, name: 'Editor Child', components: {
            SpriteRenderer: { sprite: 'Assets/Textures/editor-child.png' },
          } },
        ],
      },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Prefabs', 'Mixed.prefab'), JSON.stringify({
      version: 2,
      root: {
        id: 'root', components: {}, children: [{
          id: 'editor', components: { EditorOnly: {} }, children: [{
            id: 'editor-child', components: {}, children: [],
          }],
        }],
      },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Prefabs', 'Editor.prefab'), JSON.stringify({
      version: 2,
      root: { id: 'editor-root', components: { EditorOnly: {} }, children: [] },
    }));

    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    const scene = JSON.parse(readFileSync(join(paths.output, 'Assets', 'Scenes', 'Main.mscene'), 'utf8'));
    assert.deepEqual(scene.world.entities.map((entity) => entity.entity), [1]);
    assert.equal(scene.world.selected, null);
    assert.equal(Object.hasOwn(scene.world.entities[0].components, '__Selection'), false);
    const prefab = JSON.parse(readFileSync(join(paths.output, 'Assets', 'Prefabs', 'Mixed.prefab'), 'utf8'));
    assert.deepEqual(prefab.root.children, []);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Prefabs', 'Editor.prefab')), false);
    assert.equal(manifest.assetValidation.validatedFiles, 4);
    assert.equal(manifest.assetValidation.strippedEditorEntities, 5);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage referenced mode copies the validated closure and always-include roots', () => {
  const paths = fixture('referenced-assets');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Prefabs'), { recursive: true });
    const projectPath = join(paths.project, 'project.json');
    const project = JSON.parse(readFileSync(projectPath, 'utf8'));
    project.assetMode = 'referenced';
    project.alwaysInclude = ['Assets/Prefabs'];
    writeFileSync(projectPath, JSON.stringify(project));
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      version: 1,
      world: {
        entities: [{
          entity: 1,
          components: { SpriteRenderer: { sprite: 'Assets/Textures/used.png' } },
        }],
      },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'used.png'), 'used');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'used.png.sprite.json'), JSON.stringify({
      version: 1,
      mode: 'single',
    }));
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'dynamic.png'), 'dynamic');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'unused.png'), 'unused');
    writeFileSync(join(paths.project, 'Assets', 'Materials', 'dynamic.mmat'), JSON.stringify({
      version: 4,
      shader: 'pbr',
      base_color_texture: 'Assets/Textures/dynamic.png',
    }));
    writeFileSync(join(paths.project, 'Assets', 'Prefabs', 'Dynamic.prefab'), JSON.stringify({
      version: 2,
      root: {
        id: 'dynamic',
        components: {
          MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/dynamic.mmat' },
        },
        children: [],
      },
    }));

    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(manifest.project.assetMode, 'referenced');
    assert.deepEqual(manifest.project.alwaysInclude, ['Assets/Prefabs']);
    assert.deepEqual(manifest.assetValidation, {
      assetMode: 'referenced',
      rootScenes: 2,
      references: 8,
      validatedFiles: 8,
      omittedAssetFiles: 2,
      omittedAssetBytes: 10,
      strippedEditorEntities: 0,
    });
    for (const path of [
      'Assets/Scenes/Main.mscene',
      'Assets/Scenes/Level2.mscene',
      'Assets/Scripts/main.js',
      'Assets/Textures/used.png',
      'Assets/Textures/used.png.sprite.json',
      'Assets/Textures/dynamic.png',
      'Assets/Materials/dynamic.mmat',
      'Assets/Prefabs/Dynamic.prefab',
      'ProjectSettings/sorting-layers.json',
    ]) {
      assert.equal(existsSync(join(paths.output, ...path.split('/'))), true, path);
    }
    for (const path of ['Assets/Textures/unused.png', 'Assets/Textures/pixel.bin']) {
      assert.equal(existsSync(join(paths.output, ...path.split('/'))), false, path);
    }
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('build content fingerprint is deterministic and covers paths sizes and hashes', () => {
  const first = { path: 'Assets/a.bin', size: 1, sha256: '01'.repeat(32) };
  const second = { path: 'Assets/b.bin', size: 2, sha256: '02'.repeat(32) };
  const expected = buildContentHash([first, second]);
  assert.equal(buildContentHash([second, first]), expected);
  assert.notEqual(buildContentHash([{ ...first, size: 2 }, second]), expected);
  assert.notEqual(buildContentHash([{ ...first, path: 'Assets/c.bin' }, second]), expected);
  assert.notEqual(buildContentHash([{ ...first, sha256: '03'.repeat(32) }, second]), expected);
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
      version: 3,
      base_color_texture: 'Assets/Textures/hero.png',
      occlusion_texture: 'Assets/Textures/hero-ao.png',
    }));
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Hero.mcontroller'), JSON.stringify({
      version: 2,
      default_state: 'Idle',
      states: [{ name: 'Idle', clip: 'Assets/Animations/Idle.manim' }],
      layers: [{
        name: 'Upper Body',
        weight: 0.75,
        blend_mode: 'override',
        avatar_mask: 'Assets/Animations/Upper Body.mavatar',
        motions: [{ state: 'Idle', clip: 'Assets/Animations/Wave.manim' }],
      }, {
        name: 'Independent Aim',
        timing_mode: 'independent',
        default_state: 'Aim',
        states: [{ name: 'Aim', clip: 'Assets/Animations/Aim.manim' }],
      }],
    }));
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Idle.manim'), '{}');
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Wave.manim'), '{}');
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Aim.manim'), '{}');
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Upper Body.mavatar'), JSON.stringify({
      version: 1,
      name: 'Upper Body',
      paths: ['Rig/Spine'],
    }));
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
      assetMode: 'all',
      rootScenes: 2,
      references: 12,
      validatedFiles: 12,
      omittedAssetFiles: 0,
      omittedAssetBytes: 0,
      strippedEditorEntities: 0,
    });
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage includes and validates TimelineDirector assets', () => {
  const paths = fixture('timeline-dependency');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      version: 1,
      world: { entities: [{ entity: 1, components: {
        TimelineDirector: { asset: 'Assets/Timelines/Intro.mtimeline' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Intro.mtimeline'), JSON.stringify({
      version: 1,
      name: 'Intro',
      duration: 3,
      frame_rate: 30,
      tracks: [{
        type: 'signal', id: 'gameplay', name: 'Gameplay',
        markers: [{ time: 1.5, name: 'SpawnBoss', payload: { phase: 2 } }],
      }, {
        type: 'activation', id: 'dialog', name: 'Dialog Visibility', target: 'Canvas/Dialog',
        clips: [{ start: 0.5, duration: 1, active: true }],
      }, {
        type: 'audio', id: 'music', name: 'Music', target: 'Audio/Music',
        clips: [{ start: 0, duration: 3, clip: 'Assets/Audio/intro.ogg', clip_in: 0.25, volume: 0.8, pitch: 1 }],
      }],
    }));
    mkdirSync(join(paths.project, 'Assets', 'Audio'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Audio', 'intro.ogg'), 'audio');
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(existsSync(join(paths.output, 'Assets', 'Timelines', 'Intro.mtimeline')), true);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Audio', 'intro.ogg')), true);
    assert.equal(manifest.assetValidation.validatedFiles, 5);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects invalid Timeline markers without publishing output', () => {
  const paths = fixture('invalid-timeline');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        TimelineDirector: { asset: 'Assets/Timelines/Broken.mtimeline' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 1,
      tracks: [{ type: 'signal', id: 'signals', name: 'Signals', markers: [{ time: 2, name: 'Late' }] }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /outside duration/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects overlapping Timeline activation clips without publishing output', () => {
  const paths = fixture('invalid-timeline-activation');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        TimelineDirector: { asset: 'Assets/Timelines/Broken.mtimeline' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 2,
      tracks: [{
        type: 'activation', id: 'visibility', name: 'Visibility', target: 'Canvas/Dialog',
        clips: [
          { start: 0, duration: 1.5, active: true },
          { start: 1, duration: 1, active: false },
        ],
      }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /activation clips overlap/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects invalid or missing Timeline audio clips without publishing output', () => {
  const paths = fixture('invalid-timeline-audio');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        TimelineDirector: { asset: 'Assets/Timelines/Broken.mtimeline' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 2,
      tracks: [{
        type: 'audio', id: 'music', name: 'Music', target: 'Audio/Music',
        clips: [
          { start: 0, duration: 1.5, clip: 'Assets/Audio/missing.ogg' },
          { start: 1, duration: 1, clip: 'Assets/Audio/other.ogg' },
        ],
      }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /audio clips overlap/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 2,
      tracks: [{
        type: 'audio', id: 'music', name: 'Music', target: 'Audio/Music',
        clips: [{ start: 0, duration: 1, clip: 'Assets/Audio/missing.ogg' }],
      }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /missing Timeline audio track Music clip/i);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects unsafe Avatar Mask paths before publishing output', () => {
  const paths = fixture('unsafe-avatar-mask');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        Animator: { controller: 'Assets/Animations/Hero.mcontroller' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Hero.mcontroller'), JSON.stringify({
      version: 3,
      default_state: 'Idle',
      states: [{ name: 'Idle', clip: 'Assets/Animations/Idle.manim' }],
      layers: [{
        name: 'Upper Body',
        avatar_mask: 'Assets/Animations/Upper.mavatar',
      }],
    }));
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Idle.manim'), '{}');
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Upper.mavatar'), JSON.stringify({
      version: 1,
      paths: ['../Outside'],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /Avatar Mask.*cannot contain '\.\.'/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects incompatible independent layer conditions before publishing', () => {
  const paths = fixture('invalid-independent-condition');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        Animator: { controller: 'Assets/Animations/Hero.mcontroller' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Hero.mcontroller'), JSON.stringify({
      version: 4,
      default_state: 'Idle',
      parameters: [{ name: 'Wave', kind: 'bool' }],
      states: [{ name: 'Idle', clip: 'Assets/Animations/Idle.manim' }],
      layers: [{
        name: 'Upper',
        timing_mode: 'independent',
        default_state: 'Rest',
        states: [
          { name: 'Rest', clip: 'Assets/Animations/Idle.manim' },
          { name: 'Wave', clip: 'Assets/Animations/Idle.manim' },
        ],
        transitions: [{
          from: 'Rest', to: 'Wave',
          conditions: [{ parameter: 'Wave', mode: 'greater' }],
        }],
      }],
    }));
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Idle.manim'), '{}');
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /condition greater is incompatible with parameter Wave/);
    assert.equal(existsSync(paths.output), false);
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
      fn mengine_lit_surface_hook(
        surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
      ) -> MEngineSurface {
        var result = surface;
        result.roughness = 0.2 + uv.x;
        return result;
      }
    `);
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(existsSync(join(paths.output, 'Assets', 'Shaders', 'Rim.mshader')), true);
    assert.deepEqual(manifest.assetValidation, {
      assetMode: 'all',
      rootScenes: 2,
      references: 5,
      validatedFiles: 5,
      omittedAssetFiles: 0,
      omittedAssetBytes: 0,
      strippedEditorEntities: 0
    });
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects future material versions and invalid sampler modes', () => {
  const paths = fixture('invalid-material-contract');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/Paint.mmat' },
      } }] },
    }));
    const materialPath = join(paths.project, 'Assets', 'Materials', 'Paint.mmat');
    writeFileSync(materialPath, JSON.stringify({ version: 5, shader: 'pbr' }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /unsupported version 5/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(materialPath, JSON.stringify({ version: 4, shader: 'pbr', wrap_u: 'border' }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /wrap_u must be repeat, clamp, or mirror/);
    assert.equal(existsSync(paths.output), false);
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
      assetMode: 'all',
      rootScenes: 2,
      references: 7,
      validatedFiles: 5,
      omittedAssetFiles: 0,
      omittedAssetBytes: 0,
      strippedEditorEntities: 0,
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

test('buildPcPackage verifies the complete staging directory before first publish', () => {
  const paths = fixture('verify-before-publish');
  try {
    let verificationCalls = 0;
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      verifyStagedBuild(stageDir, stagedManifest) {
        verificationCalls += 1;
        assert.equal(existsSync(paths.output), false);
        assert.equal(readFileSync(join(stageDir, stagedManifest.executable), 'utf8'), 'runtime-binary');
        assert.deepEqual(
          JSON.parse(readFileSync(join(stageDir, BUILD_MANIFEST_FILE), 'utf8')),
          stagedManifest,
        );
      },
    });

    assert.equal(verificationCalls, 1);
    assert.equal(existsSync(join(paths.output, manifest.executable)), true);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage removes a rejected first build without publishing partial output', () => {
  const paths = fixture('verify-rejects-first-build');
  try {
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      verifyStagedBuild() {
        throw new Error('injected packaged player validation failure');
      },
    }), /injected packaged player validation failure/);

    assert.equal(existsSync(paths.output), false);
    assert.deepEqual(
      readdirSync(paths.root).filter((name) => name.includes('.mengine-stage-')),
      [],
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage preserves the previous build when replacement verification fails', () => {
  const paths = fixture('verify-preserves-previous-build');
  try {
    buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'previous-engine',
      platform: 'windows',
    });
    const previousManifest = readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8');
    writeFileSync(join(paths.output, 'published-marker.txt'), 'previous');

    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'replacement-engine',
      platform: 'windows',
      clean: true,
      verifyStagedBuild() {
        throw new Error('replacement validation failed');
      },
    }), /replacement validation failed/);

    assert.equal(
      readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8'),
      previousManifest,
    );
    assert.equal(readFileSync(join(paths.output, 'published-marker.txt'), 'utf8'), 'previous');
    assert.deepEqual(
      readdirSync(paths.root).filter((name) => name.includes('.mengine-stage-')),
      [],
    );
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
