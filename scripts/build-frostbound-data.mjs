// Author: MiYu. Extract large data catalogs into separate JSON files for runtime loading.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../samples/frostbound-realms/', import.meta.url));
const outputRoot = process.env.MENGINE_FROST_BUILD_OUTPUT ? path.resolve(process.env.MENGINE_FROST_BUILD_OUTPUT) : root;
const dataDir = path.join(outputRoot, 'Assets/Data');

fs.mkdirSync(dataDir, {recursive: true});

console.log('Building Frostbound data catalogs...');

// Model catalog - 合并所有模型数据
const mountainKingCatalog = JSON.parse(fs.readFileSync(path.join(root, 'mountain-king-models.json'), 'utf8'));
const shadowhunterMissiles = JSON.parse(fs.readFileSync(path.join(root, 'shadowhunter-effect-models.json'), 'utf8'));

const modelCatalog = {
  ...JSON.parse(fs.readFileSync(path.join(root, 'crypt-web-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'crypt-unit-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'skeleton-rule-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'source-caster-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'lumber-depot-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'human-sorceress-models.json'), 'utf8')),
  ClassicMortarMissile: JSON.parse(fs.readFileSync(path.join(root, 'human-mortar-effect-models.json'), 'utf8')).MortarMissile,
  ...JSON.parse(fs.readFileSync(path.join(root, 'human-army-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'crypt-lord-effect-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'dreadlord-effect-models.json'), 'utf8')),
  ClassicLichMissile: JSON.parse(fs.readFileSync(path.join(root, 'lich-effect-models.json'), 'utf8')).LichMissile,
  ClassicDeathCoilMissile: JSON.parse(fs.readFileSync(path.join(root, 'death-knight-effect-models.json'), 'utf8')).DeathCoilMissile,
  ...JSON.parse(fs.readFileSync(path.join(root, 'undead-hero-models.json'), 'utf8')),
  ClassicShadowHunterMissile: shadowhunterMissiles.ShadowHunterMissile,
  ClassicSerpentWardMissile: shadowhunterMissiles.SerpentWardMissile,
  ...JSON.parse(fs.readFileSync(path.join(root, 'shadowhunter-models.json'), 'utf8')),
  ClassicFarSeerMissile: JSON.parse(fs.readFileSync(path.join(root, 'farseer-effect-models.json'), 'utf8')).FarseerMissile,
  ...JSON.parse(fs.readFileSync(path.join(root, 'farseer-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'orc-hero-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'blood-mage-models.json'), 'utf8')),
  ...mountainKingCatalog,
  ...JSON.parse(fs.readFileSync(path.join(root, 'paladin-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'archmage-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'warden-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'priestess-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'keeper-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'demon-hunter-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'mountain-giant-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'faerie-dragon-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'chimaera-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(process.env.MENGINE_FROST_MODEL_CATALOG || path.join(root, 'model-catalog.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'druid-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'moba-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'dryad-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'hippogryph-models.json'), 'utf8')),
  ...JSON.parse(fs.readFileSync(path.join(root, 'human-sanctum-models.json'), 'utf8'))
};

fs.writeFileSync(path.join(dataDir, 'model-catalog.json'), JSON.stringify(modelCatalog));
console.log(`  - model-catalog.json: ${Object.keys(modelCatalog).length} models`);

// Effect catalog - 合并所有特效数据
const effects = JSON.parse(fs.readFileSync(path.join(root, 'effect-catalog.json'), 'utf8'));
effects.effects.ClassicCryptWebAirTarget = {...modelCatalog.ClassicCryptWebAirTarget, clip: 0};
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'lich-effects.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'death-knight-effects.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'crypt-lord-effects.json'), 'utf8')));

for (const [key, art] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'dreadlord-effects.json'), 'utf8')))) {
  effects.effects[key] ??= art;
}

Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'blood-mage-art.json'), 'utf8')));
Object.assign(effects.effects,
  JSON.parse(fs.readFileSync(path.join(root, 'blademaster-effects.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'farseer-effects.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'tauren-effects.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'shadowhunter-effects.json'), 'utf8'))
);

Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'warden-art.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'mountain-giant-art.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'demon-hunter-art.json'), 'utf8')));
Object.assign(effects.effects,
  JSON.parse(fs.readFileSync(path.join(root, 'keeper-art.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'priestess-art.json'), 'utf8'))
);

Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'faerie-dragon-art.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'druid-spell-art.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'slow-poison-art.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'human-mortar-effects.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'human-sanctum-effects.json'), 'utf8')));
Object.assign(effects.effects, JSON.parse(fs.readFileSync(path.join(root, 'human-sentry-effects.json'), 'utf8')));
Object.assign(effects.effects,
  JSON.parse(fs.readFileSync(path.join(root, 'human-priest-effects.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'human-sorceress-effects.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'human-spellbreaker-effects.json'), 'utf8'))
);

Object.assign(effects.effects,
  JSON.parse(fs.readFileSync(path.join(root, 'mountain-king-art.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'archmage-art.json'), 'utf8')),
  JSON.parse(fs.readFileSync(path.join(root, 'paladin-art.json'), 'utf8'))
);

fs.writeFileSync(path.join(dataDir, 'effect-catalog.json'), JSON.stringify(effects));
console.log(`  - effect-catalog.json: ${Object.keys(effects.effects).length} effects`);

// Detonation catalog
const detonation = JSON.parse(fs.readFileSync(path.join(root, 'detonate-catalog.json'), 'utf8'));
detonation.effects['dryad-dispel'] = JSON.parse(fs.readFileSync(path.join(root, 'dryad-spell-art.json'), 'utf8')).DispelMagicTarget;
detonation.effects['mana-flare-missile'] = JSON.parse(fs.readFileSync(path.join(root, 'faerie-dragon-art.json'), 'utf8')).ManaFlareMissile;

for (const [key, name] of [['mortar', 'MortarMissile'], ['lich', 'LichMissile'], ['shadowhunter', 'ShadowHunterMissile'], ['serpentward', 'SerpentWardMissile']]) {
  const art = effects.effects[name];
  const clip = art.animations.findIndex(a => /^death$/i.test(a.name));
  if (clip < 0) throw Error('Missing source ' + name + ' Death clip');
  detonation.effects[key] = {...art, clip, duration: art.animations[clip].duration, sourceXAxis: true};
}

const phoenixFireDeath = effects.effects.Phoenix_Missile_mini;
const phoenixFireDeathClip = phoenixFireDeath.animations.findIndex(a => a.name === 'Death');
if (phoenixFireDeathClip < 0) throw Error('Missing source Phoenix Fire Death clip');
detonation.effects['phoenix-fire'] = {
  ...phoenixFireDeath,
  clip: phoenixFireDeathClip,
  duration: phoenixFireDeath.animations[phoenixFireDeathClip].duration,
  sourceXAxis: true
};

for (const [key, name] of [['dark-ritual', 'DarkRitualTarget'], ['death-pact', 'DeathPactTarget'], ['animate-dead-expire', 'UndeadLargeDeathExplode']]) {
  const art = effects.effects[name];
  const clip = art.animations.findIndex(a => /^birth$/i.test(a.name));
  detonation.effects[key] = {...art, clip: clip < 0 ? 0 : clip, duration: art.animations[clip < 0 ? 0 : clip].duration};
}

detonation.effects['archmage-blizzard'] = {
  ...effects.effects.BlizzardTarget,
  clip: 0,
  duration: effects.effects.BlizzardTarget.animations[0].duration
};

const flareArt = effects.effects.FlareCaster;
detonation.effects['mortar-flare'] = {
  ...flareArt,
  clip: 0,
  duration: flareArt.animations[0].duration,
  sourceXAxis: true
};

fs.writeFileSync(path.join(dataDir, 'detonation-catalog.json'), JSON.stringify(detonation));
console.log(`  - detonation-catalog.json: ${Object.keys(detonation.effects).length} detonation effects`);

// Portrait catalog
const cryptLordPortraits = JSON.parse(fs.readFileSync(path.join(root, 'crypt-lord-portraits.json'), 'utf8'));
const portraitViews = Object.fromEntries(
  JSON.parse(fs.readFileSync(path.join(root, 'head-portraits.json'), 'utf8')).views.map(v => [v.key, v])
);

for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'demon-hunter-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'mountain-king-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'undead-hero-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'dreadlord-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'paladin-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'blood-mage-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'orc-hero-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'farseer-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'archmage-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'warden-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'keeper-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'priestess-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'hippogryph-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'chimaera-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'mountain-giant-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'faerie-dragon-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(JSON.parse(fs.readFileSync(path.join(root, 'crypt-unit-portraits.json'), 'utf8')))) portraitViews[key] = r.view;
for (const [key, r] of Object.entries(cryptLordPortraits)) portraitViews[key] = r.view;
portraitViews.ClassicDryadPortrait = JSON.parse(fs.readFileSync(path.join(root, 'dryad-portrait.json'), 'utf8')).view;

fs.writeFileSync(path.join(dataDir, 'portrait-catalog.json'), JSON.stringify(portraitViews));
console.log(`  - portrait-catalog.json: ${Object.keys(portraitViews).length} portraits`);

// Other catalogs
const buildingScales = JSON.parse(fs.readFileSync(path.join(root, 'building-scale-catalog.json'), 'utf8'));
fs.writeFileSync(path.join(dataDir, 'building-scales.json'), JSON.stringify(buildingScales));

const unitScales = JSON.parse(fs.readFileSync(path.join(root, 'unit-scale-catalog.json'), 'utf8'));
fs.writeFileSync(path.join(dataDir, 'unit-scales.json'), JSON.stringify(unitScales));

const sentinel = JSON.parse(fs.readFileSync(path.join(root, 'sentinel-catalog.json'), 'utf8'));
fs.writeFileSync(path.join(dataDir, 'sentinel-catalog.json'), JSON.stringify(sentinel));

const construction = JSON.parse(fs.readFileSync(path.join(root, 'construction-catalog.json'), 'utf8'));
construction.slots = Math.max(1, ...Object.values(construction.owners).map(a => a.length));
fs.writeFileSync(path.join(dataDir, 'construction-catalog.json'), JSON.stringify(construction));

console.log('Frostbound data catalogs built successfully.');
