// Author: MiYu. Signed source assets and real native poses for the original Mountain King.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('../',import.meta.url)),root=path.join(repo,'samples/frostbound-realms'),read=p=>fs.readFileSync(path.join(root,p)),json=p=>JSON.parse(read(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const receipt=json('mountain-king-sources.json'),signed=new Set(receipt.files.map(f=>f.path)),models=json('mountain-king-models.json'),effects=json('mountain-king-art.json'),rules=json('mountain-king-rules.json'),views=json('mountain-king-portraits.json');
for(const f of receipt.files){const raw=read(f.path);assert.equal(raw.length,f.bytes,f.path);assert.equal(sha(raw),f.sha256,f.path);}
for(const [p,h] of Object.entries(receipt.generators))assert.equal(sha(fs.readFileSync(path.join(repo,p)).toString('utf8').replace(/\r\n/g,'\n')),h,p);
assert.deepEqual(rules.abilities.AHtb.levels.map(r=>[r.damage,r.cost,r.cooldown,r.duration,r.heroDuration,r.range]),[[100,75,9,5,3,6],[225,75,9,5,3,6],[350,75,9,5,3,6]]);
assert.deepEqual(rules.abilities.AHtc.levels.map(r=>[r.damage,r.radius,r.moveReduction,r.attackReduction]),[[60,2.5,.5,.5],[100,3,.5,.5],[140,3.5,.5,.5]]);
assert.deepEqual(rules.abilities.AHbh.levels.map(r=>[r.chance,r.bonusDamage,r.duration,r.heroDuration]),[[.2,25,2,1],[.3,25,2,1],[.4,25,2,1]]);
assert.equal(rules.abilities.AHav.levels.length,1);const avatar=rules.abilities.AHav.levels[0];assert.deepEqual([avatar.armorBonus,avatar.healthBonus,avatar.damageBonus,avatar.duration,avatar.cost,avatar.cooldown,avatar.magicImmune,avatar.canDeactivate],[5,500,20,60,150,180,true,false]);
assert.deepEqual(rules.skillBuilds.first,[0,2,0,1,0,3,2,2,1,1]);assert.equal(rules.originalRuntimeVerified,false);assert.match(rules.buffs.BPSE.sourceFunc.Targetart,/ThunderclapTarget/);assert.match(rules.buffs.BHtc.sourceFunc.Targetart,/StasisTotemTarget/);
assert.equal(Object.keys(models).length,7);assert.equal(Object.keys(effects).length,5);assert.ok(views.ClassicMountainKingPortrait.view.camera);assert.ok(models.ClassicMountainKing.animations.some(a=>a.name==='Alternate Spell Throw'));assert.ok(models.ClassicMountainKingPortrait.animations.some(a=>a.name==='Portrait Alternate'));
for(const [name,m] of Object.entries(models))for(const p of m.parts){assert.ok(signed.has(p.mesh),name);assert.ok(signed.has(p.material),name);assert.equal(p.states.length,m.animations.length);}
for(const f of receipt.files.filter(f=>f.path.endsWith('.mmat'))){const m=json(f.path);for(const k of ['base_color_texture','normal_texture','metallic_roughness_texture','occlusion_texture','emissive_texture'])if(m[k])assert.ok(signed.has(m[k]),f.path+' -> '+m[k]);}
for(const effect of Object.values(effects)){assert.ok(signed.has(effect.effect));for(const material of json(effect.effect).materials)assert.ok(signed.has(material.texture));}
const thunder=models.ClassicMountainKingThunderClapCaster.parts[0],raw=read(thunder.mesh),doc=JSON.parse(raw.subarray(20,20+raw.readUInt32LE(12))),sequence=doc.extras.mengineMdxAnimation.sequences[0];assert.deepEqual([sequence.start,sequence.end],[-400,400]);
const references=[];for(const m of Object.values(models))for(const p of m.parts)for(const [clip,a] of m.animations.entries()){const last=Math.ceil(a.duration*30);for(const frame of new Set([0,Math.floor(last/2),last]))references.push(path.join(root,p.mesh)+`#pose=${clip}:${frame}@30`);}
const probe=process.env.MENGINE_GLTF_PROBE||'D:/MEngineNativeQA/attachment-build/release/examples/gltf_bounds.exe',output=execFileSync(probe,['--stdin'],{input:references.join('\n')+'\n',maxBuffer:16*1024*1024,windowsHide:true}).toString('utf8').trim().split(/\r?\n/).map(JSON.parse);assert.equal(output.length,references.length);
for(const box of output){assert.ok(box.vertices>0);assert.ok(box.min.every(Number.isFinite)&&box.max.every(Number.isFinite));}
console.log(`PASS original Mountain King assets: ${receipt.files.length} signed outputs, seven geometry bindings, five source effects, exact rules and ${output.length} native poses including signed sequence and Alternate forms`);
