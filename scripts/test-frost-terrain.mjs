// Author: MiYu. Terrain persistence, geometric continuity and real movement/combat rules.
import assert from 'node:assert/strict';
import {battleFixture} from './frost-battle-fixture.mjs';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
globalThis.Frost=S;const T=createRequire(import.meta.url)('../samples/frostbound-realms/game/terrain.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
const ridge=S.defaultMap();assert.ok(ridge.heights.filter(h=>h>0).length>=100);for(let i=0;i<1024;i++){assert.equal(ridge.heights[i],ridge.heights[1023-i]);}for(const spawn of ridge.spawns)assert.ok(S.flatSite(ridge,...spawn,3));assert.ok(S.traversable(ridge,-5,-7,-11,-7),'west ridge is reached over its ramp');assert.ok(S.traversable(ridge,5,7,11,7),'east ridge is reached over its mirrored ramp');assert.ok(!S.traversable(ridge,-19,-9,-17,-9),'cliff face blocks ground travel');
const legacy=S.defaultMap();delete legacy.heights;delete legacy.ramps;delete legacy.surfaces;delete legacy.relief;
delete legacy.cliffStyle;assert.equal(S.validateMap(legacy).cliffStyle,0);
for(const cliffStyle of [-1,3,.5,null,'1'])assert.throws(()=>S.validateMap({...legacy,cliffStyle}));
for(let cliffStyle=0;cliffStyle<3;cliffStyle++){const map=S.validateMap({...legacy,cliffStyle}),s=S.create('skirmish',{map});assert.equal(S.restore(JSON.parse(JSON.stringify(s))).map.cliffStyle,cliffStyle);assert.equal(S.publicState(s,0).map.cliffStyle,cliffStyle);assert.equal(T.material(map),'Assets/Materials/'+['Ground','GroundIce','GroundMasonry'][cliffStyle]+'.mmat');assert.equal(T.mesh(map,3,3),T.mesh(S.validateMap(legacy),3,3)+(cliffStyle?cliffStyle:''),'cliff geometry style preserves the encoded surface heights');}
assert.equal(S.validateMap(legacy).heights.reduce((a,b)=>a+b),0);
assert.deepEqual(S.validateMap(legacy).surfaces,Array(1024).fill(0));
for(const surfaces of [[0],Array(1024).fill(3),Array(1024).fill(-1),Array(1024).fill(.5),Array(1024).fill(NaN),null])assert.throws(()=>S.validateMap({...legacy,surfaces}));
{
  const s=battleFixture(S,'skirmish',{},['hero','barracks','farm','guard','harvest']),unit={id:0,x:-23,z:23},route=S.path(s,unit,23,-23),site=S.flatSite(s.map,-5,5,1);
  s.map.surfaces=s.map.surfaces.map((_,i)=>i%3);
  const restored=S.restore(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored.map.surfaces,s.map.surfaces);assert.deepEqual(S.publicState(s,0).map.surfaces,s.map.surfaces);
  assert.deepEqual(S.path(restored,unit,23,-23),route);assert.equal(S.flatSite(restored.map,-5,5,1),site);
  const validated=S.validateMap(s.map);validated.surfaces[0]=2;assert.equal(s.map.surfaces[0],0,'validated maps own the surface array');
  for(const fog of [1,.4,.07]){
    s.visible[0].fill(fog===1?1:0);s.explored[0].fill(fog>=.4?1:0);
    const cells=T.cells(s,0,false);
    for(let i=0;i<1024;i++){
      const encoded=Math.floor(cells[i]/2),kind=s.map.terrain[i];
      assert.equal(encoded%3,kind);assert.equal(Math.floor(encoded/3),kind===1?0:s.map.surfaces[i]);assert.ok(Math.abs(cells[i]-encoded*2-fog)<1e-6);
    }
    for(let z=0;z<8;z++)for(let x=0;x<7;x++){const a=T.chunk(cells,x,z).flat(),b=T.chunk(cells,x+1,z).flat();for(let row=0;row<6;row++)for(let dx=0;dx<2;dx++)assert.equal(a[row*6+4+dx],b[row*6+dx]);}
  }
}
for(const bad of [{heights:[0]},{ramps:Array(1024).fill(5)},{heights:Array(1024).fill(NaN)},{heights:Array(1024).fill(3),ramps:Array(1024).fill(1)}])assert.throws(()=>S.validateMap({...legacy,...bad}));
for(const [r,delta] of [[1,1],[2,-1],[3,32],[4,-32]]){
  const m=S.defaultMap(),i=16*32+16;m.relief.fill(0);m.heights.fill(1);m.ramps[i]=r;m.heights[i+delta]=2;
  assert.ok(S.terrainEdge(m,i-delta,i));assert.ok(S.terrainEdge(m,i,i+delta));assert.ok(S.terrainEdge(m,i+delta,i));
  assert.equal(S.tileHeight(m,i,1,1),3);assert.ok(S.elevation(m,1,1)>2&&S.elevation(m,1,1)<4);assert.ok(!S.terrainEdge(m,i,i+(Math.abs(delta)===1?32:1)));
}
const map=S.highlandMap();map.relief.fill(0);assert.equal(S.elevation(map,5,-5),4);assert.equal(S.tileHeight(map,S.index(-13,7),1,1),1);assert.equal(S.tileHeight(map,S.index(-11,7),0,1),2);assert.ok(S.elevation(map,-13,7)>0&&S.elevation(map,-13,7)<2);
assert.ok(S.terrainEdge(map,S.index(-15,7),S.index(-13,7)));assert.ok(S.terrainEdge(map,S.index(-13,7),S.index(-11,7)));
assert.ok(!S.terrainEdge(map,S.index(-13,3),S.index(-11,3)));assert.ok(!S.terrainEdge(map,S.index(-13,3),S.index(-13,5)),'cannot enter the side of a ramp');
assert.ok(S.flatSite(map,5,-5,1));assert.ok(!S.flatSite(map,-12,7,1));
for(let z=0;z<8;z++)for(let x=0;x<8;x++){
  const key=T.mesh(map,x,z);assert.match(key,/^terrain4h:[0-7]{2}[0-6]{144}[0-9a-f]{98}$/);
  for(let dz=0;dz<4;dz++)for(let dx=0;dx<4;dx++){const offset=12+((dz+1)*6+dx+1)*4,corners=key.slice(offset,offset+4).split('').map(Number);assert.equal(corners.reduce((a,b)=>a+b)/4,S.tileHeight(map,(z*4+dz)*32+x*4+dx,1,1));}
}
{
  let s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];const u=S.spawn(s,'worker',0,-17,7);u.order={type:'move',x:-5,z:7};
  const route=S.path(s,u,-5,7);assert.ok(route.length);let p=[u.x,u.z];for(const next of route){assert.ok(S.traversable(s.map,...p,...next));p=next;}
  step(s,45);assert.ok(u.x>-12&&S.unitHeight(s,u)===2,'ground unit climbs a real ramp');s=S.restore(s);step(s,40);assert.ok(s.units[0].x>-6);
  assert.equal(S.publicState(s,0).map.heights[S.index(5,-5)],2);
}
{
  const sealed=S.clone(map);sealed.ramps.fill(0);const s=S.create('skirmish',{map:sealed,ai:[false,false]});s.units=[];s.resources=[];const u=S.spawn(s,'soldier',0,-13,3);u.order={type:'move',x:-11,z:3};
  step(s,120);assert.ok(u.x<-12,'empty-path fallback cannot walk through a cliff');
  const fly=S.spawn(s,'dragon',0,-13,3);fly.order={type:'move',x:-9,z:3};step(s,20);assert.ok(fly.x>-12,'flying units clear cliffs');
  s.units=s.units.filter(v=>v.id!==fly.id);const defender=S.spawn(s,'soldier',1,-11,3);u.order=null;u.cd=0;const hp=defender.hp;step(s,5);assert.equal(defender.hp,hp,'melee cannot strike across a cliff');
}
{
  const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];const worker=S.spawn(s,'worker',0,-15,7),money=s.teams[0].gold;
  assert.match(S.command(s,0,{type:'build',ids:[worker.id],kind:'tower',x:-13,z:7}),/flat dry/);assert.equal(s.teams[0].gold,money);
  assert.equal(S.command(s,0,{type:'build',ids:[worker.id],kind:'tower',x:-7,z:7}),null);
  const archer=S.spawn(s,'archer',0,-13,1),target=S.spawn(s,'archer',1,13,1);assert.equal(S.attackClear(s,archer,target),false,'plateau blocks line of fire');
}
{
  const s=battleFixture(S,'skirmish',{},['hero','barracks','farm','guard','harvest']);s.map.heights[S.index(.1,-1)]=3;const a={kind:'archer',x:-.1,z:-1},b={kind:'archer',x:.1,z:-1};assert.equal(S.attackClear(s,a,b),false,'short rays test the vertical cliff crossing');assert.equal(S.attackClear(s,b,a),false);
}
{
  const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];const w=S.spawn(s,'worker',0,-12.5,1);assert.equal(S.command(s,0,{type:'build',ids:[w.id],kind:'tower',x:-9,z:1}),null);const b=s.units.at(-1);step(s,5);assert.equal(b.built,.01,'workers cannot start construction through a cliff');
}
console.log('PASS: terrain legacy/save/network data, mesh corners, ramps, cliff navigation/fallback, flying, building footprint and combat occlusion');
