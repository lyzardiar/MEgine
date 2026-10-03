// Author: MiYu. Optional map tilesets preserve authored ground, geometry, fog and persistence.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');globalThis.Frost=S;const T=require('../samples/frostbound-realms/game/terrain.js');
assert.deepEqual(T.tilesetNames,['Winter','Forest','Barrens']);
const original=S.highlandMap();original.cliffs=Array(1024).fill(0);original.cliffs[400]=2;original.surfaces[590]=2;const legacy=S.validateMap(original);
assert.equal(Object.hasOwn(legacy,'tileset'),false);
for(const tileset of [0,1,2]){
  const map=S.validateMap({...original,tileset}),saved=S.restore(S.create('skirmish',{map,ai:[false,false]}));assert.equal(map.tileset,tileset);assert.equal(saved.map.tileset,tileset);assert.equal(S.publicState(saved,0).map.tileset,tileset);
  for(const field of ['terrain','heights','ramps','relief','surfaces','cliffs','props','players'])assert.deepEqual(map[field],legacy[field],field);
  for(let z=0;z<8;z++)for(let x=0;x<8;x++){assert.equal(T.mesh(map,x,z),T.mesh(legacy,x,z));for(const bed of [false,true])assert.equal(T.waterMesh(map,x,z,bed),T.waterMesh(legacy,x,z,bed));}
  const state=S.create('skirmish',{map});assert.deepEqual(T.cells(state,0,false),T.cells(S.create('skirmish',{map:legacy}),0,false));assert.equal(S.elevation(map,-5,7),S.elevation(legacy,-5,7));assert.equal(S.traversable(map,-17,7,-5,7),S.traversable(legacy,-17,7,-5,7));
}
for(const tileset of [-1,3,.5,'1',null,true,NaN,Infinity])assert.throws(()=>S.validateMap({...original,tileset}),/Invalid terrain tileset/);
for(const name of ['skirmish','highland-pass','supply-road','moba','td','rpg']){const raw=JSON.parse(fs.readFileSync('samples/frostbound-realms/Assets/Maps/'+name+'.json','utf8'));assert.equal(Object.hasOwn(S.validateMap(raw),'tileset'),false);assert.deepEqual(S.restore(S.create(raw.mode,{map:raw})).map,S.validateMap(raw));}
console.log('PASS: three tilesets, invalid palette rejection, exact geometry/water/fog preservation, save/public state and six legacy map roundtrips');
