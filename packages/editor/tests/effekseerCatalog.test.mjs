import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildEffekseerCatalog } from '../src/effekseerCatalog.ts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const effectsRoot = join(repositoryRoot, 'samples', 'effekseer-fire', 'Assets', 'Effects');
const effectPaths = readdirSync(effectsRoot)
  .filter((file) => file.endsWith('.efkefc'))
  .map((file) => `Assets/Effects/${file}`);
const document = {
  path: 'Assets/Effects/Combat.meffect',
  revision: 'test-revision',
  contents: readFileSync(join(effectsRoot, 'Combat.meffect'), 'utf8'),
};

test('Effekseer semantic catalog covers every pinned binary with purpose metadata', () => {
  const catalog = buildEffekseerCatalog(effectPaths, [document]);
  assert.deepEqual(catalog.diagnostics, []);
  assert.equal(catalog.effects.length, 15);
  assert.ok(catalog.effects.every((effect) => effect.group !== 'unclassified'));
  assert.deepEqual(
    catalog.effects.filter((effect) => effect.renderStatus === 'experimental').map((effect) => effect.id),
    ['hit_sparks', 'wind_blade', 'wind_slash', 'wind_vortex'],
  );
  assert.ok(catalog.groups.some((group) => group.id === 'directional-strike' && group.count >= 4));
  assert.match(catalog.catalogRevision, /^effekseer-catalog-v1-[0-9a-f]{16}$/);
});
test('Effekseer catalog filters by prompt vocabulary, purpose, and semantic tags', () => {
  const lightning = buildEffekseerCatalog(effectPaths, [document], { search: 'column' });
  assert.deepEqual(lightning.effects.map((effect) => effect.id), ['lightning_column']);

  const cyanArc = buildEffekseerCatalog(effectPaths, [document], {
    group: 'directional-strike',
    tags: ['cyan', 'shield'],
  });
  assert.deepEqual(cyanArc.effects.map((effect) => effect.id), ['ice_arc']);

  const experimental = buildEffekseerCatalog(effectPaths, [document], {
    renderStatus: 'experimental',
  });
  assert.deepEqual(experimental.effects.map((effect) => effect.id), [
    'hit_sparks',
    'wind_blade',
    'wind_slash',
    'wind_vortex',
  ]);
});

test('Effekseer catalog ships bounded prompt-oriented combat recipes', () => {
  const catalog = buildEffekseerCatalog(effectPaths, [document]);
  assert.deepEqual(catalog.presets.map((preset) => preset.id), [
    'arcane_multi_hit',
    'crimson_thunder_column',
    'cyan_guard_arc_ui',
    'jade_blade_storm',
    'ui_hit_confirm',
  ]);
  assert.ok(catalog.presets.every((preset) => preset.layers.length > 0 && preset.layers.length <= 16));
  assert.deepEqual(
    catalog.presets.filter((preset) => preset.renderStatus === 'experimental').map((preset) => preset.id),
    ['arcane_multi_hit', 'jade_blade_storm'],
  );
});

test('uncatalogued Effekseer binaries remain discoverable and invalid recipes are diagnosed', () => {
  const catalog = buildEffekseerCatalog(
    ['Assets/Effects/custom.efkefc'],
    [{ path: 'Assets/Effects/Bad.meffect', revision: 'bad', contents: '{"version":2}' }],
  );
  assert.equal(catalog.effects[0].group, 'unclassified');
  assert.equal(catalog.effects[0].renderStatus, 'experimental');
  assert.match(catalog.diagnostics.join(' '), /version must be 1/);
});
