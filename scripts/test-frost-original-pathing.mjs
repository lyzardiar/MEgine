// Author: MiYu. Verify original WPM bytes, engine coordinates, native masks and isolated runtime edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const P=createRequire(import.meta.url)('../samples/frostbound-realms/game/warcraft-pathing.js');
const base={schema:'mengine.warcraft-pathing',version:1,sourceSha256:'0'.repeat(64),size:[3,2],origin:[-96,64],cellWorldSize:32,runs:[1,0,1,2,1,255,1,4,1,8,1,128]};
const grid=P.create(base);
for(let y=0;y<2;y++)for(let x=0;x<3;x++){
  const center=grid.cellCenter(x,y);assert.deepEqual(grid.engineCell(...center),[x,y]);assert.equal(grid.getEngine(...center),grid.getCell(x,y));
}
assert.deepEqual(grid.engineCell(-.75,-.5),[0,0]);assert.equal(grid.getEngine(0,-.5),null);assert.equal(grid.getEngine(-.75,-1),null);
assert.equal(grid.getEngine(-.750001,-.5),null);assert.equal(grid.getEngine(-.75,-.499999),null);
assert.equal(grid.getSource(-96,64),0);assert.equal(grid.getSource(0,64),null);assert.equal(grid.baseBlocked(-.5,-.5,1),true);
assert.equal(grid.setEngine(-.5,-.5,1,true),true);assert.equal(grid.getEngine(-.5,-.5),0);assert.equal(grid.revision,1);
grid.setEngine(-.5,-.5,1,true);assert.equal(grid.revision,1);assert.equal(grid.setEngine(0,0,1,false),false);
assert.deepEqual(P.create(grid.snapshot()).snapshot(),grid.snapshot());assert.equal(P.create(base).getCell(1,0),2,'Source data stays unchanged');
const restored=P.create(grid.snapshot());restored.setCell(0,0,0,false);assert.equal(restored.getCell(0,0),255);assert.equal(grid.getCell(0,0),0,'Runtime instances are isolated');
const native=JSON.parse(fs.readFileSync('tmp/docs-artifacts/frost-original-maps/pathing-evidence/cpu.json','utf8'));
for(const [type,mask] of native.masks)assert.equal(P.typeMask(type),mask);
let mutations=0;
for(let before=0;before<256;before++)for(const type of [0,1,2,3,4,5,6,7,8])for(const pathable of [false,true]){
  const map=P.create({...base,size:[1,1],runs:[1,before]}),mask=P.typeMask(type);
  map.setCell(0,0,type,pathable);assert.equal(map.getCell(0,0),pathable?before&~mask:before|mask);mutations++;
}
assert.equal(mutations,native.writes);
for(const bad of [{size:[0,2]},{size:Array(2)},{size:[4097,4096]},{origin:[NaN,0]},{origin:Array(2)},{runs:[1]},{runs:[5,0]},{runs:[7,0]},{runs:[0,0]},{runs:[6,256]}])assert.throws(()=>P.create({...base,...bad}));
assert.throws(()=>grid.getEngine(NaN,0));assert.throws(()=>grid.setCell(0,0,1,1));assert.throws(()=>P.typeMask(1.5));
console.log('PASS rectangular coordinates, half-open edges, native masks, '+mutations+' flag edits, revision, snapshots and invalid input');

for(const project of process.argv.slice(2)){
  const root=path.resolve(project),receipt=JSON.parse(fs.readFileSync(path.join(root,'pathing-sources.json'),'utf8'));
  const terrain=JSON.parse(fs.readFileSync(path.join(root,'terrain-sources.json'),'utf8'));
  const exported=JSON.parse(fs.readFileSync(path.join(terrain.sourceExport,'map.json'),'utf8'));
  const raw=fs.readFileSync(path.join(terrain.sourceExport,exported.source.members['war3map.wpm'].preservedFile));
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),context);
  const runtime=context.originalMapPathing;assert.ok(runtime);assert.equal(runtime.sourceSha256,terrain.mapSha256);
  assert.equal(runtime.size[0],raw.readInt32LE(8));assert.equal(runtime.size[1],raw.readInt32LE(12));
  for(let y=0;y<runtime.size[1];y++)for(let x=0;x<runtime.size[0];x++){
    const actual=runtime.getEngine((exported.terrain.origin[0]+x*32+16)/128,-(exported.terrain.origin[1]+y*32+16)/128);
    assert.equal(actual,raw[16+y*runtime.size[0]+x]);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.snapshot())),JSON.parse(fs.readFileSync(path.join(root,receipt.asset),'utf8')));
  const before=runtime.getCell(0,0);runtime.setCell(0,0,0,before!==0);assert.equal(runtime.revision,1);
  const fresh=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'Assets/Scripts/Main.js'),'utf8'),fresh);assert.equal(fresh.originalMapPathing.getCell(0,0),before);
  console.log(JSON.stringify({project,cells:receipt.cells,size:receipt.size,encodedBytes:receipt.encodedBytes,scriptRestart:true,passed:true}));
}
