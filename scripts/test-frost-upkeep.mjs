// Author: MiYu. Mining taxes, active production food, retained hero identity and save continuation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
import {upkeepFixture} from './frost-upkeep-fixture.mjs';
const tick=(s,n=1)=>{for(let i=0;i<n;i++)S.tick(s);},order=(s,u,type,args={})=>S.command(s,0,{type,ids:[u.id],...args});
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS',name);};
for(const [used,tier,percent] of [[0,0,100],[50,0,100],[51,1,70],[80,1,70],[81,2,40],[100,2,40]])check('upkeep boundary '+used,()=>{
 const {s}=upkeepFixture(0,used);assert.deepEqual(S.upkeep(s,0),{tier,percent});assert.equal(S.population(s,0).used,used);assert.equal(S.population(s,0).cap,100);
 const own=S.publicState(s,0);assert.deepEqual(S.upkeep(own,0),{tier,percent});assert.deepEqual(own.teams[1],{faction:s.teams[1].faction});
});
for(let faction=0;faction<4;faction++)for(const [used,percent] of [[50,100],[51,70],[81,40]])check('mining faction '+faction+' food '+used,()=>{
 const {s,hall,workers}=upkeepFixture(faction,used),w=workers[0];let gross;
 if(faction<2){Object.assign(w,{x:hall.x+3,z:hall.z,cargo:20,cargoKind:'mine',order:{type:'gather',resource:0}});gross=20;}
 else if(faction===3){S.spawn(s,'hauntedmine',0,0,0);Object.assign(w,S.minePoint(s.resources[0],0));S.visibility(s);assert.equal(order(s,w,'gather',{resource:0}),null);gross=10;}
 else{S.startEntangle(s,hall,s.resources[0],true);Object.assign(w,S.minePoint(s.resources[0],0));S.visibility(s);assert.equal(order(s,w,'gather',{resource:0}),null);tick(s);gross=10;}
 S.visibility(s);const before=s.teams[0].gold,remaining=s.resources[0].amount,copy=S.restore(s);tick(s,faction===2?50:1);tick(copy,faction===2?50:1);
 assert.equal(s.teams[0].gold-before,gross*percent/100);assert.equal(remaining-s.resources[0].amount,faction<2?0:gross);assert.deepEqual(s,copy);
});
check('lumber, cancel refund and tax at delivery',()=>{
 const {s,hall,workers}=upkeepFixture(0,81),w=workers[0],wood=s.teams[0].wood;Object.assign(w,{x:hall.x+3,z:hall.z,cargo:20,cargoKind:'tree',order:{type:'gather',resource:1}});tick(s);assert.equal(s.teams[0].wood,wood+20);
 const gold=s.teams[0].gold;assert.equal(order(s,hall,'train',{kind:'worker'}),null);assert.equal(order(s,hall,'cancelTrain',{index:0}),null);assert.equal(s.teams[0].gold,gold);
 for(const v of workers.slice(50))v.hp=0;Object.assign(w,{cargo:20,cargoKind:'mine',order:{type:'gather',resource:0}});tick(s);assert.equal(s.teams[0].gold,gold+20,'tax uses current food when gold is delivered');
});
check('active queue food, supply blocked promotion and cancellation',()=>{
 const {s,hall,workers}=upkeepFixture(0,17);s.units=s.units.filter(u=>u.kind!=='farm');S.spawn(s,'farm',0,-8,-8);assert.equal(S.population(s,0).cap,18);
 for(let i=0;i<3;i++)assert.equal(order(s,hall,'train',{kind:'worker'}),null);assert.equal(S.population(s,0).used,18);assert.equal(hall.queue[0].foodReserved,true);assert.equal(hall.queue[1].foodReserved,undefined);
 hall.queue[0].left=.1;tick(s);assert.equal(hall.queue.length,2);assert.equal(S.population(s,0).used,18);const left=hall.queue[0].left;tick(s,3);assert.equal(hall.queue[0].left,left);
 const copy=S.restore(s);workers[1].hp=0;copy.units.find(u=>u.id===workers[1].id).hp=0;tick(s);tick(copy);assert.equal(hall.queue[0].foodReserved,true);assert.deepEqual(s,copy);
 assert.equal(order(s,hall,'cancelTrain',{index:0}),null);assert.equal(hall.queue[0].foodReserved,true);assert.equal(S.population(s,0).used,18);
 const supply=s.units.find(u=>u.kind==='farm');supply.hp=0;const before=hall.queue[0].left;tick(s);assert.ok(hall.queue[0].left<before,'started production continues after losing supply');
});
check('hero death, waiting revival, cancellation and completion',()=>{
 const {s,hall,workers}=upkeepFixture(0,50),altar=S.spawn(s,'altar',0,0,-12),h=S.spawn(s,'hero',0,8,-12,{hp:0,order:null});assert.equal(S.population(s,0).used,50);assert.equal(order(s,altar,'revive',{target:h.id}),null);assert.equal(S.population(s,0).used,55);assert.deepEqual(S.upkeep(s,0),{tier:1,percent:70});
 assert.equal(order(s,altar,'cancelTrain',{index:0}),null);assert.equal(S.population(s,0).used,50);assert.equal(h.hp,0);
 assert.equal(order(s,altar,'revive',{target:h.id}),null);altar.queue[0].left=.1;tick(s);assert.ok(h.hp>0);assert.equal(S.population(s,0).used,55);
 h.hp=0;s.units=s.units.filter(u=>u.kind!=='farm');assert.match(order(s,altar,'revive',{target:h.id}),/supply/);assert.equal(altar.queue.length,0);assert.ok(workers.length&&hall.hp>0);
});
check('research head and queued recruit cross the tax boundary on promotion',()=>{
 const {s,hall}=upkeepFixture(2,50);hall.upgradeTier=2;S.updateTechnology(s);assert.equal(order(s,hall,'naturesBlessing'),null);assert.equal(order(s,hall,'train',{kind:'worker'}),null);assert.equal(S.population(s,0).used,50);assert.equal(S.upkeep(s,0).percent,100);
 hall.queue[0].left=.1;const copy=S.restore(s);tick(s);tick(copy);assert.deepEqual(s,copy);assert.equal(hall.queue[0].kind,'worker');assert.equal(hall.queue[0].foodReserved,true);assert.equal(S.population(s,0).used,51);assert.equal(S.upkeep(s,0).percent,70);
});
check('queued revival reserves only when its altar head starts',()=>{
 const {s,hall}=upkeepFixture(0,50);hall.upgradeTier=2;S.updateTechnology(s);const altar=S.spawn(s,'altar',0,0,-12),h=S.spawn(s,'hero',0,8,-12,{heroClass:1,hp:0,order:null});assert.equal(order(s,altar,'train',{kind:'hero',heroClass:0}),null);assert.equal(order(s,altar,'revive',{target:h.id}),null);assert.equal(S.population(s,0).used,55);assert.equal(altar.queue[1].foodReserved,undefined);
 altar.queue[0].left=.1;tick(s);assert.equal(altar.queue[0].revive,h.id);assert.equal(altar.queue[0].foodReserved,true);assert.equal(S.population(s,0).used,60);assert.equal(order(s,altar,'cancelTrain',{index:0}),null);assert.equal(S.population(s,0).used,55);assert.equal(h.hp,0);
});
check('integer mineral tail, legacy saves and malformed reservations',()=>{
 const {s,workers}=upkeepFixture(3,51),w=workers[0];S.spawn(s,'hauntedmine',0,0,0);Object.assign(w,S.minePoint(s.resources[0],0));s.resources[0].amount=5;S.visibility(s);assert.equal(order(s,w,'gather',{resource:0}),null);const gold=s.teams[0].gold;tick(s);assert.equal(s.teams[0].gold,gold+3,'project policy: floor each mining deposit');assert.equal(s.resources[0].amount,0);
 const old=S.clone(s);delete old.upkeepVersion;const legacy=S.restore(old);assert.equal(legacy.upkeepVersion,0);assert.equal(S.upkeep(legacy,0).percent,100);assert.equal(S.restore(legacy).upkeepVersion,0);
 for(const bad of [-1,2,'1',null]){assert.throws(()=>S.create('skirmish',{upkeepVersion:bad}),/upkeep/);const save=S.clone(s);save.upkeepVersion=bad;assert.throws(()=>S.restore(save),/upkeep/);}
 const {s:queued,hall}=upkeepFixture(0,50);assert.equal(order(queued,hall,'train',{kind:'worker'}),null);assert.equal(order(queued,hall,'train',{kind:'worker'}),null);
 for(const mutate of [q=>q.foodReserved=false,q=>q.foodReserved=1,q=>q.foodReserved=undefined]){const bad=S.clone(queued);mutate(bad.units.find(u=>u.id===hall.id).queue[0]);bad.units.find(u=>u.id===hall.id).queue[0].left=.1;assert.throws(()=>S.restore(bad),/production/);}
 const bad=S.clone(queued);bad.units.find(u=>u.id===hall.id).queue[1].foodReserved=true;assert.throws(()=>S.restore(bad),/reservation/);
});
for(const mode of ['td','moba','rpg'])check(mode+' remains untaxed',()=>{const s=S.create(mode);assert.equal(S.upkeep(s,0).percent,100);assert.equal(S.restore(s).mode,mode);});
console.log('PASS upkeep: '+checks+' checks');
