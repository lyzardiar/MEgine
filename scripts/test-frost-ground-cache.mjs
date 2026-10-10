// Author: MiYu. Verify terrain edits, map isolation and state-specific obstacles with shared terrain routes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function fixture(map=S.defaultMap()){
  map.units=[];map.props=[];map.doodads=[];map.triggers=[];
  const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];
  return {s,u:S.spawn(s,'worker',0,-9,1)};
}
function plain(){const map=S.defaultMap();for(const key of ['terrain','heights','ramps','relief'])map[key].fill(0);return map;}
function freshRoute(s,u,x=9,z=1){const copy=S.clone(s);return S.path(copy,{...copy.units.find(v=>v.id===u.id),...u},x,z);}
function exactRoute(s,u,x=9,z=1){const path=S.path(s,u,x,z);assert.deepEqual(path,freshRoute(s,u,x,z));return path;}
{
  const {s,u}=fixture(plain()),open=exactRoute(s,u);assert.deepEqual(open.at(-1),[9,1]);
  for(let z=0;z<32;z++)s.map.terrain[z*32+16]=1;s.frame++;
  assert.ok(exactRoute(s,u).every(([x])=>x<0),'water edits close previously cached edges');
  for(let z=0;z<32;z++)s.map.terrain[z*32+16]=0;s.frame++;
  assert.deepEqual(exactRoute(s,u),open,'in-place land restoration reopens edges');
  s.map.terrain=s.map.terrain.map((v,i)=>i%32===16?1:v);s.frame++;
  assert.ok(exactRoute(s,u).every(([x])=>x<0),'replaced terrain array invalidates edges');
  s.map=plain();s.frame++;assert.deepEqual(exactRoute(s,u),open,'replaced map gets independent edges');
  console.log('PASS water close/open, terrain replacement and map replacement match fresh search');
}
{
  const {s,u}=fixture(plain());exactRoute(s,u);
  for(let z=0;z<32;z++)for(let x=16;x<32;x++)s.map.heights[z*32+x]=1;s.frame++;
  assert.ok(exactRoute(s,u).every(([x])=>x<0),'new cliff closes cached flat edges');
  s.map.ramps[16*32+15]=1;s.frame++;assert.deepEqual(exactRoute(s,u).at(-1),[9,1],'ramp opens a cliff crossing');
  s.map.relief[16*33+16]=.5;s.map.relief[17*33+16]=-.5;s.frame++;exactRoute(s,u);
  s.map.ramps.fill(0);s.frame++;assert.ok(exactRoute(s,u).every(([x])=>x<0),'removed ramp recloses the passage');
  s.map.heights.fill(0);s.map.relief.fill(0);s.frame++;assert.deepEqual(exactRoute(s,u).at(-1),[9,1]);
  console.log('PASS heights, ramp addition/removal and relief edits match fresh terrain geometry');
}
{
  const {s,u}=fixture(plain()),open=exactRoute(s,u),probe={...s,serial:s.serial+1,units:[...s.units,{id:s.serial+1,kind:'hall',team:0,x:1,z:1,hp:1,built:.01,queue:[]}]};
  const detour=exactRoute(probe,u);assert.notDeepEqual(detour,open,'hypothetical building keeps its own obstacle mask');
  assert.deepEqual(exactRoute(s,u),open,'probe building does not contaminate original state');
  const opponent={...probe,serial:probe.serial+1,units:probe.units.map(v=>v.kind==='hall'?{...v,team:1,x:17}:v)};exactRoute(opponent,u);
  for(const kind of ['soldier','knight','glaivethrower']){
    const other={...u,kind};assert.deepEqual(S.path(probe,other,9,1),freshRoute(probe,other));
  }
  const oldFrame=s.frame;s.frame++;for(let z=0;z<32;z++)s.map.terrain[z*32+16]=1;exactRoute(s,u);
  probe.frame=oldFrame;assert.ok(exactRoute(probe,u).every(([x])=>x<0),'other state observes shared map cache replacement despite unchanged frame');
  const isolated=fixture(plain());assert.deepEqual(exactRoute(isolated.s,isolated.u),open);
  console.log('PASS hypothetical footprints, per-radius routes, cross-state invalidation and independent maps');
}
{
  const {s,u}=fixture(S.highlandMap());
  for(const [x,z] of [[-11,3],[-5,7],[5,-5],[23,-23]])exactRoute(s,u,x,z);
  const restored=S.restore(s);assert.deepEqual(exactRoute(restored,restored.units.find(v=>v.id===u.id),23,-23),exactRoute(s,u,23,-23));
  assert.equal(Object.keys(s).some(k=>/cache|groundRoutes|groundFrames/.test(k)),false,'cache stays outside saved/network state');
  console.log('PASS highland routes and restored world preserve route output without serializing caches');
}
