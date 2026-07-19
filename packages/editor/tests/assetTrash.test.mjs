import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAssetTrashPlan } from '../src/assetTrash.ts';

const source = {
  relPath: 'Assets/Materials/Hero.mmat',
  revision: 'material-revision',
  guid: '55081cc1-f44d-49fc-8ada-ee889a26ee36',
  kind: 'material',
  metaStatus: 'ready',
};

test('asset Trash ignores self references but preserves surviving blockers', () => {
  const plan = buildAssetTrashPlan(source.relPath, source, 'tree-revision', 'manifest-revision', {
    targetPath: source.relPath,
    scannedFiles: 3,
    skippedFiles: 1,
    truncated: false,
    references: [{
      sourcePath: source.relPath,
      location: '/parent',
      reference: source.relPath,
      kind: 'exact',
      snippet: source.relPath,
    }, {
      sourcePath: `${source.relPath}.sprite.json`,
      location: '/source',
      reference: source.relPath,
      kind: 'exact',
      snippet: source.relPath,
    }, {
      sourcePath: 'Assets/Prefabs/Hero.prefab',
      location: '/material',
      reference: source.relPath,
      kind: 'exact',
      snippet: source.relPath,
    }],
  });
  assert.equal(plan.referenceReport.references.length, 1);
  assert.equal(plan.referenceReport.references[0].sourcePath, 'Assets/Prefabs/Hero.prefab');
  assert.equal(plan.referenceReport.skippedFiles, 1);
  assert.equal(plan.treeRevision, 'tree-revision');
  assert.equal(plan.manifestRevision, 'manifest-revision');
});

test('asset Trash rejects auxiliary sidecars and unhealthy identities', () => {
  assert.throws(() => buildAssetTrashPlan(
    'Assets/Textures/Hero.png.sprite.json',
    {
      ...source,
      relPath: 'Assets/Textures/Hero.png.sprite.json',
      kind: 'sprite-import',
      metaStatus: 'auxiliary',
      guid: null,
    },
    'tree-revision',
    'manifest-revision',
    {
      targetPath: 'Assets/Textures/Hero.png.sprite.json',
      references: [],
      scannedFiles: 0,
      skippedFiles: 0,
      truncated: false,
    },
  ), /moves to Trash with its source texture/);
  assert.throws(() => buildAssetTrashPlan(
    source.relPath,
    { ...source, metaStatus: 'duplicate' },
    'tree-revision',
    'manifest-revision',
    {
      targetPath: source.relPath,
      references: [],
      scannedFiles: 0,
      skippedFiles: 0,
      truncated: false,
    },
  ), /metadata must be healthy/);
});
