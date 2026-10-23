// Author: MiYu. Focused callback smoke and deferred generated-project integrity checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const client=fs.readFileSync(new URL('./frost-original-doodads-client.js',import.meta.url),'utf8');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
function callbackSmoke(){
  function start(missing=false){
    const commands=[],requests=[];
    const context=vm.createContext({engine:{findEntitiesByName(names){requests.push(names);return missing?[]:names.map((name,i)=>({name,entity:1000+i}));},pushCommandJson(raw){commands.push(JSON.parse(raw));}}});
    const group={mesh:'mesh.glb',clip:0,frames:3,duration:.25,loop:true,moving:true,names:['a','b'],states:[{material:'a.mmat',color:[1,1,1,1]},{material:'b.mmat',color:[.5,1,1,0]},{material:'b.mmat',color:[.5,1,1,0]}]};
    vm.runInContext('var calls=0;function onTick(dt){calls++;}\nvar originalDoodadGroups='+JSON.stringify([group])+';\n'+client,context);
    return {context,commands,requests};
  }
  const {context,commands,requests}=start();
  context.onTick(0);assert.equal(context.calls,1,'The terrain callback runs exactly once without recursion');assert.equal(commands.length,0);
  context.onTick(.09);assert.equal(commands.length,6);assert.deepEqual([...new Set(commands.map(c=>c.entity))],[1000,1001]);
  assert.equal(commands.find(c=>c.component==='MeshRenderer').value.mesh,'mesh.glb#pose=0:1');
  assert.equal(commands.filter(c=>c.op==='setActive').length,2);assert.ok(commands.filter(c=>c.op==='setActive').every(c=>c.active===false));
  context.onTick(0);context.onTick(.001);assert.equal(commands.length,6,'Paused and unchanged sampled frames publish nothing');
  context.onTick(.08);assert.equal(commands.length,8,'Only the pose changes at frame 2');
  context.onTick(.09);assert.equal(commands.length,14,'Loop restores mesh, material, color and visibility');assert.equal(requests.length,1);
  const fresh=start();fresh.context.onTick(0);assert.equal(fresh.commands.length,0,'Fresh script context starts from the authored frame');
  assert.throws(()=>start(true).context.onTick(0),/Missing runtime doodad part/);
  console.log('PASS doodad callback smoke: original callback, runtime IDs, frame deduplication, pause, loop and fresh context');
}

function projectIntegrity(directory){
  const root=path.resolve(directory),read=relative=>fs.readFileSync(path.join(root,relative)),json=relative=>JSON.parse(read(relative));
  const receipt=json('doodad-scene-sources.json'),placements=json('doodad-placements.json'),scene=json('Assets/Scenes/Main.mscene'),terrain=json('terrain-sources.json');
  for(const file of receipt.generatedFiles){const bytes=read(file.path);assert.equal(bytes.length,file.bytes,file.path);assert.equal(digest(bytes),file.sha256,file.path);}
  for(const file of receipt.sources)assert.equal(digest(read('SourceAssets/'+file.path)),file.sha256,file.path);
  const entities=scene.world.entities,byName=new Map(entities.map(e=>[e.name,e])),byId=new Map(entities.map(e=>[e.entity,e]));
  assert.equal(entities.length,receipt.entities);assert.equal(byId.size,entities.length);assert.equal(byName.size,entities.length);assert.equal(placements.length,receipt.placements);
  const source=JSON.parse(fs.readFileSync(path.join(terrain.sourceExport,'map.json'),'utf8'));
  assert.equal(receipt.mapSha256,source.source.sha256);assert.deepEqual(placements.map(p=>p.source),source.doodads.doodads);
  for(const placement of placements){
    const entity=byName.get(placement.name),d=placement.source,t=entity.components.Transform;
    assert.deepEqual(t.position,[d.location[0]/128,d.location[2]/128,-d.location[1]/128]);assert.deepEqual(t.scale,[d.scale[0],d.scale[2],d.scale[1]]);
    assert.ok(t.rotation.every((v,i)=>Math.abs(v-[0,Math.sin(d.angle/2),0,Math.cos(d.angle/2)][i])<1e-12));assert.equal(entity.active,Boolean(d.flags&2));
    for(const name of placement.parts)assert.equal(byName.get(name).parent,entity.entity,name);
    assert.ok(placement.parts.length||byName.has(placement.name+'-effect'),'Every source placement has a native representation');
  }
  for(const entity of entities){
    if(entity.parent!==undefined)assert.ok(byId.has(entity.parent),entity.name);
    const mesh=entity.components.MeshRenderer,effect=entity.components.SampledEffect;
    if(mesh){assert.ok(read(mesh.mesh.split('#')[0]).length);const material=json(mesh.material);for(const [field,value] of Object.entries(material))if(field.endsWith('_texture')&&value)assert.ok(read(value).length);}
    if(effect){const sampled=json(effect.effect);assert.ok(sampled.clips[effect.clip]);for(const mat of sampled.materials)assert.ok(read(mat.texture).length);}
  }
  console.log('PASS generated doodad project integrity',root,placements.length,'placements',entities.length,'entities');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const index=process.argv.indexOf('--project');
  if(!process.argv.includes('--callback-smoke')&&index<0)throw new Error('Use --callback-smoke or --project <generated-project>');
  callbackSmoke();if(index>=0){assert.ok(process.argv[index+1]);projectIntegrity(process.argv[index+1]);}
}
