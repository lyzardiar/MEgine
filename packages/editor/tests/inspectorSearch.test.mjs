import assert from 'node:assert/strict';
import test from 'node:test';
import {
  componentCatalogMatches,
  fuzzyInspectorMatch,
  inspectorSectionMatches,
} from '../src/inspectorSearch.ts';

test('Inspector filter matches component titles and property keys fuzzily', () => {
  assert.equal(fuzzyInspectorMatch('Anchored Position', 'ancpos'), true);
  assert.equal(inspectorSectionMatches('ray color', 'Image', 'color raycast_target sprite'), true);
  assert.equal(inspectorSectionMatches('audio', 'Image', 'color raycast_target sprite'), false);
});

test('Add Component search covers label, type, and description', () => {
  const component = { type: 'ParticleEmitter2D', label: 'Particle Emitter 2D', description: 'Sprite particles' };
  assert.equal(componentCatalogMatches('sprite', component), true);
  assert.equal(componentCatalogMatches('pe2', component), true);
  assert.equal(componentCatalogMatches('camera', component), false);
});
