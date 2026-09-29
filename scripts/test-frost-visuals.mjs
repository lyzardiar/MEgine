// Author: MiYu. Faction model selection, tier changes and derived asset/source integrity.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),root=new URL('../samples/frostbound-realms/',import.meta.url);
globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(new URL('model-catalog.json',root)));const V=require('../samples/frostbound-realms/game/visuals.js');
const halls=new Set();
for(let f=0;f<4;f++){
  const s=S.create('skirmish',{factions:[f,0],ai:[false,false]}),hall=s.units.find(u=>u.team===0&&u.kind==='hall');
  for(const kind of Object.keys(S.types)){const visual=V.model(s,{kind,team:0});assert.ok(visual.asset,kind);assert.ok(Number.isFinite(visual.scale)&&visual.scale>0,kind);assert.ok(V.name(s,{kind,team:0}));}
  const original=V.model(s,hall);halls.add(original.key);assert.equal(original.key,S.factions[f]+'Hall');
  s.teams[0].gold=2000;s.teams[0].wood=2000;
  for(const tier of [2,3]){assert.equal(S.command(s,0,{type:'tech',ids:[hall.id]}),null);for(let i=0;i<(tier-1)*200+2;i++)S.tick(s);assert.equal(s.teams[0].tier,tier);assert.equal(V.model(s,hall).key,S.factions[f]+'Hall'+tier);}
  assert.equal(V.model(S.restore(s),hall).key,S.factions[f]+'Hall3');s.visible[1].fill(1);const view=S.publicState(s,1),seen=view.units.find(u=>u.id===hall.id);assert.equal(V.model(view,seen).key,S.factions[f]+'Hall3');assert.equal(V.name(view,seen),V.name(s,hall));assert.equal(view.teams[0].tier,undefined,'global enemy tech stays private');s.visible[1].fill(0);assert.ok(!S.publicState(s,1).units.some(u=>u.id===hall.id));
  for(const kind of ['hall','barracks','farm','tower','altar','workshop']){const {asset,scale}=V.model(s,{kind,team:0});assert.ok(Math.max(asset.size[0],asset.size[2])*scale<=S.types[kind].radius*2,'art stays inside gameplay footprint');}
}
assert.equal(halls.size,4);
const verify=entry=>{const data=fs.readFileSync(new URL(entry.file,root));assert.equal(crypto.createHash('sha256').update(data).digest('hex'),entry.sha256,entry.file);};
const realistic=JSON.parse(fs.readFileSync(new URL('realistic-sources.json',root))),houses=JSON.parse(fs.readFileSync(new URL('house-sources.json',root)));
for(const manifest of [realistic,houses]){assert.equal(manifest.license,'CC0-1.0');manifest.sources.forEach(verify);manifest.generated.forEach(verify);}realistic.impostors.forEach(verify);
const warclans=JSON.parse(fs.readFileSync(new URL('warclans-sources.json',root)));assert.equal(warclans.license,'CC-BY-SA-3.0');assert.equal(warclans.author,'Wildfire Games');warclans.sources.forEach(verify);warclans.generated.forEach(verify);
assert.equal(Object.keys(warclans.models).length,8);for(const key of Object.keys(warclans.models)){const asset=FrostArt[key];assert.ok(asset.realistic);assert.equal(asset.parts[0].mesh,'Assets/Models/Real'+key+'.glb');}
const attribution=fs.readFileSync(new URL('Assets/Licenses/0ad-warclans.txt',root),'utf8');assert.ok(attribution.includes('Wildfire Games')&&attribution.includes(warclans.licenseUrl));assert.ok(attribution.includes('Assets/Art/faction-buildings.png'));
for(let i=0;i<140;i++)for(const zoom of [12,27]){const edge=i<72,visual=V.scenery(i,edge,zoom);assert.ok(visual.scale>0);assert.ok(Math.max(visual.asset.size[0],visual.asset.size[2])*visual.scale<=(visual.key.startsWith('RealSpruce')?6:edge?4.5:1.7)+1e-6,'scenery horizontal footprint is bounded');}
for(const kind of ['tree','mine','camp']){
 const near=V.resource({kind,x:12,z:-3},12),far=V.resource({kind,x:12,z:-3},27);assert.ok(fs.existsSync(new URL(near.mesh,root)));assert.ok(fs.existsSync(new URL(far.mesh,root)));assert.notEqual(near.mesh,far.mesh);assert.equal(near.scale,far.scale);
 if(kind==='tree'){assert.match(far.mesh,/-card.glb$/);assert.equal(far.yaw,0,'card faces the fixed camera');const material=JSON.parse(fs.readFileSync(new URL(far.asset.material,root)));assert.equal(material.surface,'cutout');}
}
const buildings=JSON.parse(fs.readFileSync(new URL('faction-sources.json',root)));buildings.sources.forEach(verify);buildings.generated.forEach(verify);
const monsters=JSON.parse(fs.readFileSync(new URL('monster-sources.json',root)));monsters.forEach(m=>{verify(m);m.generated.forEach(verify);assert.ok(m.animations.length>=8);});
const icons=JSON.parse(fs.readFileSync(new URL('faction-icons.json',root))),slices=JSON.parse(fs.readFileSync(new URL(icons.file+'.sprite.json',root))).slices;verify(icons);assert.equal(slices.length,32);assert.deepEqual(slices.map(s=>s.name).sort(),Object.keys(buildings.models).sort());
assert.equal(Object.keys(buildings.models).length,32);assert.equal(monsters.length,5);
const skeletons=JSON.parse(fs.readFileSync(new URL('skeleton-sources.json',root)));assert.equal(skeletons.license,'CC0-1.0');skeletons.sources.forEach(verify);skeletons.generated.forEach(verify);
const humans=JSON.parse(fs.readFileSync(new URL('human-sources.json',root)));assert.equal(humans.license,'CC-BY-SA-3.0');assert.equal(humans.author,'Wildfire Games');humans.sources.forEach(verify);humans.generated.forEach(verify);
const humanLicense=fs.readFileSync(new URL('Assets/Licenses/0ad-humans.txt',root),'utf8');assert.ok(humanLicense.includes('Wildfire Games')&&humanLicense.includes('https://creativecommons.org/licenses/by-sa/3.0/')&&humanLicense.includes('Assets/Art/unit-portraits.png'));
for(const [kind,key] of [['soldier','RealFootman'],['worker','RealWorker']]){
 const unit={kind,team:0,cd:0},visual=V.model(S.create('skirmish',{factions:[0,1]}),unit);assert.equal(visual.key,key);assert.match(V.pose(unit,visual.asset,false,.5),/#pose=0:6$/);assert.match(V.pose(unit,visual.asset,true,.5),/#pose=1:6$/);
 for(const order of [undefined,{type:'attack'},{type:'attackMove'},{type:'hold'},{type:'patrol'}]){unit.cd=.7;unit.order=order;assert.match(V.pose(unit,visual.asset,false,.5),/#pose=2:6$/);}
 if(kind==='worker')for(const type of ['gather','build','construct','repair']){unit.order={type};assert.match(V.pose(unit,visual.asset,false,.5),/#pose=0:6$/,'work cooldown does not play combat');}
}
{
 const state=S.create('skirmish',{factions:[0,1]}),unit={kind:'archer',team:0,cd:0};
 assert.equal(V.model(state,unit).key,'RealArcher');assert.equal(V.model(state,unit).asset,FrostArt.RealArcher);
 for(const [cd,key] of [[1.2,'RealArcherShoot'],[.8,'RealArcherLoaded'],[.2,'RealArcherLoaded']]){unit.cd=cd;const v=V.model(state,unit);assert.equal(v.key,'RealArcher');assert.equal(v.asset,FrostArt[key]);assert.equal(V.pose(unit,v.asset,false,0),V.pose(unit,v.asset,false,90),'shot frame depends on simulation cooldown, including save/network restoration');assert.match(V.pose(unit,v.asset,false,0),/#pose=2:/);}
 assert.equal(V.model(state,unit,true).asset,FrostArt.RealArcher,'moving keeps the hand arrow');assert.match(V.pose(unit,FrostArt.RealArcher,true,.5),/#pose=1:/);
 assert.equal(V.model(state,{...unit,stun:1}).asset,FrostArt.RealArcher);unit.cd=0;assert.match(V.pose(unit,V.model(state,unit).asset,false,.5),/#pose=0:/);
}
{
 const map=S.defaultMap();map.terrain.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const state=S.create('skirmish',{map}),archer=S.spawn(state,'archer',0,0,0),target=S.spawn(state,'neutral',1,0,6);target.speed=0;target.damage=0;S.visibility(state);
 assert.equal(S.command(state,0,{type:'attack',ids:[archer.id],target:target.id}),null);S.tick(state);const hit=state.events.find(e=>e.fromX===archer.x&&e.fromZ===archer.z);assert.equal(hit.type,'launch');assert.equal(hit.ranged,true);assert.equal(target.hp,target.maxHp);assert.equal(S.publicState(state,0).projectiles[0].art,'arrow','network-visible shot retains projectile art');
}
{
 const map=S.defaultMap();map.terrain.fill(0);map.props=[];const state=S.create('skirmish',{map}),unit=S.spawn(state,'worker',0,0,0),target=S.spawn(state,'neutral',1,1.5,0);unit.order={type:'attack',target:target.id};unit.cd=.7;
 assert.equal(V.heading(state,unit,{x:0,z:-.1,yaw:0}),Math.PI/2,'melee slot adjustment after striking keeps facing the victim');target.x=20;assert.equal(V.heading(state,unit,{x:0,z:-.1,yaw:0}),0,'out of range pursuit faces movement');
}
const portraits=JSON.parse(fs.readFileSync(new URL('unit-icons.json',root)));verify(portraits);const unitSlices=JSON.parse(fs.readFileSync(new URL(portraits.file+'.sprite.json',root))).slices,portraitKeys=new Set(unitSlices.map(s=>s.name));assert.equal(portraitKeys.size,20);
const siege=JSON.parse(fs.readFileSync(new URL('siege-sources.json',root)));assert.equal(siege.license,'CC-BY-SA-3.0');siege.sources.forEach(verify);siege.generated.forEach(verify);
for(const [kind,key] of [['ballista','RealBallista'],['catapult','RealCatapult'],['trebuchet','RealTrebuchet'],['ram','RealRam']]){
 const map=S.defaultMap();map.terrain.fill(0);map.props=[];map.players.forEach(p=>p.ai=false);const state=S.create('skirmish',{map}),unit=S.spawn(state,kind,0,0,0),target=S.spawn(state,'tower',1,0,3);target.damage=0;target.hp=target.maxHp=100000;S.visibility(state);unit.order={type:'attack',target:target.id};
 const idle=V.model(state,unit);assert.equal(idle.key,key);assert.equal(idle.scale,1);assert.ok(portraitKeys.has(key));assert.equal(idle.asset,FrostArt[key]);
 let released=false,sawLoaded=false,sawEmpty=false;
 for(let i=0;i<100;i++){
  S.tick(state);const v=V.model(state,unit);assert.equal(v.key,key);assert.equal(v.scale,1);if(state.events.some(e=>e.type==='launch'&&e.fromX===unit.x&&e.fromZ===unit.z)){released=true;if(v.asset.shotModel)assert.equal(v.asset,FrostArt[key+'Shoot'],'released ammunition is removed');}
  sawLoaded||=v.asset===FrostArt[key];sawEmpty||=v.asset===FrostArt[key+'Shoot'];
  const copy=S.restore(state),restored=copy.units.find(u=>u.id===unit.id);assert.equal(V.model(copy,restored).asset,v.asset);assert.equal(V.pose(restored,v.asset,false,0),V.pose(unit,v.asset,false,90),'mechanical cycle survives save restoration');
 }
 if(kind!=='ram')assert.ok(released&&sawLoaded&&sawEmpty,kind+' completes loaded/release/reload cycle');
 assert.equal(V.model(state,unit,true).asset,FrostArt[key]);assert.match(V.pose(unit,FrostArt[key],true,.5),/#pose=1:/);assert.equal(V.model(state,{...unit,stun:1}).asset,FrostArt[key]);
}
{
 const map=S.defaultMap();map.terrain.fill(0);map.props=[{kind:'tree',x:-8,z:12,amount:4000},{kind:'mine',x:-8,z:16,amount:4000}];map.players.forEach(p=>p.ai=false);
 const state=S.create('skirmish',{map,factions:[0,1]}),worker=state.units.find(u=>u.kind==='worker'&&u.team===0);state.units.filter(u=>u.kind==='worker').forEach(u=>u.order=null);worker.x=-12;worker.z=12;
 const art=()=>V.model(state,worker),until=fn=>{for(let i=0;i<600;i++){if(fn())return;S.tick(state);}assert.fail('worker activity did not complete');};
 assert.equal(S.command(state,0,{type:'gather',ids:[worker.id],resource:0}),null);assert.equal(art().asset,FrostArt.RealWorker,'approaching a resource keeps walking equipment');
 until(()=>art().asset===FrostArt.RealWorkerWood&&worker.cargo>0);assert.equal(worker.cd,0);assert.ok(worker.gatherCd>0);assert.equal(art().key,'RealWorker','working keeps the same portrait identity');assert.match(V.pose(worker,art().asset,false,.5),/RealWorkerWood.glb#pose=0:/);
 assert.equal(V.heading(state,worker,{x:worker.x,z:worker.z,yaw:0}),Math.atan2(-8-worker.x,12-worker.z));
 const legacy=S.clone(state),legacyWorker=legacy.units.find(u=>u.id===worker.id);delete legacyWorker.gatherCd;legacyWorker.cd=.4;const migrated=S.restore(legacy).units.find(u=>u.id===worker.id);assert.equal(migrated.gatherCd,.4);assert.equal(migrated.cd,.4);legacyWorker.cd=1.2;assert.equal(S.restore(legacy).units.find(u=>u.id===worker.id).gatherCd,1.2);legacyWorker.gatherCd=-1;assert.throws(()=>S.restore(legacy),/gathering cooldown/);
 const restored=S.restore(state),restoredWorker=restored.units.find(u=>u.id===worker.id);assert.equal(V.model(restored,restoredWorker).asset,FrostArt.RealWorkerWood);
 for(const patch of [{cargo:20},{stun:1},{inside:1}])assert.equal(V.model(state,{...worker,...patch}).asset,FrostArt.RealWorker);
 const amount=state.resources[0].amount;state.resources[0].amount=0;assert.equal(art().asset,FrostArt.RealWorker);state.resources[0].amount=amount;
 assert.equal(S.command(state,0,{type:'gather',ids:[worker.id],resource:1}),null);until(()=>art().asset===FrostArt.RealWorkerMine&&worker.cargoKind==='mine');
 assert.equal(S.command(state,0,{type:'stop',ids:[worker.id]}),null);assert.equal(art().asset,FrostArt.RealWorker);assert.match(V.pose(worker,art().asset,false,.5),/#pose=0:6$/,'stopping gathering does not start a combat swing');
 assert.equal(S.command(state,0,{type:'build',ids:[worker.id],kind:'farm',x:-4,z:10}),null);const building=state.units.find(u=>u.kind==='farm'&&u.built<1);until(()=>art().asset===FrostArt.RealWorkerBuild);assert.ok(building.built<1);assert.equal(V.model(state,{...worker,root:1}).asset,FrostArt.RealWorker);const progress=building.built;S.tick(state);assert.ok(building.built>progress);
 until(()=>building.built===1);assert.notEqual(art().asset,FrostArt.RealWorkerBuild);building.hp=building.maxHp/2;assert.equal(S.command(state,0,{type:'repair',ids:[worker.id],target:building.id}),null);until(()=>art().asset===FrostArt.RealWorkerBuild);const budget={...state.teams[0]};state.teams[0].gold=state.teams[0].wood=0;assert.equal(art().asset,FrostArt.RealWorker);Object.assign(state.teams[0],budget);const hp=building.hp;S.tick(state);assert.ok(building.hp>hp);until(()=>building.hp===building.maxHp);assert.notEqual(art().asset,FrostArt.RealWorkerBuild);
}
for(let faction=0;faction<4;faction++){const state=S.create('skirmish',{factions:[faction,0]});for(const kind of Object.keys(S.types))if(S.types[kind].speed)assert.ok(portraitKeys.has(V.model(state,{kind,team:0}).key),kind);}
for(const [kind,key] of [['bonearcher','Skeleton_Rogue'],['necromancer','Skeleton_Mage']]){
 const unit={kind,team:0,cd:0},visual=V.model(S.create(),unit);assert.equal(visual.key,key);assert.match(V.pose(unit,visual.asset,false,.5),/#pose=0:6$/);assert.match(V.pose(unit,visual.asset,true,.5),/#pose=1:6$/);unit.cd=1;assert.match(V.pose(unit,visual.asset,false,.5),/#pose=2:6$/);
 const bytes=fs.readFileSync(new URL(visual.asset.parts[0].mesh,root)),doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());const socket=doc.nodes.find(n=>n.name==='handslot.r'),weapon=skeletons.models[key].weapon;assert.ok(socket.children.some(i=>doc.nodes[i].name===weapon&&Number.isInteger(doc.nodes[i].mesh)),'weapon follows the hand hierarchy');assert.deepEqual(doc.animations.map(a=>a.name),skeletons.models[key].clips);
}
{
 const state=S.create(),unit=S.spawn(state,'bonearcher',0,0,0),target=S.spawn(state,'soldier',1,8,0),old={x:0,z:-1,yaw:0};unit.cd=1;unit.order={type:'attack',target:target.id};state.events=[{type:'hit',team:0,fromX:0,fromZ:0,x:8,z:0}];assert.equal(V.heading(state,unit,old),Math.PI/2,'attack turns from the old marching direction toward the actual hit');
 state.events=[];assert.equal(V.heading(state,unit,{x:0,z:0,yaw:0}),Math.PI/2,'stationary explicit attacks continue tracking their target');unit.order=null;unit.cd=0;assert.equal(V.heading(state,unit,{x:-1,z:0,yaw:0}),Math.PI/2,'marching turns with movement');assert.equal(V.heading(state,{kind:'tower',team:0,x:0,z:0,cd:1},old),0,'buildings retain their authored orientation');
}
console.log('PASS: four faction rosters, 32 building meshes, real tier upgrades/save restore, footprints, five animated monsters, two armed skeletons, 20 native unit portraits and pinned source/derived hashes');
