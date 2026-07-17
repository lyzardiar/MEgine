import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSortingLayerSettings,
  sortingLayerRank,
} from '../src/sortingLayerModel.ts';

test('sorting layer normalization guarantees Default and rejects ambiguous entries', () => {
  const settings = normalizeSortingLayerSettings({
    version: 99,
    layers: [
      { id: 'background', name: 'Background' },
      { id: 'BACKGROUND', name: 'Duplicate Id' },
      { id: 'bad/id', name: 'Invalid' },
      { id: 'effects', name: 'Background' },
    ],
  });
  assert.deepEqual(settings, {
    version: 1,
    layers: [
      { id: 'default', name: 'Default' },
      { id: 'background', name: 'Background' },
    ],
  });
});

test('stable ids survive names and missing ids use Default rank', () => {
  const settings = normalizeSortingLayerSettings({
    layers: [
      { id: 'background', name: 'Environment Renamed' },
      { id: 'default', name: 'Cannot Rename Default' },
      { id: 'effects', name: 'Effects' },
    ],
  });
  assert.equal(sortingLayerRank(settings, 'background'), 0);
  assert.equal(sortingLayerRank(settings, 'effects'), 2);
  assert.equal(sortingLayerRank(settings, 'deleted-layer'), 1);
  assert.equal(settings.layers[1].name, 'Default');
});
