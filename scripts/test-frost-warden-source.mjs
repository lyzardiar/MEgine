// Author: MiYu. Verify signed Warden outputs, canonical references and original rule bindings.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),sample=path.join(root,'samples/frostbound-realms'),read=p=>fs.readFileSync(path.join(sample,p)),json=p=>JSON.parse(read(p)),sha=raw=>createHash('sha256').update(raw).digest('hex');
const receipt=json('warden-sources.json'),paths=new Set(receipt.files.map(r=>r.path));
assert.equal(paths.size,receipt.files.length);assert.equal(new Set([...paths].map(p=>p.toLowerCase())).size,paths.size);
for(const r of receipt.files){const raw=read(r.path);assert.equal(raw.length,r.bytes,r.path);assert.equal(sha(raw),r.sha256,r.path);}
for(const [name,hash] of Object.entries(receipt.generators))assert.equal(sha(fs.readFileSync(path.join(root,name)).toString('utf8').replace(/\r\n/g,'\n')),hash,name);
for(const r of receipt.sources){const raw=read('SourceAssets/WarcraftIII/'+r.path.replace(/\\/g,'/'));assert.equal(raw.length,r.bytes,r.path);assert.equal(sha(raw),r.sha256,r.path);}
function references(v){
 if(typeof v==='string'&&v.startsWith('Assets/Warden/'))assert.ok(paths.has(v),v);
 else if(Array.isArray(v))v.forEach(references);
 else if(v&&typeof v==='object')Object.values(v).forEach(references);
}
const models=json('warden-models.json');references(models);
for(const p of paths)if(p.endsWith('.mmat'))references(json(p));
for(const key of ['ClassicWarden','ClassicWardenPortrait','ClassicVengeanceAvatar','ClassicVengeanceAvatarPortrait','ClassicVengeanceSpirit','ClassicVengeanceSpiritPortrait'])assert.ok(models[key].parts.length>0,key);
for(const key of ['BlinkCaster','BlinkTarget']){const m=models['ClassicWarden'+key];assert.equal(m.boundsSource,'nativeVisiblePose');assert.ok(m.boundsPose.frame>0,'preserve transparent initial frames and measure a visible source pose');assert.ok(m.parts.some(p=>p.states.some(clip=>clip.some(state=>state[4]===0))),'transparent source state remains present');}
for(let i=1;i<=6;i++)assert.ok(models['ClassicWardenSpiritOfVengeanceOrbs'+i].parts.length>0);
const rules=json('warden-rules.json'),hero=rules.units.Ewar;
assert.equal(hero.primary,'AGI');assert.equal(hero.baseHp,100);assert.equal(hero.strength,18);assert.equal(hero.agility,20);assert.equal(hero.intelligence,15);assert.equal(hero.baseMana,0);assert.equal(hero.initialMana,100);
assert.equal(rules.units.espv.magicImmune,true);assert.equal(rules.units.even.invulnerable,true);assert.equal(rules.units.even.magicImmune,false);
assert.deepEqual(rules.abilities.AEbl.levels.map(r=>r.cost),[50,10,10]);assert.deepEqual(rules.abilities.AEbl.levels.map(r=>r.cooldown),[10,10,1]);
assert.deepEqual(rules.abilities.AEfk.levels.map(r=>r.interval),[300,625,950]);assert.deepEqual(rules.abilities.AEsh.levels.map(r=>r.duration),[15.1,15.1,15.1]);assert.equal(rules.abilities.AEsv.levels[0].unit,'espv');
assert.deepEqual(rules.skillBuilds.first,[1,2,1,0,1,3,2,0,2,0]);assert.equal(rules.originalRuntimeVerified,false);assert.ok(rules.unverified.length>=5);
console.log(`PASS Warden source: ${paths.size} signed outputs, ${receipt.sources.length} original sources, ${Object.keys(receipt.generators).length} generators, canonical paths, transparent Blink poses and source rules`);
