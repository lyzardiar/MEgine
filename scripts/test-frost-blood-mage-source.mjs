// Author: MiYu. Verify original Blood Mage source rules, signed references and native model poses.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'samples/frostbound-realms'),read=p=>fs.readFileSync(path.join(root,p)),json=p=>JSON.parse(read(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const receipt=json('blood-mage-sources.json'),signed=new Set(receipt.files.map(f=>f.path)),models=json('blood-mage-models.json'),effects=json('blood-mage-art.json'),rules=json('blood-mage-rules.json'),views=json('blood-mage-portraits.json');
for(const f of receipt.files){const raw=read(f.path);assert.equal(raw.length,f.bytes,f.path);assert.equal(sha(raw),f.sha256,f.path);}
for(const [p,h] of Object.entries(receipt.generators))assert.equal(sha(fs.readFileSync(path.join(repo,p)).toString('utf8').replace(/\r\n/g,'\n')),h,p);
for(const s of receipt.sources){const raw=read('SourceAssets/WarcraftIII/'+s.path);assert.equal(raw.length,s.bytes,s.path);assert.equal(sha(raw),s.sha256,s.path);}
assert.deepEqual(Object.keys(rules.units),['Hblm','hphx','hpxe']);assert.equal(rules.originalRuntimeVerified,false);
const hero=rules.units.Hblm;assert.deepEqual([hero.baseHp+hero.strength*Number(rules.misc.StrHitPointBonus),hero.baseMana+hero.intelligence*Number(rules.misc.IntManaBonus),hero.baseArmor+hero.agility*Number(rules.misc.AgiDefenseBonus)+Number(rules.misc.AgiDefenseBase)],[550,285,2.2]);
assert.equal(hero.sourceStrings.Name,'血魔法师');assert.equal(rules.units.hphx.sourceStrings.Name,'火凤凰');assert.equal(rules.units.hpxe.sourceStrings.Name,'凤凰蛋');
assert.deepEqual(['AHfs','AHbn','AHdr','AHpx'].map(k=>rules.abilities[k].levels.length),[3,3,3,1]);
const a=rules.abilities;
assert.deepEqual(a.AHfs.levels.map(l=>[l.fullTickDamage,l.fullTickInterval,l.residualTickDamage,l.residualTickInterval,l.cost,l.cooldown,l.radius,l.castTime,l.duration,l.heroDuration]),[[15,.33,4,1,135,10,2,1.33,9,2.67],[26.666,.33,6,1,135,10,2,1.33,9,2.67],[36.666,.33,8,1,135,10,2,1.33,9,2.67]]);
assert.deepEqual(a.AHbn.levels.map(l=>[l.moveReduction,l.attackReduction,l.duration,l.heroDuration,l.cost,l.cooldown,l.range]),[[.5,0,12,4,75,0,8],[.5,0,15,5,60,0,8],[.5,0,18,6,50,0,8]]);
assert.deepEqual(a.AHdr.levels.map(l=>[l.manaDrain,l.manaTransfer,l.interval,l.duration,l.cost,l.cooldown,l.range,l.radius,l.manaBonusFactor,l.manaBonusDecay]),[[15,30,1,6,10,6,6,8,1,3],[30,60,1,6,10,6,6,8,1,3],[45,90,1,6,10,6,6,8,1,3]]);
assert.equal(rules.misc.DrainUsesEtheralBonus,'0');assert.equal(a.AHpx.levels[0].unit,'hphx');
assert.deepEqual([a.Aphx.levels[0].normalUnit,a.Aphx.levels[0].alternateUnit,a.Aphx.levels[0].flags,a.Aphx.levels[0].heroDuration],['hphx','hpxe',7,10]);
assert.deepEqual([rules.units.hphx.baseHp,rules.units.hphx.healthRegen,rules.units.hphx.speed,rules.units.hphx.weapon.attack,rules.units.hphx.weapon.cooldown],[1250,-25,3.2,'magic',1.4]);
assert.deepEqual([rules.units.hpxe.baseHp,rules.units.hpxe.healthRegen,rules.units.hpxe.weapon.enabled,rules.units.hpxe.model,rules.units.hpxe.alternate],[200,0,false,'ClassicPhoenix',true]);
for(const key of ['ACmi','ACrk']){assert.ok(a[key].sourceStrings.Name,key);assert.ok(a[key].sourceStrings.Ubertip,key);assert.ok(signed.has(a[key].icon),key);assert.ok(signed.has(a[key].disabledIcon),key);}
for(const build of Object.values(rules.skillBuilds))assert.deepEqual(build,[0,2,0,2,0,3,2,1,1,1]);
for(const key of a.AHdr.sourceRow.BuffID1.split(',')){assert.ok(rules.buffs[key],key);assert.ok(rules.buffs[key].sourceFunc,key);}
for(const key of ['Bdbb','Bdbl','Bdbm']){assert.equal(rules.buffs[key].sourceRow,null);assert.ok(signed.has(rules.buffs[key].icon));}
assert.match(rules.buffs.Bdcm.sourceFunc.Targetart,/ManaDrainCaster/);assert.match(rules.buffs.Bdtm.sourceFunc.Targetart,/ManaDrainTarget/);
assert.deepEqual(Object.keys(rules.lightning),['DRAB','DRAL','DRAM']);
for(const l of Object.values(rules.lightning)){assert.ok(signed.has(l.texture));const png=read(l.texture);assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),64);}
assert.equal(Object.keys(models).length,12);assert.equal(Object.keys(effects).length,16);
assert.ok(models.ClassicBloodMage.animations.some(a=>a.name==='Spell Channel'));assert.ok(models.ClassicPhoenix.animations.some(a=>a.name==='Stand Alternate'));
for(const key of ['ClassicBloodMagePortrait','ClassicPhoenixPortrait','ClassicPhoenixEggPortrait']){assert.ok(views[key].view.camera,key);assert.ok(views[key].sourceSha256);}
for(const [name,m] of Object.entries(models))for(const p of m.parts){assert.ok(signed.has(p.mesh),name);assert.ok(signed.has(p.material),name);assert.equal(p.states.length,m.animations.length);for(const mat of Object.values(p.teamMaterials||{}))assert.ok(signed.has(mat));for(const mat of Object.values(p.textureMaterials||{}))assert.ok(signed.has(mat));}
for(const f of receipt.files.filter(f=>f.path.endsWith('.mmat'))){const m=json(f.path);for(const k of ['base_color_texture','normal_texture','metallic_roughness_texture','occlusion_texture','emissive_texture'])if(m[k])assert.ok(signed.has(m[k]),f.path+' -> '+m[k]);}
for(const [key,effect] of Object.entries(effects)){assert.ok(signed.has(effect.effect),key);const data=json(effect.effect);for(const m of data.materials)assert.ok(signed.has(m.texture),key+' -> '+m.texture);assert.deepEqual(data.clips.map(c=>c.name),effect.animations.map(c=>c.name),key);}
assert.equal(effects.BanishTarget.parts.length,0);assert.equal(effects.ManaDrainCaster.parts.length,0);assert.equal(effects.ManaDrainTarget.parts.length,0);assert.equal(effects.ClassicBloodMageEmbedded.embedded,true);assert.equal(effects.ClassicPhoenixEmbedded.embedded,true);
export {models,root,receipt};
console.log(`PASS original Blood Mage source: ${receipt.files.length} signed files, 12 bindings, 16 effects and exact effective source rules`);
