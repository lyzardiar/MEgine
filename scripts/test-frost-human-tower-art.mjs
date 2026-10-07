// Author: MiYu. Verify source Scout/Guard stages and Guard attack geometry.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
globalThis.Frost=require('../samples/frostbound-realms/game/simulation.js');
globalThis.FrostArt=require('../samples/frostbound-realms/model-catalog.json');
const V=require('../samples/frostbound-realms/game/visuals.js'),scales=require('../samples/frostbound-realms/building-scale-catalog.json'),circles=require('../samples/frostbound-realms/unit-scale-catalog.json'),state={teams:[{faction:0}],units:[]};
for(const [kind,key,unit,clip,geosets] of [['scouttower','KingdomScoutTower','hwtw',1,[0,9]],['guardtower','KingdomTower','hgtw',4,[1,13]],['tower','KingdomTower','hgtw',4,[1,13]]]){
 const u={kind,team:0,built:1,cd:0},view=V.model(state,u);assert.equal(view.key,key);assert.equal(scales.models[key].unit,unit);assert.equal(view.scale,2);assert.equal(circles.buildingSelection[key],2.5);assert.equal(V.classicClip(view.asset,'Stand',u),clip);
 assert.equal(view.asset.boundsSource,'nativeStand');assert.equal(V.unitPortrait(state,u),'Assets/Art/faction-buildings.png#KingdomTower');
 for(const cd of kind==='scouttower'?[0]:[0,.2,.8]){
  u.cd=cd;const pose=V.classicSample(u,view.asset,false,.25);assert.equal(pose.clip,clip,kind+' retains its source stage during attack');
  const parts=V.parts(view.asset,view.asset.parts[0].mesh+'#pose='+pose.clip+':'+pose.frame).filter(p=>p.visible);
  assert.deepEqual([...new Set(parts.map(p=>p.geoset))].sort((a,b)=>a-b),geosets,kind+' shows only its source geosets');
 }
}
assert.ok(FrostArt.KingdomTower.bounds.max[1]>FrostArt.KingdomScoutTower.bounds.max[1]);
console.log('PASS Scout and Guard source stages, UnitUI scales, shared portrait and Guard attack geosets');
