import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSortingLayerSettings,
  sortingLayerRank,
  validateTagsAndLayers,
  validateSortingLayers,
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
    tags: ['Untagged'],
    gameLayers: [{ index: 0, name: 'Default' }],
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

test('strict authoring validation rejects settings that normalization would discard or rewrite', () => {
  assert.equal(validateSortingLayers([
    { id: 'default', name: 'Default' },
    { id: 'effects', name: 'Effects' },
  ]), null);
  assert.match(validateSortingLayers([
    { id: 'default', name: 'Default' },
    { id: 'bad/id', name: 'Effects' },
  ]), /Invalid stable id/);
  assert.match(validateSortingLayers([
    { id: 'DEFAULT', name: 'Default' },
  ]), /must be 'default'/);
  assert.match(validateSortingLayers([
    { id: 'default', name: 'Other' },
  ]), /name must be 'Default'/);
  assert.match(validateSortingLayers([
    { id: 'default', name: 'Default' },
    { id: 'effects', name: 'Default' },
  ]), /Duplicate sorting layer name/);
});

test('tags and GameObject layers normalize legacy settings and validate stable indices', () => {
  const settings = normalizeSortingLayerSettings({
    layers: [{ id: 'default', name: 'Default' }],
    tags: ['Player', 'player', 'UNTAGGED'],
    gameLayers: [
      { index: 8, name: 'Gameplay' },
      { index: 8, name: 'Duplicate' },
    ],
  });
  assert.deepEqual(settings.tags, ['Untagged', 'Player']);
  assert.deepEqual(settings.gameLayers, [
    { index: 0, name: 'Default' },
    { index: 8, name: 'Gameplay' },
  ]);
  assert.equal(validateTagsAndLayers(
    ['Untagged', 'Player'],
    [{ index: 0, name: 'Default' }, { index: 8, name: 'Gameplay' }],
  ), null);
  assert.match(validateTagsAndLayers(
    ['Player'],
    [{ index: 0, name: 'Default' }],
  ), /Untagged/);
  assert.match(validateTagsAndLayers(
    ['Untagged'],
    [{ index: 0, name: 'Default' }, { index: 32, name: 'Invalid' }],
  ), /between 0 and 31/);
});
