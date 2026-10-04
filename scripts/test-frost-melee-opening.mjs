// Author: MiYu. Untouched melee defaults, legal opening economy/construction and four-faction AI.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
for(let faction=0;faction<4;faction++){
 const s=S.create('skirmish',{factions:[faction,0],heroes:[2,0],ai:[false,false]}),own=()=>s.units.filter(u=>u.team===0),workers=own().filter(u=>u.kind==='worker');
 assert.equal(s.teams[0].gold,500);assert.equal(s.teams[0].wood,150);assert.equal(workers.length,faction===3?3:5);
 assert.deepEqual(own().map(u=>u.kind).sort(),(faction===3?['hall','hauntedmine','worker','worker','worker','ghoul']:['hall',...Array(5).fill('worker')]).sort());
 assert.ok(own().every(u=>u.order===null&&u.queue.length===0));assert.deepEqual(S.population(s,0),{used:5,cap:faction===0?12:10});
 const starting=S.clone(s);step(s,30);assert.equal(s.teams[0].gold,500);assert.equal(s.teams[0].wood,150);assert.deepEqual(S.restore(starting),starting);
 let miners=0;for(const u of own().filter(u=>['worker','ghoul'].includes(u.kind))){const kind=u.kind==='ghoul'?'tree':faction===3||miners++<3?'mine':'tree',resource=s.resources.findIndex(r=>r.kind===kind&&S.distance(u,r)<14);assert.ok(resource>=0);assert.equal(S.command(s,0,{type:'gather',ids:[u.id],resource}),null);}
 step(s,400);assert.ok(s.teams[0].gold>500);assert.ok(s.teams[0].wood>150);
 const worker=workers[0];assert.equal(S.command(s,0,{type:'build',ids:[worker.id],kind:'altar',x:-12,z:16}),null);step(s,250);
 const altar=own().find(u=>u.kind==='altar');assert.ok(altar);assert.equal(altar.built,1);assert.equal(own().filter(u=>u.kind==='worker').length,workers.length);
 const gold=s.teams[0].gold,wood=s.teams[0].wood;assert.equal(S.command(s,0,{type:'train',ids:[altar.id],kind:'hero',heroClass:2}),null);assert.equal(s.teams[0].gold,gold);assert.equal(s.teams[0].wood,wood);assert.equal(altar.queue[0].left,55);
 const restored=S.restore(s);step(s,551);step(restored,551);assert.deepEqual(restored,s);assert.equal(S.heroRoster(s,0).length,1);assert.equal(S.heroRoster(s,0)[0].heroClass,2);assert.deepEqual(S.heroRoster(s,0)[0].inventory,[8]);
 const ai=S.create('skirmish',{factions:[faction,0],heroes:[2,0],ai:[true,false]});step(ai,2000);const army=ai.units.filter(u=>u.team===0);
 for(const kind of ['altar','farm','barracks','hero'])assert.ok(army.some(u=>u.kind===kind&&u.built===1),'AI opening '+faction+' '+kind);
 assert.equal(army.find(u=>u.kind==='hero').heroClass,2);assert.ok(army.some(u=>S.armies[faction].units.includes(u.kind)));assert.ok(ai.resources.some((r,i)=>r.kind==='mine'&&r.amount<ai.map.props[i].amount));assert.ok(ai.resources.some((r,i)=>r.kind==='tree'&&r.amount<ai.map.props[i].amount));
}
const legacy=S.defaultMap();delete legacy.startingWood;assert.equal(S.validateMap(legacy).startingWood,150);
for(const [input,expected] of [[-10,0],[2020,2000],[152.7,153],[NaN,150]])assert.equal(S.validateMap({...S.defaultMap(),startingWood:input}).startingWood,expected);
for(const mode of ['moba','td','rpg'])assert.equal(S.create(mode).teams[0].wood,250);
const capped=S.create();for(let i=0;i<20;i++)S.spawn(capped,'farm',0,0,0);assert.equal(S.population(capped,0).cap,100);
console.log('PASS: actual four-faction idle starts, 500/150 resources, faction supply, explicit gathering, legal altars/free heroes, exact saves, preferred AI hero and full AI opening');
