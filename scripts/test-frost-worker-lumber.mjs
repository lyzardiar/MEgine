// Author: MiYu. Source harvest timing, destructive trees, paid depots, return jobs and saved continuation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),rules=S.workerLumberRules;
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},command=(s,u,type,extra={})=>S.command(s,u.team,{type,ids:[u.id],...extra}),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
export function lumberFixture(faction=0,options={}){
 const map=S.defaultMap();map.units=[];map.props=[];map.triggers=[];map.doodads=[];map.props=[{kind:'tree',x:0,z:0,amount:600}];for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);
 const s=S.create('skirmish',{map,factions:[faction,0],ai:[false,false],...options});s.units=[];Object.assign(s.teams[0],{gold:10000,wood:10000});
 const hall=S.spawn(s,'hall',0,-10,0);S.spawn(s,'hall',1,20,-20);const worker=S.spawn(s,faction===3?'ghoul':'worker',0,-1.8,0,{order:{type:'hold'}});S.visibility(s);return {s,hall,worker,tree:s.resources[0]};
}
for(const file of ['worker-lumber-sources.json','lumber-depot-sources.json']){
 const manifest=require('../samples/frostbound-realms/'+file);for(const r of [...(manifest.sources||[]).filter(r=>r.localPath),...(manifest.outputs||manifest.files||[])]){const bytes=fs.readFileSync(new URL('../samples/frostbound-realms/'+(r.localPath||r.path),import.meta.url));assert.equal(bytes.length,r.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),r.sha256);}
}
for(const [faction,source] of [[0,'hpea'],[1,'opeo'],[3,'ugho']]){
 const {s,worker,tree}=lumberFixture(faction),r=rules.units[source],wood=s.teams[0].wood;assert.equal(worker.lumberHarvester,source);near(S.movementRadius(worker),r.collision);assert.equal(command(s,worker,'gather',{resource:0}),null);
 step(s,1);assert.equal(worker.lumberSwing.elapsed,0);assert.equal(worker.cargo,0);step(s,Math.ceil(r.damagePoint/S.DT)-1);assert.equal(worker.cargo,0);step(s,1);assert.equal(worker.cargo,r.damage);assert.equal(tree.hp,50-r.damage);assert.equal(tree.amount,600-r.damage);
 const saved=S.restore(s);for(let i=0;i<160;i++){S.tick(s);S.tick(saved);assert.deepEqual(s,saved);}assert.ok(s.teams[0].wood>wood,'completed source haul');
 const a=lumberFixture(faction);a.worker.cargo=r.capacity-r.damage;a.worker.cargoKind='tree';command(a.s,a.worker,'gather',{resource:0});step(a.s,1+Math.ceil(r.damagePoint/S.DT));assert.equal(a.worker.cargo,r.capacity);assert.equal(a.worker.order.type,'gather');step(a.s,Math.ceil((r.damagePoint+r.backswing)/S.DT)-Math.ceil(r.damagePoint/S.DT));assert.equal(a.worker.order.type,'returnResources');assert.equal(a.worker.lumberSwing,undefined);assert.ok(S.restore(a.s));
 const b=lumberFixture(faction);b.tree.hp=r.damage;b.tree.amount=100;command(b.s,b.worker,'gather',{resource:0});step(b.s,1+Math.ceil(r.damagePoint/S.DT));assert.equal(b.tree.hp,0);assert.equal(b.tree.amount,0);assert.ok(b.tree.felled);assert.equal(b.worker.cargo,r.damage);assert.equal(b.worker.order.type,'gather');step(b.s,5);assert.equal(b.worker.order.type,'returnResources');assert.ok(S.restore(b.s));
 console.log('PASS lumber '+source+': source hashes/collision, damage point, capacity, backswing, falling tree, delivery and frame-identical saved continuation');
}
for(const [faction,kind] of [[1,'warmill'],[3,'graveyard']]){
 const {s,worker,hall}=lumberFixture(faction),builder=faction===3?S.spawn(s,'worker',0,-9,3):worker,r=S.lumberDepots.buildings[kind];Object.assign(builder,{x:-9,z:3,order:null});const gold=s.teams[0].gold,wood=s.teams[0].wood;
 assert.equal(command(s,builder,'build',{kind,x:-8,z:6}),null);const depot=s.units.find(u=>u.kind===kind);assert.ok(depot);assert.equal(s.teams[0].gold,gold-r.gold);assert.equal(s.teams[0].wood,wood);assert.equal(depot.maxHp,r.hp);assert.equal(S.resourceDepot(s,worker,depot),false);
 step(s,30);const copy=S.restore(s);for(let i=0;i<r.time*10+50;i++){S.tick(s);S.tick(copy);assert.deepEqual(s,copy);}assert.equal(depot.built,1);assert.equal(S.resourceDepot(s,worker,depot),true);
 hall.hp=0;Object.assign(worker,{x:depot.x-2,z:depot.z,cargo:3,cargoKind:'tree',order:{type:'gather',resource:0}});const income=s.teams[0].wood;assert.equal(command(s,worker,'returnResources',{target:depot.id}),null);step(s,1);assert.equal(s.teams[0].wood,income+3);assert.equal(worker.cargo,0);assert.equal(worker.order.type,'gather');assert.equal(worker.order.resource,0);
 const enemy=S.spawn(s,kind,1,8,8);assert.equal(S.resourceDepot(s,worker,enemy),false);s.units=s.units.filter(u=>u!==enemy);depot.hp=0;assert.equal(S.resourceDepot(s,worker,depot),false);worker.cargo=4;worker.cargoKind='tree';assert.ok(command(s,worker,'returnResources',{target:depot.id}));assert.equal(command(s,worker,'returnResources'),null);step(s,10);assert.equal(worker.cargo,4);assert.ok(S.restore(s));
 console.log('PASS lumber '+kind+': paid complete construction, source HP/time, unfinished/enemy/destroyed masks, partial return and no-depot retention');
}
{
 const {s,worker,tree,hall}=lumberFixture();s.units=s.units.filter(u=>u.id!==hall.id);command(s,worker,'gather',{resource:0});step(s,130);assert.equal(worker.cargo,10);assert.equal(worker.order.type,'returnResources');assert.equal(tree.hp,40);assert.ok(S.restore(s));
 const a=lumberFixture();command(a.s,a.worker,'gather',{resource:0});step(a.s,3);command(a.s,a.worker,'stop');step(a.s,10);assert.equal(a.worker.cargo,0);assert.equal(a.tree.hp,50);assert.equal(a.worker.lumberSwing,undefined);
 command(a.s,a.worker,'gather',{resource:0});step(a.s,3);a.worker.stun=1;step(a.s,5);assert.equal(a.worker.cargo,0);assert.equal(a.worker.lumberSwing,undefined);step(a.s,20);assert.ok(a.worker.cargo>0);
 const b=lumberFixture();b.worker.cargo=3;b.worker.cargoKind='tree';command(b.s,b.worker,'returnResources');assert.equal(command(b.s,b.worker,'move',{x:-15,z:0,append:true}),null);const copy=S.restore(b.s);for(let i=0;i<140;i++){S.tick(b.s);S.tick(copy);assert.deepEqual(b.s,copy);}assert.equal(b.worker.cargo,0);assert.ok(b.worker.x<-10,'Shift movement resumes after delivery');
 const c=lumberFixture();command(c.s,c.worker,'gather',{resource:0});step(c.s,3);c.s.visible[1].fill(true);const pub=S.publicState(c.s,1).units.find(u=>u.id===c.worker.id);for(const k of ['lumberCd','lumberSwing','cargo','cargoKind','waypoints'])assert.equal(pub[k],undefined);
 for(const field of ['lumberCd','lumberHarvester','lumberSwing']){const bad=S.clone(c.s),u=bad.units.find(v=>v.id===c.worker.id);u[field]=field==='lumberCd'?-1:field==='lumberHarvester'?'ugho':{resource:0,elapsed:4,hit:false};assert.throws(()=>S.restore(bad),/lumber/);}
}
{
 const {s,worker,tree}=lumberFixture();worker.x=-7;command(s,worker,'gather',{resource:0});step(s,250);assert.ok(s.teams[0].wood>10000,'moves through source tree approach and returns to depot');assert.ok(tree.hp<40);assert.ok(S.restore(s));
 const a=lumberFixture();a.tree.amount=1;command(a.s,a.worker,'gather',{resource:0});step(a.s,6);assert.equal(a.worker.cargo,1);assert.equal(a.tree.hp,0);assert.equal(a.tree.amount,0);assert.ok(a.tree.felled);
 const b=lumberFixture();command(b.s,b.worker,'gather',{resource:0});step(b.s,3);S.spawn(b.s,'soldier',1,b.worker.x,b.worker.z+.3,{damage:10000,order:{type:'attack',target:b.worker.id}});S.visibility(b.s);step(b.s,1);assert.equal(b.worker.hp,0);assert.equal(b.worker.lumberSwing,undefined);assert.equal(b.tree.hp,50);assert.ok(S.restore(b.s));
 const c=lumberFixture();command(c.s,c.worker,'gather',{resource:0});const hits=[];for(let i=0;i<35;i++){const hp=c.tree.hp;S.tick(c.s);if(c.tree.hp<hp)hits.push(c.s.frame);}assert.deepEqual(hits,[6,17,28]);
 console.log('PASS lumber actual approach/return movement, authored tree-stock limit, lethal interruption and 11-tick second-weapon interval');
}
for(const options of [{lumberHarvestVersion:0},{workerBalanceVersion:0},{economyVersion:0}]){const {s,worker}=lumberFixture(0,options);assert.equal(s.lumberHarvestVersion,0);assert.equal(worker.lumberHarvester,undefined);const raw=S.clone(s);delete raw.lumberHarvestVersion;assert.equal(S.restore(raw).lumberHarvestVersion,0);}
for(const value of [-1,2,null,'1'])assert.throws(()=>S.create('skirmish',{lumberHarvestVersion:value}),/lumber harvest/);
for(const mode of ['moba','td','rpg']){assert.equal(S.create(mode).lumberHarvestVersion,0);assert.throws(()=>S.create(mode,{lumberHarvestVersion:1}),/lumber harvest/);}
console.log('PASS lumber Stop/control interruption, no-base harvest, Shift, private work state, malformed saves and legacy/mode isolation');
