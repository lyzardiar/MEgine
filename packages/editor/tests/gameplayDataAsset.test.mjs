// Author: MiYu

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLevelDefinition,
  parseGameplayDataAsset,
  serializeGameplayDataAsset,
} from '../src/gameplayDataAsset.ts';

test('gameplay skill assets normalize and round-trip', () => {
  const parsed = parseGameplayDataAsset(JSON.stringify({
    skills: [{ id: 'nova', name: 'Nova', damage: 24, pattern: 'radial' }],
  }), 'Assets/Data/Skills.mskill');
  assert.equal(parsed.kind, 'skill-library');
  assert.deepEqual(parsed.skills[0], {
    id: 'nova',
    name: 'Nova',
    description: '',
    icon: '',
    pattern: 'radial',
    damage: 24,
    cooldown: 1,
    projectileSpeed: 8,
    range: 8,
    count: 1,
    maxLevel: 5,
    color: '#7ee7ff',
    upgrades: [1, 1.25, 1.55, 1.9, 2.3],
  });
  assert.deepEqual(
    parseGameplayDataAsset(serializeGameplayDataAsset(parsed), 'Skills.mskill'),
    parsed,
  );
});

test('gameplay data rejects duplicate ids and an out-of-bounds boss', () => {
  assert.throws(() => parseGameplayDataAsset(JSON.stringify({
    skills: [{ id: 'nova' }, { id: 'NOVA' }],
  }), 'Skills.mskill'), /duplicate skill id/i);
  const level = createLevelDefinition(0);
  level.duration = 60;
  level.boss.spawnAt = 61;
  assert.throws(
    () => parseGameplayDataAsset(JSON.stringify({ levels: [level] }), 'Levels.mlevel'),
    /boss spawns after/i,
  );
});
