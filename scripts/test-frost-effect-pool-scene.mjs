// Author: MiYu. Verify source spell templates preserve existing scene identities, resources and hierarchy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const file='samples/frostbound-realms/Assets/Scenes/Main.mscene',baseline=process.argv[2]??'9c414e5',before=JSON.parse(execFileSync('git',['show',baseline+':'+file],{maxBuffer:256*1024*1024})).world.entities,raw=fs.readFileSync(file),after=JSON.parse(raw).world.entities;
const byName=new Map(after.map(e=>[e.name,e])),removed=[];
assert.equal(byName.size,after.length);
for(const e of before){const current=byName.get(e.name);if(current){if(e.name==='Corpse 0'){const expected=structuredClone(e);delete expected.components.MeshRenderer;assert.deepEqual(current,expected);}else assert.deepEqual(current,e,'retained node '+e.name);}else{const pool=/^Classic (spell|status|attachment) (\d+)(?: |$)/.exec(e.name);assert.ok(pool&&Number(pool[2])>0||/^Corpse /.test(e.name),'only duplicated effect/corpse slots removed: '+e.name);removed.push(e.name);}}
const originalNames=new Set(before.map(e=>e.name)),added=after.filter(e=>!originalNames.has(e.name));
assert.deepEqual(added.map(e=>e.name),['priestDispel','innerFire'].flatMap(slot=>['Classic spell 0 '+slot,...Array.from({length:6},(_,i)=>'Classic spell 0 '+slot+' mesh '+i)]));assert.equal(removed.length,0);for(const e of added)assert.equal(e.active,false);for(const slot of ['priestDispel','innerFire'])assert.equal(byName.get('Classic spell 0 '+slot).parent,byName.get('Classic spell 0 holyLight').parent);
assert.equal(before.length-after.length+added.length,removed.length);
function references(entities){const paths=new Set();function visit(value){if(typeof value==='string'&&value.startsWith('Assets/'))paths.add(value);else if(value&&typeof value==='object')for(const child of Object.values(value))visit(child);}for(const e of entities)visit(e.components);return [...paths].sort();}
const oldReferences=references(before),newReferences=references(after);const sourceSpellReferences=references(added.filter(e=>/^Classic spell 0 (priestDispel|innerFire)/.test(e.name)));assert.deepEqual(newReferences,[...new Set([...oldReferences,...sourceSpellReferences])].sort());
const ids=new Set(after.map(e=>e.entity));for(const e of after)if(e.parent!=null)assert.ok(ids.has(e.parent),'live retained parent '+e.name);
assert.equal(after.filter(e=>e.parent==null).length,before.filter(e=>e.parent==null).length);
console.log(JSON.stringify({author:'MiYu',passed:true,baseline,beforeEntities:before.length,afterEntities:after.length,removed:removed.length,reductionPercent:100*removed.length/before.length,resources:oldReferences.length,retainedNodesEqual:true,existingResourceReferencesPreserved:true,newSourceReferences:newReferences.filter(p=>!oldReferences.includes(p)).length,sceneSha256:createHash('sha256').update(raw).digest('hex')}));
