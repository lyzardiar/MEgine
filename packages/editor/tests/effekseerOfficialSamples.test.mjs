import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const sampleRoot = join(repositoryRoot, 'samples', 'effekseer-fire');
const expectedEffects = [
  'ef_fire01.efkefc',
  'ef_fire02.efkefc',
  'ef_fire03.efkefc',
  'ef_holy01.efkefc',
  'ef_ice01.efkefc',
  'ef_ice02.efkefc',
  'ef_ice03.efkefc',
  'ef_lightning01.efkefc',
  'ef_lightning02.efkefc',
  'ef_lightning03.efkefc',
  'ef_parts_hit01.efkefc',
  'ef_parts_hit02.efkefc',
  'ef_wind01.efkefc',
  'ef_wind02.efkefc',
  'ef_wind03.efkefc',
];

test('Effekseer showcase contains the complete pinned public effect set', () => {
  const effects = readdirSync(join(sampleRoot, 'Assets', 'Effects'))
    .filter((file) => file.endsWith('.efkefc'))
    .sort();
  assert.deepEqual(effects, [...expectedEffects].sort());
  assert.match(readFileSync(join(sampleRoot, 'ASSET_LICENSE.md'), 'utf8'), /CC0/i);
  const catalog = JSON.parse(readFileSync(
    join(sampleRoot, 'Assets', 'Effects', 'Combat.meffect'),
    'utf8',
  ));
  assert.equal(catalog.version, 1);
  assert.equal(catalog.effects.length, expectedEffects.length);
  assert.ok(catalog.presets.length >= 5);
});

test('Effekseer UI sample is hosted by Canvas and shipped in build scenes', () => {
  const scene = JSON.parse(readFileSync(join(sampleRoot, 'Assets', 'Scenes', 'UI.mscene'), 'utf8'));
  const canvas = scene.world.entities.find((entity) => entity.components.Canvas);
  const effect = scene.world.entities.find((entity) => entity.components.EffekseerEffect);
  const project = JSON.parse(readFileSync(join(sampleRoot, 'project.json'), 'utf8'));

  assert.equal(canvas.components.Canvas.render_mode, 'ScreenSpaceOverlay');
  assert.equal(effect.parent, canvas.entity);
  assert.deepEqual(effect.components.RectTransform.size_delta, [320, 320]);
  assert.equal(effect.components.EffekseerEffect.render_mode, 'screen');
  assert.equal(effect.components.EffekseerEffect.screen_scale, 0.25);
  assert.ok(project.buildScenes.includes('Assets/Scenes/UI.mscene'));
  assert.ok(project.buildScenes.includes('Assets/Scenes/AgentCombat.mscene'));
});

test('Agent-generated combat showcase contains only background-verified effect layers', () => {
  const scene = JSON.parse(readFileSync(
    join(sampleRoot, 'Assets', 'Scenes', 'AgentCombat.mscene'),
    'utf8',
  ));
  const references = scene.world.entities
    .map((entity) => entity.components.EffekseerEffect?.effect)
    .filter(Boolean);
  assert.ok(references.length >= 7);
  assert.ok(references.every((effect) => !effect.includes('ef_wind')));
  assert.ok(!references.includes('Assets/Effects/ef_parts_hit02.efkefc'));
  assert.equal(scene.world.frame, 0);
  assert.deepEqual(scene.world.clear_color, [0.015, 0.02, 0.035, 1]);
});

test('Spine UI sample is included in its showcase build scenes', () => {
  const project = JSON.parse(readFileSync(
    join(repositoryRoot, 'samples', 'spine-showcase', 'project.json'),
    'utf8',
  ));
  assert.ok(project.buildScenes.includes('Assets/Scenes/UI.mscene'));
});
