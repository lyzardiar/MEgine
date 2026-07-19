import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssetDuplicatePlan, buildAssetRenamePlan } from '../src/assetRename.ts';

const sourceAsset = {
  relPath: 'Assets/Textures/Hero.png',
  revision: 'source-revision',
  guid: '55081cc1-f44d-49fc-8ada-ee889a26ee36',
  metaStatus: 'ready',
};

test('asset rename preserves JSON formatting while rewriting exact and slice references', () => {
  const text = '{\n  "sprite": "Assets/Textures/Hero.png#Idle",\n  "name": "Hero"\n}\n';
  const plan = buildAssetRenamePlan(
    sourceAsset.relPath,
    'Assets/Characters/Hero.png',
    sourceAsset,
    [{ relPath: 'Assets/Prefabs/Hero.prefab', kind: 'prefab', revision: 'prefab-revision', text }],
  );
  assert.equal(plan.automaticUpdates.length, 1);
  assert.equal(
    plan.automaticUpdates[0].contents,
    '{\n  "sprite": "Assets/Characters/Hero.png#Idle",\n  "name": "Hero"\n}\n',
  );
  assert.equal(plan.manualReferences.length, 0);
});

test('asset rename adjusts glTF and Spine relative references without rewriting unrelated text', () => {
  const plan = buildAssetRenamePlan(
    sourceAsset.relPath,
    'Assets/Characters/Hero.png',
    sourceAsset,
    [
      {
        relPath: 'Assets/Models/Hero.gltf',
        kind: 'model',
        revision: 'model-revision',
        text: '{"images":[{"uri":"../Textures/Hero.png","name":"../Textures/Hero.png"}]}',
      },
      {
        relPath: 'Assets/Spine/Hero.atlas',
        kind: 'spine-atlas',
        revision: 'atlas-revision',
        text: '../Textures/Hero.png\nsize: 1,1\nformat: RGBA8888\n',
      },
    ],
  );
  assert.deepEqual(plan.automaticUpdates.map((update) => [update.sourcePath, update.contents]), [
    [
      'Assets/Models/Hero.gltf',
      '{"images":[{"uri":"../Characters/Hero.png","name":"../Textures/Hero.png"}]}',
    ],
    [
      'Assets/Spine/Hero.atlas',
      '../Characters/Hero.png\nsize: 1,1\nformat: RGBA8888\n',
    ],
  ]);
});

test('moving glTF or Spine sources preserves all of their relative dependencies', () => {
  const model = {
    relPath: 'Assets/Models/Hero.gltf',
    revision: 'model-revision',
    guid: sourceAsset.guid,
    metaStatus: 'ready',
  };
  const modelPlan = buildAssetRenamePlan(
    model.relPath,
    'Assets/Characters/Hero/Hero.gltf',
    model,
    [{
      relPath: model.relPath,
      kind: 'model',
      revision: model.revision,
      text: '{"buffers":[{"uri":"Hero.bin"}],"images":[{"uri":"Textures/Hero Base.png"}]}',
    }],
  );
  assert.equal(
    modelPlan.automaticUpdates[0].contents,
    '{"buffers":[{"uri":"../../Models/Hero.bin"}],"images":[{"uri":"../../Models/Textures/Hero%20Base.png"}]}',
  );

  const atlas = { ...model, relPath: 'Assets/Spine/Hero.atlas' };
  const atlasPlan = buildAssetRenamePlan(
    atlas.relPath,
    'Assets/Characters/Hero/Hero.atlas',
    atlas,
    [{
      relPath: atlas.relPath,
      kind: 'spine-atlas',
      revision: atlas.revision,
      text: 'Hero.png\nsize: 1,1\nformat: RGBA8888\n',
    }],
  );
  assert.equal(atlasPlan.automaticUpdates[0].contents, '../../Spine/Hero.png\nsize: 1,1\nformat: RGBA8888\n');
});

test('scripts and invalid JSON remain manual and extensions cannot change', () => {
  const plan = buildAssetRenamePlan(
    sourceAsset.relPath,
    'Assets/Characters/Hero.png',
    sourceAsset,
    [
      {
        relPath: 'Assets/Scripts/Hero.ts',
        kind: 'script',
        revision: 'script-revision',
        text: 'const hero = "Assets/Textures/Hero.png";',
      },
      {
        relPath: 'Assets/Prefabs/Broken.prefab',
        kind: 'prefab',
        revision: 'broken-revision',
        text: '{"sprite":"Assets/Textures/Hero.png"',
      },
    ],
  );
  assert.equal(plan.automaticUpdates.length, 0);
  assert.deepEqual(plan.manualReferences.map((reference) => reference.sourcePath), [
    'Assets/Scripts/Hero.ts',
    'Assets/Prefabs/Broken.prefab',
  ].sort());
  assert.throws(() => buildAssetRenamePlan(
    sourceAsset.relPath,
    'Assets/Characters/Hero.jpg',
    sourceAsset,
    [],
  ), /preserve the file extension/);
});

test('script module imports are manual for inbound references and moved source dependencies', () => {
  const scriptAsset = {
    relPath: 'Assets/Scripts/Hero.ts',
    revision: 'hero-revision',
    guid: sourceAsset.guid,
    metaStatus: 'ready',
  };
  const sources = [
    {
      relPath: scriptAsset.relPath,
      kind: 'script',
      revision: scriptAsset.revision,
      text: 'import { weapon } from "./Items/Weapon";\nexport const hero = weapon;',
    },
    {
      relPath: 'Assets/Scripts/Spawner.ts',
      kind: 'script',
      revision: 'spawner-revision',
      text: 'export { hero } from "./Hero";',
    },
    {
      relPath: 'Assets/Scripts/Items/Weapon.ts',
      kind: 'script',
      revision: 'weapon-revision',
      text: 'export const weapon = 1;',
    },
  ];
  const plan = buildAssetRenamePlan(
    scriptAsset.relPath,
    'Assets/Scripts/Characters/Hero.ts',
    scriptAsset,
    sources,
  );
  assert.deepEqual(plan.manualReferences.map((reference) => [
    reference.sourcePath,
    reference.location,
    reference.reference,
  ]), [
    ['Assets/Scripts/Hero.ts', '1:25', './Items/Weapon'],
    ['Assets/Scripts/Spawner.ts', '1:23', './Hero'],
  ]);
});

test('asset duplicate rewrites only its own self and relative dependencies', () => {
  const model = {
    relPath: 'Assets/Models/Hero.gltf',
    revision: 'model-revision',
    guid: sourceAsset.guid,
    metaStatus: 'ready',
    size: 100,
    kind: 'model',
  };
  const plan = buildAssetDuplicatePlan(
    model.relPath,
    'Assets/Characters/Hero Copy.gltf',
    model,
    [{
      relPath: model.relPath,
      kind: 'model',
      revision: model.revision,
      text: '{"extras":{"source":"Assets/Models/Hero.gltf"},"buffers":[{"uri":"Hero.bin"}]}',
    }, {
      relPath: 'Assets/Prefabs/Hero.prefab',
      kind: 'prefab',
      revision: 'prefab-revision',
      text: '{"model":"Assets/Models/Hero.gltf"}',
    }],
  );
  assert.equal(
    plan.contents,
    '{"extras":{"source":"Assets/Characters/Hero Copy.gltf"},"buffers":[{"uri":"../Models/Hero.bin"}]}',
  );
  assert.equal(plan.manualReferences.length, 0);
});

test('binary glb duplicate never enters the JSON rewrite path', () => {
  const model = {
    relPath: 'Assets/Models/Hero.glb',
    revision: 'model-revision',
    guid: sourceAsset.guid,
    metaStatus: 'ready',
    size: 512,
    kind: 'model',
  };
  const plan = buildAssetDuplicatePlan(
    model.relPath,
    'Assets/Characters/Hero Copy.glb',
    model,
    [{
      relPath: model.relPath,
      kind: 'model',
      revision: model.revision,
      text: '{"buffers":[{"uri":"must-not-be-rewritten.bin"}]}',
    }],
  );
  assert.equal(plan.contents, null);
  assert.equal(plan.copiedBytes, model.size);
});

test('cross-directory script duplicate reviews only outbound relative imports', () => {
  const script = {
    relPath: 'Assets/Scripts/Hero.ts',
    revision: 'hero-revision',
    guid: sourceAsset.guid,
    metaStatus: 'ready',
    size: 50,
    kind: 'script',
  };
  const plan = buildAssetDuplicatePlan(
    script.relPath,
    'Assets/Scripts/Characters/Hero.ts',
    script,
    [{
      relPath: script.relPath,
      kind: 'script',
      revision: script.revision,
      text: 'import { weapon } from "./Items/Weapon";',
    }, {
      relPath: 'Assets/Scripts/Spawner.ts',
      kind: 'script',
      revision: 'spawner-revision',
      text: 'import { hero } from "./Hero";',
    }, {
      relPath: 'Assets/Scripts/Items/Weapon.ts',
      kind: 'script',
      revision: 'weapon-revision',
      text: 'export const weapon = 1;',
    }],
  );
  assert.deepEqual(plan.manualReferences.map((reference) => reference.sourcePath), [script.relPath]);
  assert.equal(plan.contents, null);
});
