import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, generateKeyPairSync } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BUILD_MANIFEST_FILE,
  PLAYER_CONFIG_FILE,
  buildContentHash,
  buildPcPackage,
  publishStagedBuild,
  verifyPcBuildDirectory,
  verifyPcBuildManifestSignature,
} from '../dist/pcPackage.js';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');

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

test('buildPcPackage signs the deterministic artifact identity with an external Ed25519 key', () => {
  const paths = fixture('artifact-signature');
  try {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const keyPath = join(paths.root, 'release-signing-key.pem');
    writeFileSync(keyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }));
    const options = {
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      architecture: 'x64',
      signingPrivateKeyPath: keyPath,
    };
    const manifest = buildPcPackage(options);
    assert.equal(manifest.signature?.schemaVersion, 1);
    assert.equal(manifest.signature?.algorithm, 'ed25519');
    assert.match(manifest.signature?.keyId ?? '', /^[0-9a-f]{64}$/);
    assert.match(manifest.signature?.value ?? '', /^[A-Za-z0-9+/]{86}==$/);
    const publicPem = publicKey.export({ format: 'pem', type: 'spki' });
    const publicKeyPath = join(paths.root, 'release-signing-public.pem');
    writeFileSync(publicKeyPath, publicPem);
    assert.doesNotThrow(() => verifyPcBuildManifestSignature(manifest, publicPem));
    assert.equal(verifyPcBuildDirectory(paths.output, publicPem).contentHash, manifest.contentHash);
    const cliVerification = spawnSync(process.execPath, [
      cli,
      'verify-build',
      paths.output,
      '--public-key',
      publicKeyPath,
    ], { encoding: 'utf8', windowsHide: true });
    assert.equal(cliVerification.status, 0, cliVerification.stderr);
    assert.match(cliVerification.stdout, /Verified signed build/);
    assert.deepEqual(
      JSON.parse(readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8')).signature,
      manifest.signature,
    );

    const second = buildPcPackage({
      ...options,
      outputDir: join(paths.root, 'Build2'),
    });
    assert.equal(second.contentHash, manifest.contentHash);
    assert.deepEqual(second.signature, manifest.signature);
    writeFileSync(join(paths.root, 'Build2', second.executable), 'tampered-runtime');
    assert.throws(
      () => verifyPcBuildDirectory(join(paths.root, 'Build2'), publicPem),
      /size mismatch|hash mismatch/,
    );

    assert.throws(() => verifyPcBuildManifestSignature({
      ...manifest,
      contentHash: '0'.repeat(64),
    }, publicPem), /verification failed/);
    assert.throws(() => verifyPcBuildManifestSignature({
      ...manifest,
      project: { ...manifest.project, name: 'Imposter' },
    }, publicPem), /verification failed/);
    const wrongKey = generateKeyPairSync('ed25519').publicKey.export({ format: 'pem', type: 'spki' });
    assert.throws(
      () => verifyPcBuildManifestSignature(manifest, wrongKey),
      /key mismatch/,
    );

    const projectKeyPath = join(paths.project, 'private-key.pem');
    writeFileSync(projectKeyPath, privateKey.export({ format: 'pem', type: 'pkcs8' }));
    assert.throws(() => buildPcPackage({
      ...options,
      outputDir: join(paths.root, 'Build3'),
      signingPrivateKeyPath: projectKeyPath,
    }), /outside the project directory/);
    assert.equal(existsSync(join(paths.root, 'Build3')), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage creates a directly launchable, hashed project bundle', () => {
  const paths = fixture('success');
  try {
    writeFileSync(
      join(paths.project, 'Assets', 'Textures', 'pixel.bin.meta'),
      '{"schemaVersion":1,"guid":"bf914747-8c6a-418f-b74f-49d49114f9a2"}',
    );
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
    assert.equal(
      manifest.contentSummary.totalBytes,
      manifest.files.reduce((total, file) => total + file.size, 0),
    );
    assert.equal(
      manifest.contentSummary.categories.find((group) => group.category === 'runtime')?.files,
      1,
    );
    assert.deepEqual(
      manifest.files.find((file) => file.path === manifest.executable)?.includedBy,
      [{ kind: 'player runtime', from: 'MEngine Build SDK' }],
    );
    assert.deepEqual(
      manifest.files.find((file) => file.path === 'Assets/Textures/pixel.bin')?.includedBy,
      [{ kind: 'all assets mode', from: 'project.json' }],
    );
    assert.equal(
      manifest.files.find((file) => file.path === 'Assets/Textures/pixel.bin')?.category,
      'other',
    );
    assert.deepEqual(manifest.assetValidation, {
      assetMode: 'all',
      rootScenes: 2,
      references: 3,
      validatedFiles: 3,
      auditedScenes: 2,
      auditedPrefabs: 0,
      auditedMaterials: 0,
      auditedMaterialInstances: 0,
      auditedSurfaceShaders: 0,
      shaderVariants: 0,
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
      shaderVariantLimit: 256,
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
    assert.equal(existsSync(join(paths.output, 'Assets', 'Textures', 'pixel.bin.meta')), false);
    assert.equal(manifest.files.some((file) => file.path.endsWith('.meta')), false);
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

test('buildPcPackage rejects editor metadata as an explicit runtime root', () => {
  const paths = fixture('metadata-root');
  try {
    const metadata = join(paths.project, 'Assets', 'Textures', 'pixel.bin.meta');
    writeFileSync(metadata, '{"schemaVersion":1,"guid":"bf914747-8c6a-418f-b74f-49d49114f9a2"}');
    const projectPath = join(paths.project, 'project.json');
    const project = JSON.parse(readFileSync(projectPath, 'utf8'));
    project.assetMode = 'referenced';
    project.alwaysInclude = ['Assets/Textures/pixel.bin.meta'];
    writeFileSync(projectPath, JSON.stringify(project));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /cannot package editor asset metadata/);
    assert.equal(existsSync(paths.output), false);
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
    assert.equal(manifest.assetValidation.validatedFiles, 6);
    assert.equal(manifest.assetValidation.auditedScenes, 2);
    assert.equal(manifest.assetValidation.auditedPrefabs, 2);
    assert.equal(manifest.assetValidation.strippedEditorEntities, 5);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage validates scene and prefab entity references and preserves runtime metadata', () => {
  const paths = fixture('entity-references-valid');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Prefabs'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      version: 1,
      world: {
        entities: [{
          entity: 1,
          components: {
            Button: { on_click: { target: '2', component: 'Menu', method: 'Open' } },
          },
        }, {
          entity: '2',
          components: {
            FollowBehaviour: {
              __mengine_entity_reference_fields: ['leader'],
              leader: 1,
            },
          },
        }],
      },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Prefabs', 'Linked.prefab'), JSON.stringify({
      version: 2,
      root: {
        id: 'root',
        components: {
          FollowBehaviour: {
            __mengine_entity_reference_fields: ['leader'],
            leader: { $mengine_entity_ref: { kind: 'prefab_node', node: 'child' } },
          },
        },
        children: [{ id: 'child', components: {}, children: [] }],
      },
    }));

    buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });

    const scene = JSON.parse(readFileSync(
      join(paths.output, 'Assets', 'Scenes', 'Main.mscene'),
      'utf8',
    ));
    assert.deepEqual(
      scene.world.entities[1].components.FollowBehaviour.__mengine_entity_reference_fields,
      ['leader'],
    );
    const prefab = JSON.parse(readFileSync(
      join(paths.output, 'Assets', 'Prefabs', 'Linked.prefab'),
      'utf8',
    ));
    assert.deepEqual(
      prefab.root.components.FollowBehaviour.__mengine_entity_reference_fields,
      ['leader'],
    );
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects missing scene entity references before publishing', () => {
  const paths = fixture('entity-references-missing');
  try {
    const scenePath = join(paths.project, 'Assets', 'Scenes', 'Main.mscene');
    const writeTarget = (target) => writeFileSync(scenePath, JSON.stringify({
      version: 1,
      world: {
        entities: [{
          entity: 1,
          components: { Button: { on_click: { target } } },
        }],
      },
    }));
    writeTarget(2);
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /Button\.on_click\.target references missing entity '2'/);
    assert.equal(existsSync(paths.output), false);

    writeTarget({ $mengine_entity_ref: { kind: 'missing', entity: '2' } });
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /Button\.on_click\.target contains missing entity reference '2'/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects prefab references to EditorOnly nodes in all-assets mode', () => {
  const paths = fixture('entity-references-prefab-editor-only');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Prefabs'), { recursive: true });
    const prefabPath = join(paths.project, 'Assets', 'Prefabs', 'Broken.prefab');
    writeFileSync(prefabPath, JSON.stringify({
      version: 2,
      root: {
        id: 'root',
        components: {
          Button: {
            on_click: {
              target: { $mengine_entity_ref: { kind: 'prefab_node', node: 'editor-child' } },
            },
          },
        },
        children: [{
          id: 'editor-child',
          components: { EditorOnly: {} },
          children: [],
        }],
      },
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /Button\.on_click\.target references missing prefab node 'editor-child'/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(prefabPath, JSON.stringify({
      version: 2,
      root: {
        id: 'root',
        components: { Button: { on_click: { target: 42 } } },
        children: [],
      },
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /Button\.on_click\.target contains legacy scene entity reference '42'/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('referenced mode ignores broken entity references in assets omitted from the player', () => {
  const paths = fixture('entity-references-omitted');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Prefabs'), { recursive: true });
    const projectPath = join(paths.project, 'project.json');
    const project = JSON.parse(readFileSync(projectPath, 'utf8'));
    project.assetMode = 'referenced';
    writeFileSync(projectPath, JSON.stringify(project));
    writeFileSync(join(paths.project, 'Assets', 'Prefabs', 'Broken.prefab'), JSON.stringify({
      version: 2,
      root: {
        id: 'root',
        components: {
          Button: {
            on_click: {
              target: { $mengine_entity_ref: { kind: 'missing', entity: '99' } },
            },
          },
        },
        children: [],
      },
    }));

    buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(existsSync(join(paths.output, 'Assets', 'Prefabs', 'Broken.prefab')), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects corrupt custom entity reference metadata', () => {
  const paths = fixture('entity-reference-metadata');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      version: 1,
      world: {
        entities: [{
          entity: 1,
          components: {
            FollowBehaviour: {
              __mengine_entity_reference_fields: { leader: true },
              leader: 1,
            },
          },
        }],
      },
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /FollowBehaviour\.__mengine_entity_reference_fields must be an array/);
    assert.equal(existsSync(paths.output), false);
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
      auditedScenes: 2,
      auditedPrefabs: 1,
      auditedMaterials: 1,
      auditedMaterialInstances: 0,
      auditedSurfaceShaders: 0,
      shaderVariants: 0,
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
    const usedTexture = manifest.files.find((file) => file.path === 'Assets/Textures/used.png');
    assert.equal(usedTexture?.category, 'texture');
    assert.deepEqual(usedTexture?.includedBy, [{
      kind: 'texture',
      from: 'Assets/Scenes/Main.mscene',
    }]);
    const dynamicMaterial = manifest.files.find(
      (file) => file.path === 'Assets/Materials/dynamic.mmat',
    );
    assert.equal(dynamicMaterial?.category, 'material');
    assert.deepEqual(dynamicMaterial?.includedBy, [{
      kind: 'material',
      from: 'Assets/Prefabs/Dynamic.prefab',
    }]);
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
      version: 5,
      default_state: 'Idle',
      parameters: [{ name: 'Speed', kind: 'float' }],
      states: [{
        name: 'Idle',
        blend_tree: {
          parameter: 'Speed',
          children: [
            { threshold: 0, clip: 'Assets/Animations/Idle.manim' },
            { threshold: 1, clip: 'Assets/Animations/Run.manim' },
          ],
        },
      }],
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
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Run.manim'), '{}');
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
      references: 13,
      validatedFiles: 13,
      auditedScenes: 2,
      auditedPrefabs: 0,
      auditedMaterials: 1,
      auditedMaterialInstances: 0,
      auditedSurfaceShaders: 0,
      shaderVariants: 0,
      omittedAssetFiles: 0,
      omittedAssetBytes: 0,
      strippedEditorEntities: 0,
    });
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Hero.mcontroller'), JSON.stringify({
      default_state: 'Idle',
      states: [{ name: 'Idle', clip: 'Assets/Animations/Idle.manim', blend_tree: [] }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: join(paths.root, 'invalid-output'),
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /Blend Tree must be an object/);
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
        clips: [{
          start: 0, duration: 3, clip: 'Assets/Audio/intro.ogg', clip_in: 0.25,
          volume: 0.8, pitch: 1, fade_in: 0.5, fade_out: 0.75, fade_curve: ' EASE_IN_OUT ',
        }],
      }, {
        type: 'animation', id: 'hero', name: 'Hero', target: 'Characters/Hero',
        clips: [{ start: 0, duration: 2, clip: 'Assets/Animations/Hero.manim', clip_in: 0.1, speed: 1 }],
      }, {
        type: 'particle', id: 'fx', name: 'FX', target: 'Effects/Burst', locked: true,
        clips: [{ start: 0.5, duration: 1, clip_in: 0.25 }],
      }, {
        type: 'camera', id: 'shots', name: 'Shots',
        clips: [
          { start: 0, duration: 1.5, target: 'Cameras/Wide' },
          { start: 1.5, duration: 1.5, target: 'Cameras/Close', blend_in: 0.5, blend_curve: ' EASE_IN_OUT ' },
        ],
      }],
      groups: [{
        id: 'presentation', name: 'Presentation', muted: false, locked: false, collapsed: true,
        track_ids: ['dialog', 'music', 'shots'],
      }],
    }));
    mkdirSync(join(paths.project, 'Assets', 'Audio'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Audio', 'intro.ogg'), 'audio');
    mkdirSync(join(paths.project, 'Assets', 'Animations'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Animations', 'Hero.manim'), '{}');
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(existsSync(join(paths.output, 'Assets', 'Timelines', 'Intro.mtimeline')), true);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Audio', 'intro.ogg')), true);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Animations', 'Hero.manim')), true);
    assert.equal(manifest.assetValidation.validatedFiles, 6);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects Timeline groups with missing or duplicate track membership', () => {
  const paths = fixture('invalid-timeline-groups');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        TimelineDirector: { asset: 'Assets/Timelines/Broken.mtimeline' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 1,
      tracks: [{ type: 'signal', id: 'signals', name: 'Signals' }],
      groups: [
        { id: 'a', name: 'A', track_ids: ['signals'] },
        { id: 'b', name: 'B', track_ids: ['signals', 'missing'] },
      ],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /more than one group|missing track/);
    assert.equal(existsSync(paths.output), false);
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

test('buildPcPackage rejects invalid Timeline particle clips without publishing output', () => {
  const paths = fixture('invalid-timeline-particle');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        TimelineDirector: { asset: 'Assets/Timelines/Broken.mtimeline' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 2,
      tracks: [{
        type: 'particle', id: 'fx', name: 'FX', target: 'Effects/Burst',
        clips: [{ start: 0, duration: 1, clip_in: 300 }],
      }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /particle clip is invalid/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects invalid Timeline camera blends without publishing output', () => {
  const paths = fixture('invalid-timeline-camera');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        TimelineDirector: { asset: 'Assets/Timelines/Broken.mtimeline' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 2,
      tracks: [{
        type: 'camera', id: 'shots', name: 'Shots',
        clips: [{ start: 0, duration: 1, target: 'Cameras/Main', blend_in: 1.5 }],
      }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /camera clip is invalid/);
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
        clips: [{
          start: 0, duration: 1, clip: 'Assets/Audio/missing.ogg',
          fade_in: 1.1, fade_curve: 'logarithmic',
        }],
      }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /audio clip is invalid/);
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

test('buildPcPackage rejects invalid or missing Timeline animation clips without publishing output', () => {
  const paths = fixture('invalid-timeline-animation');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        TimelineDirector: { asset: 'Assets/Timelines/Broken.mtimeline' },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 2,
      tracks: [{
        type: 'animation', id: 'hero', name: 'Hero', target: 'Characters/Hero',
        clips: [{ start: 0, duration: 1, clip: 'Assets/Animations/missing.manim', speed: 9 }],
      }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /animation clip is invalid/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(join(paths.project, 'Assets', 'Timelines', 'Broken.mtimeline'), JSON.stringify({
      version: 1, duration: 2,
      tracks: [{
        type: 'animation', id: 'hero', name: 'Hero', target: 'Characters/Hero',
        clips: [{ start: 0, duration: 1, clip: 'Assets/Animations/missing.manim' }],
      }],
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /missing Timeline animation track Hero clip/i);
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
        MaterialPropertyBlock: {
          custom_parameter_names: ['rim_power'],
          custom_parameter_values: [[4, 0, 0, 0]],
          custom_texture_names: ['detail'],
          custom_texture_values: ['Assets/Textures/object-detail.png'],
        },
      } }] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Materials', 'Rim.mmat'), JSON.stringify({
      version: 10,
      shader: 'custom',
      custom_shader: 'Assets/Shaders/Rim.mshader',
      custom_keywords: { USE_RIM: true },
      custom_textures: { detail: 'Assets/Textures/detail.png' },
      custom_parameters: {
        rim_color: [0.2, 0.5, 1, 1],
        rim_power: [3, 0, 0, 0],
      },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Materials', 'RimOff.mmat'), JSON.stringify({
      version: 10,
      shader: 'custom',
      custom_shader: 'Assets/Shaders/Rim.mshader',
      custom_keywords: { USE_RIM: false },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'detail.png'), 'detail');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'default-detail.png'), 'default-detail');
    writeFileSync(join(paths.project, 'Assets', 'Textures', 'object-detail.png'), 'object-detail');
    writeFileSync(join(paths.project, 'Assets', 'Shaders', 'Rim.mshader'), `
      /* MENGINE_PARAMETERS
      {"parameters":[
        {"name":"rim_color","type":"color","default":[1,1,1,1]},
        {"name":"rim_power","type":"float","default":2,"min":0,"max":8}
      ],"keywords":[{"name":"USE_RIM","default":false}],
      "textures":[{"name":"detail","label":"Detail","type":"color","default":"Assets/Textures/default-detail.png"}]}
      */
      fn mengine_lit_surface_hook(
        surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
      ) -> MEngineSurface {
        var result = surface;
        result.roughness = 0.2 + uv.x;
        if (mengine_keyword_USE_RIM()) {
          result.emissive = mengine_texture_detail(uv).rgb
            * mengine_param_rim_color().xyz * mengine_param_rim_power();
        }
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
    assert.equal(existsSync(join(paths.output, 'Assets', 'Textures', 'detail.png')), true);
    assert.deepEqual(manifest.assetValidation, {
      assetMode: 'all',
      rootScenes: 2,
      references: 9,
      validatedFiles: 9,
      auditedScenes: 2,
      auditedPrefabs: 0,
      auditedMaterials: 2,
      auditedMaterialInstances: 0,
      auditedSurfaceShaders: 1,
      shaderVariants: 2,
      omittedAssetFiles: 0,
      omittedAssetBytes: 0,
      strippedEditorEntities: 0
    });
    assert.deepEqual(manifest.surfaceShaderVariants, [
      { shader: 'Assets/Shaders/Rim.mshader', enabledKeywords: [] },
      { shader: 'Assets/Shaders/Rim.mshader', enabledKeywords: ['USE_RIM'] },
    ]);
    const projectPath = join(paths.project, 'project.json');
    const project = JSON.parse(readFileSync(projectPath, 'utf8'));
    project.shaderVariantLimit = 1;
    writeFileSync(projectPath, JSON.stringify(project));
    const overBudgetOutput = join(paths.root, 'BuildOverBudget');
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: overBudgetOutput,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /variant budget exceeded: 2 > 1.*rim\.mshader=2/i);
    assert.equal(existsSync(overBudgetOutput), false);
    project.assetMode = 'referenced';
    writeFileSync(projectPath, JSON.stringify(project));
    const referencedOutput = join(paths.root, 'BuildReferenced');
    const referenced = buildPcPackage({
      projectDir: paths.project,
      outputDir: referencedOutput,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(referenced.assetValidation.shaderVariants, 1);
    assert.equal(existsSync(join(referencedOutput, 'Assets', 'Materials', 'RimOff.mmat')), false);
    assert.equal(existsSync(join(referencedOutput, 'Assets', 'Textures', 'detail.png')), true);
    assert.equal(existsSync(join(referencedOutput, 'Assets', 'Textures', 'object-detail.png')), true);
    assert.equal(existsSync(join(referencedOutput, 'Assets', 'Textures', 'default-detail.png')), false);

    const scenePath = join(paths.project, 'Assets', 'Scenes', 'Main.mscene');
    const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
    scene.world.entities[0].components.MaterialPropertyBlock.custom_parameter_names = ['removed'];
    writeFileSync(scenePath, JSON.stringify(scene));
    const invalidOutput = join(paths.root, 'BuildInvalidPropertyBlock');
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: invalidOutput,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /MaterialPropertyBlock.*parameter 'removed' is not declared/i);
    assert.equal(existsSync(invalidOutput), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage rejects stale or corrupt reflected material parameters', () => {
  const paths = fixture('invalid-surface-parameters');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Shaders'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/Rim.mmat' },
      } }] },
    }));
    const materialPath = join(paths.project, 'Assets', 'Materials', 'Rim.mmat');
    const shaderPath = join(paths.project, 'Assets', 'Shaders', 'Rim.mshader');
    writeFileSync(materialPath, JSON.stringify({
      version: 8,
      shader: 'custom',
      custom_shader: 'Assets/Shaders/Rim.mshader',
      custom_parameters: { removed: [1, 0, 0, 0] },
    }));
    writeFileSync(shaderPath, `
      /* MENGINE_PARAMETERS
      {"parameters":[{"name":"power","type":"float","default":2}]}
      */
      fn mengine_lit_surface_hook(
        surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
      ) -> MEngineSurface { return surface; }
    `);
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /parameter 'removed' is not declared/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(materialPath, JSON.stringify({
      version: 8,
      shader: 'custom',
      custom_shader: 'Assets/Shaders/Rim.mshader',
    }));
    writeFileSync(shaderPath, `
      /* MENGINE_PARAMETERS
      {"parameters":[
        {"name":"power","type":"float","default":1},
        {"name":"power","type":"float","default":2}
      ]}
      */
      fn mengine_lit_surface_hook(
        surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
      ) -> MEngineSurface { return surface; }
    `);
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /invalid or duplicate parameter 'power'/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(shaderPath, `
      /* MENGINE_PARAMETERS
      {"parameters":[{"name":"tint","type":"color","default":[1,1,1,1],"min":2}]}
      */
      fn mengine_lit_surface_hook(
        surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
      ) -> MEngineSurface { return surface; }
    `);
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /parameter 'tint' has an invalid range/);
    assert.equal(existsSync(paths.output), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('all-assets mode audits unreferenced material graphs while referenced mode omits them', () => {
  const paths = fixture('unreferenced-material-audit');
  try {
    mkdirSync(join(paths.project, 'Assets', 'Shaders'), { recursive: true });
    writeFileSync(join(paths.project, 'Assets', 'Materials', 'Orphan.mmat'), JSON.stringify({
      version: 8,
      shader: 'custom',
      custom_shader: 'Assets/Shaders/Orphan.mshader',
      custom_parameters: { removed: [1, 0, 0, 0] },
    }));
    writeFileSync(join(paths.project, 'Assets', 'Shaders', 'Orphan.mshader'), `
      /* MENGINE_PARAMETERS
      {"parameters":[{"name":"power","type":"float","default":2}]}
      */
      fn mengine_lit_surface_hook(
        surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
      ) -> MEngineSurface { return surface; }
    `);
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /parameter 'removed' is not declared/);
    assert.equal(existsSync(paths.output), false);

    const projectPath = join(paths.project, 'project.json');
    const project = JSON.parse(readFileSync(projectPath, 'utf8'));
    project.assetMode = 'referenced';
    writeFileSync(projectPath, JSON.stringify(project));
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(manifest.assetValidation.auditedMaterials, 0);
    assert.equal(manifest.assetValidation.auditedSurfaceShaders, 0);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Materials', 'Orphan.mmat')), false);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage validates material v10 IOR, clearcoat, sampler, parameter, keyword, and texture contracts', () => {
  const paths = fixture('invalid-material-contract');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/Paint.mmat' },
      } }] },
    }));
    const materialPath = join(paths.project, 'Assets', 'Materials', 'Paint.mmat');
    writeFileSync(materialPath, JSON.stringify({ version: 11, shader: 'pbr' }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /unsupported version 11/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(materialPath, JSON.stringify({ version: 7, shader: 'pbr', ior: 3 }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /ior must be a finite number from 1 to 2.5/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(materialPath, JSON.stringify({ version: 7, shader: 'pbr', wrap_u: 'border' }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /wrap_u must be repeat, clamp, or mirror/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(materialPath, JSON.stringify({
      version: 7,
      shader: 'pbr',
      filter: 'nearest',
      mipmap_filter: 'linear',
      anisotropy: 8,
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /anisotropy above 1 requires linear texture and mipmap filters/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(materialPath, JSON.stringify({
      version: 7,
      shader: 'pbr',
      ior: 1.33,
      clearcoat: 0.75,
      clearcoat_roughness: 0.15,
      filter: 'linear',
      mipmap_filter: 'linear',
      anisotropy: 8,
    }));
    buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(existsSync(join(paths.output, 'Assets', 'Materials', 'Paint.mmat')), true);
  } finally {
    rmSync(paths.root, { recursive: true, force: true });
  }
});

test('buildPcPackage resolves material instance parents and rejects invalid inheritance graphs', () => {
  const paths = fixture('material-instance');
  try {
    writeFileSync(join(paths.project, 'Assets', 'Scenes', 'Main.mscene'), JSON.stringify({
      world: { entities: [{ components: {
        MeshRenderer: { mesh: 'cube', material: 'Assets/Materials/Ocean.minst' },
      } }] },
    }));
    const base = join(paths.project, 'Assets', 'Materials', 'Base.mmat');
    const ocean = join(paths.project, 'Assets', 'Materials', 'Ocean.minst');
    const wet = join(paths.project, 'Assets', 'Materials', 'Wet.minst');
    writeFileSync(base, JSON.stringify({ version: 7, shader: 'pbr', roughness: 0.8 }));

    writeFileSync(ocean, JSON.stringify({
      version: 1,
      parent: 'Assets/Materials/Base.mmat',
      overrides: { ior: 4 },
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /ior must be from 1 to 2.5/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(ocean, JSON.stringify({ version: 1, parent: 'Assets/Materials/Wet.minst' }));
    writeFileSync(wet, JSON.stringify({ version: 1, parent: 'Assets/Materials/Ocean.minst' }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /material instance inheritance cycle/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(ocean, JSON.stringify({
      version: 2,
      parent: 'Assets/Materials/Base.mmat',
      overrides: { custom_parameters: { rim_power: [3, 0, 0, 0] } },
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /custom parameters require a custom parent material/);
    assert.equal(existsSync(paths.output), false);

    mkdirSync(join(paths.project, 'Assets', 'Shaders'), { recursive: true });
    writeFileSync(base, JSON.stringify({
      version: 8,
      shader: 'custom',
      custom_shader: 'Assets/Shaders/Rim.mshader',
      roughness: 0.8,
    }));
    writeFileSync(join(paths.project, 'Assets', 'Shaders', 'Rim.mshader'), `
      /* MENGINE_PARAMETERS
      {"parameters":[
        {"name":"rim_color","type":"color","default":[1,1,1,1]},
        {"name":"rim_power","type":"float","default":2,"min":0,"max":8}
      ]}
      */
      fn mengine_lit_surface_hook(
        surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>
      ) -> MEngineSurface { return surface; }
    `);
    writeFileSync(wet, JSON.stringify({
      version: 2,
      name: 'Wet',
      parent: 'Assets/Materials/Base.mmat',
      overrides: {
        roughness: 0.2,
        clearcoat: 0.7,
        custom_parameters: { rim_color: [0.2, 0.5, 1, 1] },
      },
    }));
    writeFileSync(ocean, JSON.stringify({
      name: 'Ocean',
      parent: 'Assets/Materials/Wet.minst',
      overrides: {
        base_color: [0, 0.2, 0.8, 1],
        ior: 1.33,
        custom_parameters: { removed: [3, 0, 0, 0] },
      },
    }));
    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    }), /parameter 'removed' is not declared/);
    assert.equal(existsSync(paths.output), false);

    writeFileSync(ocean, JSON.stringify({
      version: 2,
      name: 'Ocean',
      parent: 'Assets/Materials/Wet.minst',
      overrides: {
        base_color: [0, 0.2, 0.8, 1],
        ior: 1.33,
        custom_parameters: { rim_power: [3, 0, 0, 0] },
      },
    }));
    buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    assert.equal(existsSync(join(paths.output, 'Assets', 'Materials', 'Base.mmat')), true);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Materials', 'Wet.minst')), true);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Materials', 'Ocean.minst')), true);
    assert.equal(existsSync(join(paths.output, 'Assets', 'Shaders', 'Rim.mshader')), true);
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
      auditedScenes: 2,
      auditedPrefabs: 0,
      auditedMaterials: 0,
      auditedMaterialInstances: 0,
      auditedSurfaceShaders: 0,
      shaderVariants: 0,
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
    writeFileSync(join(paths.project, 'Assets', 'Models', 'missing-albedo.png'), 'image');
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
    });
    const buffer = manifest.files.find(
      (file) => file.path === 'Assets/Models/Environment.bin',
    );
    assert.equal(buffer?.category, 'model');
    assert.deepEqual(buffer?.includedBy, [{
      kind: 'glTF buffer',
      from: 'Assets/Models/Environment.gltf',
    }]);
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

    let firstCache = null;
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      onBuildCacheStats: (stats) => { firstCache = stats; },
    });
    assert.deepEqual(firstCache, {
      enabled: true,
      hits: 0,
      misses: 3,
      reusedBytes: 0,
      storedBytes: firstCache.storedBytes,
      recoveredEntries: 0,
      failures: 0,
    });
    assert.ok(firstCache.storedBytes > 0);
    assert.equal(manifest.project.startupScript, 'Assets/Scripts/Main.js');
    const compiledScript = manifest.files.find(
      (file) => file.path === 'Assets/Scripts/Main.js',
    );
    assert.equal(compiledScript?.category, 'script');
    assert.deepEqual(compiledScript?.includedBy, [{
      kind: 'compiled startup script',
      from: 'project.json',
    }]);
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

    const firstPublishedManifest = readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8');
    let secondCache = null;
    const cachedManifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      clean: true,
      onBuildCacheStats: (stats) => { secondCache = stats; },
    });
    assert.equal(cachedManifest.contentHash, manifest.contentHash);
    assert.equal(readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8'), firstPublishedManifest);
    assert.equal(secondCache.hits, 3);
    assert.equal(secondCache.misses, 0);
    assert.ok(secondCache.reusedBytes > 0);

    const objectsRoot = join(paths.project, '.mengine', 'Library', 'BuildCache', 'v1', 'objects');
    const objectPath = readdirSync(objectsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => readdirSync(join(objectsRoot, entry.name))
        .map((name) => join(objectsRoot, entry.name, name)))[0];
    assert.ok(objectPath);
    writeFileSync(objectPath, 'corrupt-cache-entry');
    let recoveredCache = null;
    const recoveredManifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      clean: true,
      onBuildCacheStats: (stats) => { recoveredCache = stats; },
    });
    assert.equal(recoveredManifest.contentHash, manifest.contentHash);
    assert.equal(readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8'), firstPublishedManifest);
    assert.ok(recoveredCache.recoveredEntries >= 1);
    assert.ok(recoveredCache.misses >= 1);
    assert.equal(recoveredCache.failures, 0);

    const entriesRoot = join(paths.project, '.mengine', 'Library', 'BuildCache', 'v1', 'entries');
    const entryPath = join(entriesRoot, readdirSync(entriesRoot)[0]);
    writeFileSync(entryPath, '{broken cache entry');
    let recoveredEntryCache = null;
    const recoveredEntryManifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      clean: true,
      onBuildCacheStats: (stats) => { recoveredEntryCache = stats; },
    });
    assert.equal(recoveredEntryManifest.contentHash, manifest.contentHash);
    assert.ok(recoveredEntryCache.recoveredEntries >= 1);
    assert.ok(recoveredEntryCache.misses >= 1);
    assert.equal(recoveredEntryCache.failures, 0);

    writeFileSync(
      join(paths.project, 'Assets', 'Scripts', 'helpers.ts'),
      'function scaled(value: number): number { return value * 3; }',
    );
    let invalidatedCache = null;
    const changedManifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      platform: 'windows',
      clean: true,
      onBuildCacheStats: (stats) => { invalidatedCache = stats; },
    });
    assert.notEqual(changedManifest.contentHash, manifest.contentHash);
    assert.equal(invalidatedCache.hits, 2);
    assert.equal(invalidatedCache.misses, 1);
    assert.match(
      readFileSync(join(paths.output, 'Assets', 'Scripts', 'Main.js'), 'utf8'),
      /value \* 3/,
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

test('buildPcPackage disables an unsafe cache root without blocking publication', () => {
  const paths = fixture('unsafe-cache-root');
  try {
    writeFileSync(join(paths.project, '.mengine'), 'not a cache directory');
    let cache = null;
    const manifest = buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'test-engine',
      onBuildCacheStats: (stats) => { cache = stats; },
    });
    assert.ok(existsSync(join(paths.output, manifest.executable)));
    assert.deepEqual(cache, {
      enabled: false,
      hits: 0,
      misses: 0,
      reusedBytes: 0,
      storedBytes: 0,
      recoveredEntries: 0,
      failures: 0,
    });
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

test('buildPcPackage cancellation before publish preserves the previous build and removes staging', () => {
  const paths = fixture('cancel-preserves-previous-build');
  try {
    buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'previous-engine',
      platform: 'windows',
    });
    const previousManifest = readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8');
    let cancelled = false;

    assert.throws(() => buildPcPackage({
      projectDir: paths.project,
      outputDir: paths.output,
      runtimePath: paths.runtime,
      engineVersion: 'replacement-engine',
      platform: 'windows',
      clean: true,
      isCancelled: () => cancelled,
      verifyStagedBuild() {
        cancelled = true;
      },
    }), /build cancelled during publish/);

    assert.equal(
      readFileSync(join(paths.output, BUILD_MANIFEST_FILE), 'utf8'),
      previousManifest,
    );
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
