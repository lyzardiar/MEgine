// Author: MiYu. Prove lazy effect generation only removes duplicate slots and preserves authored identities and resources.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const file='samples/frostbound-realms/Assets/Scenes/Main.mscene',baseline=process.argv[2]??'b9f9001dcc373bef0c74d376441686cb734d813a';
const before=JSON.parse(execFileSync('git',['show',baseline+':'+file],{maxBuffer:128*1024*1024})).world.entities,raw=fs.readFileSync(file),after=JSON.parse(raw).world.entities,byName=new Map(after.map(e=>[e.name,e]));
assert.equal(byName.size,after.length);const removed=[];
const slot=/^Classic (Siphon|Healing Wave|Chain Lightning|Far Sight|Shockwave|Sentinel|Archmage missile) (\d+)(?: (?:mesh|part) \d+)?$/;
for(const e of before){const current=byName.get(e.name);if(current)assert.deepEqual(current,e,'retained node '+e.name);else{const matched=slot.exec(e.name);assert.ok(matched&&Number(matched[2])>0||/^Scene \/ Effects\/Classic (?:Siphon|Healing Wave|Chain Lightning|Far Sight|Shockwave|Sentinel|Archmage missile)\/Slots (?!0-31$)/.test(e.name),'only duplicate slots and their empty folders removed: '+e.name);removed.push(e);}}
assert.equal(before.length-after.length,removed.length);assert.equal(removed.length,902);
function references(entities){const paths=new Set();function visit(value){if(typeof value==='string'&&value.startsWith('Assets/'))paths.add(value);else if(value&&typeof value==='object')for(const child of Object.values(value))visit(child);}for(const e of entities)visit(e.components);return [...paths].sort();}
assert.deepEqual(references(after),references(before));const ids=new Set(after.map(e=>e.entity));for(const e of after)if(e.parent!=null)assert.ok(ids.has(e.parent),'retained parent '+e.name);
assert.deepEqual(after.filter(e=>e.parent==null).map(e=>e.entity),before.filter(e=>e.parent==null).map(e=>e.entity));
console.log(JSON.stringify({passed:true,baseline,before:before.length,after:after.length,removed:removed.length,resources:references(after).length,retainedNodesEqual:true,sceneSha256:createHash('sha256').update(raw).digest('hex')}));
