import assert from 'node:assert/strict';
import test from 'node:test';
import { canImportUnityPackage } from '../src/unityPackageImportModel.ts';
import { validateImportedAssetName } from '../src/assetImportModel.ts';

test('Unity package import requires analyzed non-empty contents without blockers', () => {
  const report = { fingerprint: 'sha256', asset_count: 1, blockers: [] };
  assert.equal(canImportUnityPackage(report), true);
  assert.equal(canImportUnityPackage(null), false);
  assert.equal(canImportUnityPackage({ ...report, fingerprint: '' }), false);
  assert.equal(canImportUnityPackage({ ...report, asset_count: 0 }), false);
  assert.equal(canImportUnityPackage({ ...report, blockers: ['Unsupported shader'] }), false);
});

test('particle assets can be imported as native MEngine assets', () => {
  assert.equal(validateImportedAssetName('Spark.mparticle'), 'Spark.mparticle');
});
