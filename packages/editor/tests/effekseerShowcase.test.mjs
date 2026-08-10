import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sample = path.join(root, 'samples', 'effekseer-fire');
const scenePath = path.join(sample, 'Assets', 'Scenes', 'CombatSeries.mscene');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8'));
const project = JSON.parse(fs.readFileSync(path.join(sample, 'project.json'), 'utf8'));
const entities = scene.world.entities;

const worldPresets = [
  'Arcane Multi-hit',
  'Chain Lightning Barrage',
  'Crimson Thunder Column',
  'Frost Nova',
  'Holy Ascension',
  'Inferno Domain',
  'Inferno Impact',
  'Jade Blade Storm',
];

test('Effekseer combat series is a build scene containing every world preset', () => {
  assert.ok(project.buildScenes.includes('Assets/Scenes/CombatSeries.mscene'));
  assert.deepEqual(
    entities.filter((entity) => entity.parent == null && worldPresets.includes(entity.name))
      .map((entity) => entity.name)
      .sort(),
    worldPresets,
  );
  assert.deepEqual(scene.world.clear_color, [0.015, 0.02, 0.035, 1]);
});

test('trail-sensitive showcase roots use bounded loop motion', () => {
  const moving = entities.filter((entity) => entity.components.LoopMotion);
  assert.deepEqual(
    moving.map((entity) => entity.name).sort(),
    ['Arcane Multi-hit', 'Chain Lightning Barrage', 'Inferno Impact', 'Jade Blade Storm'],
  );
  for (const entity of moving) {
    const motion = entity.components.LoopMotion;
    assert.equal(motion.start.length, 3);
    assert.equal(motion.end.length, 3);
    assert.ok(motion.start.some((value, index) => value !== motion.end[index]));
    assert.ok(motion.frequency > 0 && motion.frequency <= 1);
    assert.ok(motion.phase >= 0 && motion.phase <= 1);
    const player = entity.components.AnimationPlayer;
    assert.equal(player.play_on_awake, true);
    assert.equal(player.playing, true);
    assert.match(player.clip, /^Assets\/Animations\/.+Loop\.manim$/);
    const clip = JSON.parse(fs.readFileSync(path.join(sample, player.clip), 'utf8'));
    assert.equal(clip.wrap_mode, 'ping_pong');
    assert.ok(clip.tracks.some((track) => track.property === 'position.x'));
  }
});

test('combat series uses only catalogued verified Effekseer binaries', () => {
  const references = new Set(
    entities.flatMap((entity) => {
      const effect = entity.components.EffekseerEffect?.effect;
      return effect ? [effect] : [];
    }),
  );
  assert.ok(references.size > 0);
  for (const reference of references) {
    assert.match(reference, /^Assets\/Effects\/ef_(fire|holy|ice|lightning|parts_hit01)/);
    assert.ok(!reference.includes('ef_wind'));
    assert.ok(!reference.includes('ef_parts_hit02'));
  }
});
