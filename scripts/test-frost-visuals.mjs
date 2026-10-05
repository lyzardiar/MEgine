// Author: MiYu. Classic Warcraft geometry, animation states, teams and reproducible runtime bindings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {battleFixture} from './frost-battle-fixture.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),root=new URL('../samples/frostbound-realms/',import.meta.url);
globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(new URL('model-catalog.json',root)));const V=require('../samples/frostbound-realms/game/visuals.js');
const source=JSON.parse(fs.readFileSync(new URL('classic-sources.json',root))),sha=data=>crypto.createHash('sha256').update(data).digest('hex');
for(const file of source.files)assert.equal(sha(fs.readFileSync(new URL(file.path,root))),file.sha256,file.path);
let samples=0,teamLayers=0,hiddenLayers=0;
for(const asset of Object.values(FrostArt).filter(a=>a.classic)){
 assert.ok(asset.bounds.min.every(Number.isFinite)&&asset.bounds.max.every(Number.isFinite));
 for(let clip=0;clip<asset.animations.length;clip++)for(const t of [0,.3,asset.animations[clip].duration,asset.animations[clip].duration+2]){
  const action=asset.animations[clip].name,u={kind:'soldier',team:0,cd:0,built:1},sample=V.classicSample(u,asset,false,t,action,30),mesh=V.pose(u,asset,false,t,30);
  assert.ok(Number.isInteger(sample.frame)&&sample.frame>=0&&sample.frame<=18000);assert.ok(sample.clip>=0&&sample.clip<asset.animations.length);
  assert.match(mesh,/#pose=\d+:\d+@30$/);assert.ok(fs.existsSync(new URL(mesh.split('#')[0],root)));samples++;
 }
 const u={kind:'soldier',team:0,cd:0,built:1},mesh=V.pose(u,asset,false,.3,30),blue=V.parts(asset,mesh,0),red=V.parts(asset,mesh,1);
 assert.equal(blue.length,asset.parts.length);
 for(let i=0;i<blue.length;i++){
  const p=asset.parts[i];assert.ok(blue[i].color.every(Number.isFinite));assert.ok(blue[i].mesh.startsWith(p.mesh));
  if(p.teamMaterials['1']){assert.equal(blue[i].material,p.teamMaterials['1']);assert.equal(red[i].material,p.teamMaterials['0']);teamLayers++;}
  if(!blue[i].visible)hiddenLayers++;
 }
}
assert.ok(samples>1000&&teamLayers>20&&hiddenLayers>10);
for(let faction=0;faction<4;faction++){
 const s=battleFixture(S,'skirmish',{factions:[faction,0],ai:[false,false]},['hero','barracks','farm']);
 for(const kind of Object.keys(S.types)){const v=V.model(s,{kind,team:0,cd:0,built:1});assert.ok(v.asset,kind);assert.ok(Number.isFinite(v.scale)&&v.scale>0,kind);assert.ok(V.name(s,{kind,team:0}));}
 const worker=s.units.find(u=>u.kind==='worker'&&u.team===0),view=V.model(s,worker);assert.equal(view.key,['RealWorker','ClassicPeon','ClassicWisp','RealAcolyte'][faction]);assert.ok(view.asset.classic);
 const soldier=V.model(s,{kind:'soldier',team:0,cd:0,built:1});assert.equal(soldier.key,['RealFootman','RealOrc','ClassicHuntress','RealGhoul'][faction]);
 for(const tier of [1,2,3]){
  const hall=s.units.find(u=>u.kind==='hall'&&u.team===0);hall.upgradeTier=tier;const v=V.model(s,hall);assert.ok(v.asset.classic&&v.asset.factionBuilding);assert.equal(v.asset.classicTier,tier);
  assert.ok(v.scale*Math.hypot(v.asset.size[0],v.asset.size[2])<=S.types.hall.radius*2*.92+1e-6);
  if(faction===0){const clip=v.asset.animations[V.classicSample(hall,v.asset,false,0).clip];if(tier>1)assert.match(clip.name,tier===2?/Upgrade First/:/Upgrade Second/);else assert.equal(clip.name,'Stand');}
  const ghost=V.parts(v.asset,V.pose({...hall,built:1,cd:0},v.asset,false,0),0,true);assert.ok(ghost.filter(p=>p.visible).every(p=>p.material.includes('/Placement/')));
 }
}
for(const key of ['RealWorker','ClassicPeon','RealGhoul']){
 const asset=FrostArt[key+'Wood'],u={kind:key==='RealGhoul'?'ghoul':'worker',team:0,cd:0,cargo:5,cargoKind:'tree'};
 const a=V.classicSample(u,asset,false,20,undefined,30),b=V.classicSample(u,asset,false,20.25,undefined,30);assert.match(asset.animations[a.clip].name,/Attack Lumber/i);assert.notEqual(a.frame,b.frame,'harvesting continues after match startup');
 assert.equal(V.pose(u,asset,false,20,30),V.pose({...u},asset,false,20,30));
}
for(let heroClass=0;heroClass<4;heroClass++){
 const s=battleFixture(S,'skirmish',{heroes:[heroClass,0],ai:[false,false]},['hero']),hero=s.units.find(u=>u.kind==='hero'&&u.team===0),view=V.model(s,hero);
 assert.ok(view.asset.classic);hero.level=6;hero.skillPoints=6;assert.equal(S.command(s,0,{type:'learn',ids:[hero.id],slot:0}),null);assert.equal(S.command(s,0,{type:'spell',ids:[hero.id],slot:0,x:hero.x+2,z:hero.z}),null);
 const sample=V.classicSample(hero,view.asset,false,100,undefined,30);assert.match(view.asset.animations[sample.clip].name,/Spell/i);
 assert.equal(V.pose(hero,view.asset,false,100,30),V.pose(S.restore(s).units.find(u=>u.id===hero.id),view.asset,false,100,30));
 assert.match(view.asset.animations[V.classicSample(hero,view.asset,true,1).clip].name,/Walk/i);
 assert.ok(V.portrait(view.asset).size>0);
}
for(const key of ['RealFootman','RealArcher','RealGhoul','RealAbomination']){
 const asset=FrostArt[key],u={kind:'soldier',team:0,cd:0},clip=V.classicClip(asset,'Death',u),duration=asset.animations[clip].duration;
 const end=V.classicSample(u,asset,false,duration,'Death'),late=V.classicSample(u,asset,false,duration+10,'Death');assert.deepEqual(end,late);assert.equal(end.frame,Math.ceil(duration*12));
}
for(const [x,z] of [[0,8],[8,0],[0,-8],[-8,0]]){const m=V.muzzle({x,z,fromX:0,fromZ:0,fromY:1.6,team:0});assert.ok([m.x,m.y,m.z].every(Number.isFinite));assert.ok(m.x*x+m.z*z>0);}
for(let tileset=0;tileset<3;tileset++){const v=V.resource({kind:'tree',x:2,z:3,amount:3000},12,tileset);assert.equal(v.key,['ClassicOak','ClassicBarrensTree','ClassicWinterTree'][tileset]);assert.ok(v.parts.length>=1);}
const scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world.entities,portraitRoot=scene.find(e=>e.name==='Portrait model');
assert.equal(scene.filter(e=>e.parent===portraitRoot.entity).length,V.actorPartCount());
for(const prefix of ['Unit 0','Corpse 0','Placement preview'])assert.equal(scene.filter(e=>e.name===prefix||e.name.startsWith(prefix+' part ')).length,V.actorPartCount());
console.log('PASS: classic asset hashes',source.files.length,'pose samples',samples,'team layers',teamLayers,'hidden layers',hiddenLayers,'four rosters, tiers, worker cycles, spells, terminal deaths and complete render slots');
