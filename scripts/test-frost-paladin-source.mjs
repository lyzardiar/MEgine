// Author: MiYu. Verify signed original Paladin rules, models, sampled effects and references.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=new URL('../samples/frostbound-realms/',import.meta.url),read=p=>fs.readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p)),sha=b=>createHash('sha256').update(b).digest('hex'),receipt=json('paladin-sources.json'),signed=new Set(receipt.files.map(f=>f.path)),r=json('paladin-rules.json');
for(const f of receipt.files){const raw=read(f.path);assert.equal(raw.length,f.bytes,f.path);assert.equal(sha(raw),f.sha256,f.path);}
for(const [p,h] of Object.entries(receipt.generators))assert.equal(sha(fs.readFileSync(new URL('../'+p,import.meta.url)).toString('utf8').replace(/\r\n/g,'\n')),h,p);
assert.deepEqual(r.abilities.AHhb.levels.map(x=>[x.heal,x.cost,x.cooldown,x.range]),[[200,65,5,8],[400,65,5,8],[600,65,5,8]]);
assert.deepEqual(r.abilities.AHds.levels.map(x=>[x.duration,x.cooldown,x.cost,x.canDeactivate]),[[15,35,25,false],[30,50,25,false],[45,65,25,false]]);
assert.deepEqual(r.abilities.AHad.levels.map(x=>[x.armor,x.percentage,x.radius]),[[1.5,false,9],[3,false,9],[4.5,false,9]]);assert.equal(r.abilities.AHre.levels.length,1);assert.deepEqual([r.abilities.AHre.levels[0].count,r.abilities.AHre.levels[0].cost,r.abilities.AHre.levels[0].cooldown,r.abilities.AHre.levels[0].invulnerable],[6,200,240,false]);assert.equal(r.classifications.hfoo.deathType,3);assert.equal(r.classifications.Hpal.deathType,2);assert.equal(r.classifications.ewsp.deathType,0);assert.equal(r.classifications.ugho.race,'undead');
const models=json('paladin-models.json'),art=json('paladin-art.json'),views=json('paladin-portraits.json');assert.equal(Object.keys(models).length,8);assert.equal(Object.keys(art).length,6);assert.deepEqual(Object.keys(views),['ClassicPaladinPortrait']);
for(const [key,m] of Object.entries(models)){assert.ok(m.parts.length,key);assert.ok(m.bounds.min.every(Number.isFinite));assert.ok(m.bounds.max.every(Number.isFinite));assert.equal(m.boundsSource,'nativeFirstVisible');for(const p of m.parts){assert.ok(signed.has(p.mesh));assert.ok(signed.has(p.material));assert.equal(p.states.length,m.animations.length);}}
for(const f of receipt.files.filter(f=>f.path.endsWith('.mmat'))){const m=json(f.path);for(const k of ['base_color_texture','normal_texture','metallic_roughness_texture','occlusion_texture','emissive_texture'])if(m[k])assert.ok(signed.has(m[k]),f.path+' -> '+m[k]);}
for(const [name,a] of Object.entries(art)){assert.ok(signed.has(a.effect));const e=json(a.effect);for(const m of e.materials)assert.ok(signed.has(m.texture),name);assert.equal(a.animations.length,e.clips.length);}
for(const a of Object.values(r.abilities))for(const p of [a.icon,a.disabledIcon,a.researchIcon])assert.ok(signed.has(p),p);assert.equal(r.originalRuntimeVerified,false);
console.log('PASS original Paladin source: '+receipt.files.length+' signed outputs, eight geometry bindings, six sampled effects, source icons and four ranked abilities');
