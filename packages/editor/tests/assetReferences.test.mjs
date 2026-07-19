import assert from 'node:assert/strict';
import test from 'node:test';
import { scanAssetReferences } from '../src/assetReferences.ts';

test('asset reference scan reports exact and sprite subresource JSON pointers', () => {
  const references = scanAssetReferences('Assets/Sprites/Hero.png', [
    {
      relPath: 'Assets/Scenes/Main.mscene',
      kind: 'scene',
      text: JSON.stringify({
        world: {
          entities: [{ components: {
            SpriteRenderer: { sprite: 'Assets/Sprites/Hero.png#Idle' },
            Image: { sprite: 'Assets\\Sprites\\Hero.png' },
          } }],
        },
      }),
    },
  ]);
  assert.deepEqual(references.map((reference) => [
    reference.kind,
    reference.location,
    reference.reference,
  ]), [
    ['exact', '/world/entities/0/components/Image/sprite', 'Assets\\Sprites\\Hero.png'],
    ['subresource', '/world/entities/0/components/SpriteRenderer/sprite', 'Assets/Sprites/Hero.png#Idle'],
  ]);
});

test('asset reference scan matches a named slice without matching sibling slices', () => {
  const references = scanAssetReferences('Assets/Sprites/Hero.png#Idle', [{
    relPath: 'Assets/Prefabs/Hero.prefab',
    kind: 'prefab',
    text: JSON.stringify({
      idle: 'Assets/Sprites/Hero.png#Idle',
      run: 'Assets/Sprites/Hero.png#Run',
    }),
  }]);
  assert.deepEqual(references.map((reference) => reference.reference), [
    'Assets/Sprites/Hero.png#Idle',
  ]);
});

test('scripts and broken JSON retain line locations with path boundaries', () => {
  const references = scanAssetReferences('Assets/Materials/Hero.mmat', [
    {
      relPath: 'Assets/Scripts/Spawn.ts',
      kind: 'script',
      text: [
        'const material = "Assets/Materials/Hero.mmat";',
        'const backup = "Assets/Materials/Hero.mmat.bak";',
      ].join('\n'),
    },
    {
      relPath: 'Assets/Materials/Broken.minst',
      kind: 'material',
      text: '{ "parent": "Assets/Materials/Hero.mmat"',
    },
  ]);
  assert.deepEqual(references.map((reference) => [reference.sourcePath, reference.location]), [
    ['Assets/Materials/Broken.minst', '1:14'],
    ['Assets/Scripts/Spawn.ts', '1:19'],
  ]);
});

test('glTF URIs and Spine atlas pages resolve relative to their source assets', () => {
  const textureReferences = scanAssetReferences('Assets/Models/Textures/Hero Base.png', [
    {
      relPath: 'Assets/Models/Hero.gltf',
      kind: 'model',
      text: JSON.stringify({
        buffers: [{ uri: 'Hero.bin' }],
        images: [{ uri: 'Textures/Hero%20Base.png' }],
      }),
    },
    {
      relPath: 'Assets/Spine/Hero/Hero.atlas',
      kind: 'spine-atlas',
      text: [
        '../../Models/Textures/Hero Base.png',
        'size: 256,256',
        'format: RGBA8888',
        'filter: Linear,Linear',
        'HeroRegion',
        '  bounds: 0,0,64,64',
      ].join('\n'),
    },
  ]);
  assert.deepEqual(textureReferences.map((reference) => [
    reference.sourcePath,
    reference.location,
    reference.reference,
  ]), [
    ['Assets/Models/Hero.gltf', '/images/0/uri', 'Textures/Hero%20Base.png'],
    ['Assets/Spine/Hero/Hero.atlas', '1:1', '../../Models/Textures/Hero Base.png'],
  ]);

  assert.deepEqual(
    scanAssetReferences('Assets/Models/Hero.bin', [{
      relPath: 'Assets/Models/Hero.gltf',
      kind: 'model',
      text: JSON.stringify({ buffers: [{ uri: 'Hero.bin' }] }),
    }]).map((reference) => reference.location),
    ['/buffers/0/uri'],
  );
});

test('reference scan keeps self references and orders numeric locations', () => {
  const references = scanAssetReferences('Assets/A.mmat', [
    { relPath: 'Assets/A.mmat', kind: 'material', text: '{"parent":"Assets/A.mmat"}' },
    {
      relPath: 'Assets/Z.ts',
      kind: 'script',
      text: `${'\n'.repeat(9)}"Assets/A.mmat"\n"Assets/A.mmat"`,
    },
  ]);
  assert.deepEqual(references.map((reference) => [reference.sourcePath, reference.location]), [
    ['Assets/A.mmat', '/parent'],
    ['Assets/Z.ts', '10:2'],
    ['Assets/Z.ts', '11:2'],
  ]);
});
