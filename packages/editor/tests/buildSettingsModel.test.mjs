import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAssetPolicyEqual,
  buildAssetPolicyUpdate,
  buildAssetPathsDirty,
  parseAlwaysIncludeDraft,
} from '../src/buildSettingsModel.ts';

test('Always Include drafts normalize whitespace without hiding ordering or duplicates', () => {
  assert.deepEqual(
    parseAlwaysIncludeDraft('  Assets/Dynamic  \r\n\n Assets/Localization\nAssets/Dynamic '),
    ['Assets/Dynamic', 'Assets/Localization', 'Assets/Dynamic'],
  );
});

test('Build asset path dirty state compares the exact persisted normalized list', () => {
  const saved = ['Assets/Dynamic', 'Assets/Localization'];
  assert.equal(
    buildAssetPathsDirty(' Assets/Dynamic\nAssets/Localization\n', saved),
    false,
  );
  assert.equal(
    buildAssetPathsDirty('Assets/Localization\nAssets/Dynamic', saved),
    true,
  );
  assert.equal(buildAssetPathsDirty('', saved), true);
});

test('Build asset policy equality separates scene-only revisions from content conflicts', () => {
  const policy = {
    assetMode: 'referenced',
    alwaysInclude: ['Assets/Dynamic', 'Assets/Localization'],
    shaderVariantLimit: 512,
  };
  assert.equal(buildAssetPolicyEqual(policy, structuredClone(policy)), true);
  assert.equal(buildAssetPolicyEqual(policy, {
    ...policy,
    alwaysInclude: [...policy.alwaysInclude].reverse(),
  }), false);
  assert.equal(buildAssetPolicyEqual(policy, {
    ...policy,
    assetMode: 'all',
  }), false);
  assert.equal(buildAssetPolicyEqual(policy, {
    ...policy,
    shaderVariantLimit: 256,
  }), false);
});

test('Build asset policy updates preserve safe drafts and reject stale baselines', () => {
  const current = {
    revision: 'revision-a',
    assetMode: 'referenced',
    alwaysInclude: ['Assets/Dynamic'],
    shaderVariantLimit: 512,
  };
  const sceneOnlyUpdate = { ...structuredClone(current), revision: 'revision-b' };
  assert.equal(
    buildAssetPolicyUpdate('Assets/Dynamic', current, sceneOnlyUpdate, current.revision),
    'reload',
  );
  assert.equal(
    buildAssetPolicyUpdate('Assets/LocalDraft', current, sceneOnlyUpdate, current.revision),
    'advance-revision',
  );
  assert.equal(
    buildAssetPolicyUpdate('Assets/LocalDraft', current, {
      ...sceneOnlyUpdate,
      alwaysInclude: ['Assets/External'],
    }, current.revision),
    'conflict',
  );
  assert.equal(
    buildAssetPolicyUpdate('Assets/LocalDraft', current, sceneOnlyUpdate, 'older-revision'),
    'conflict',
  );
});
