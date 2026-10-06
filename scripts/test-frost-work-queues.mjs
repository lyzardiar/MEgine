// Author: MiYu. Worker command queues, deferred construction, saved work and faction lifecycles.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function game(faction=0){const map=S.defaultMap();map.terrain.fill(0);map.heights.fill(0);map.relief.fill(0);map.ramps.fill(0);map.props=[];map.units=[];map.triggers=[];const s=S.create('skirmish',{map,ai:[false,false],factions:[faction,0]});s.entangledVersion=0;s.units=[];s.resources=[{kind:'mine',x:-10,z:-8,amount:1000}];s.teams[0].gold=2000;s.teams[0].wood=2000;const hall=S.spawn(s,'hall',0,-15,0),w=S.spawn(s,'worker',0,-10,0);if(faction===3)S.spawn(s,'hauntedmine',0,-10,-8);S.visibility(s);return {s,w,hall};}
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);},order=(s,w,type,args={})=>S.command(s,0,{type,ids:[w.id],...args}),ok=(s,w,type,args)=>assert.equal(order(s,w,type,args),null);
for(let f=0;f<4;f++){
 const {s,w}=game(f);ok(s,w,'build',{kind:'farm',x:-5,z:3});const gold=s.teams[0].gold,serial=s.serial;ok(s,w,'build',{kind:'farm',x:2,z:3,append:true});ok(s,w,'gather',{resource:0,append:true});assert.equal(s.serial,serial);assert.equal(s.teams[0].gold,gold,'queued foundation costs nothing yet');assert.deepEqual(w.waypoints.map(o=>o.type),['build','gather']);step(s,10);const saved=S.restore(s);step(s,450);step(saved,450);assert.deepEqual(s.units,saved.units);assert.deepEqual(s.teams,saved.teams);assert.equal(s.units.filter(u=>u.kind==='farm'&&u.built===1).length,2);assert.equal(w.order.type,'gather');assert.equal(w.waypoints.length,0);assert.ok(s.resources[0].amount<1000);assert.ok(s.teams[0].gold>=gold-S.types.farm.gold+20,'completed jobs resume delivering resources');
}
{
 const {s,w}=game();ok(s,w,'gather',{resource:0});ok(s,w,'move',{x:-5,z:-5,append:true});const gold=s.teams[0].gold;step(s,200);assert.equal(s.teams[0].gold,gold+20,'queued gathering finishes exactly one delivery');assert.equal(w.order,null);assert.ok(S.distance(w,{x:-5,z:-5})<.13);
 ok(s,w,'build',{kind:'farm',x:0,z:0});ok(s,w,'build',{kind:'farm',x:24,z:0,append:true});step(s,400);assert.equal(s.units.filter(u=>u.kind==='farm'&&u.built===1).length,2,'far queued site walks into construction range');assert.doesNotThrow(()=>S.restore(s));
}
{
 const {s,w,hall}=game();hall.hp-=80;ok(s,w,'move',{x:-8,z:-3});ok(s,w,'repair',{target:hall.id,append:true});ok(s,w,'gather',{resource:0,append:true});step(s,400);assert.equal(hall.hp,hall.maxHp);assert.equal(w.order.type,'gather');
 ok(s,w,'build',{kind:'farm',x:-5,z:3});ok(s,w,'gather',{resource:0,append:true});const b=s.units.at(-1);ok(s,b,'cancelBuild');assert.equal(w.order.type,'gather');assert.equal(w.waypoints.length,0);
}
{
 const {s,w}=game(1);ok(s,w,'build',{kind:'farm',x:-5,z:3});step(s,30);assert.ok(w.inside);ok(s,w,'build',{kind:'farm',x:2,z:3,append:true});ok(s,w,'gather',{resource:0,append:true});const saved=S.restore(s);step(s,350);step(saved,350);assert.deepEqual(s.units,saved.units);assert.equal(w.order.type,'gather');assert.ok(!w.inside);
}
{
 const {s,w}=game(2);ok(s,w,'build',{kind:'barracks',x:-5,z:3});ok(s,w,'gather',{resource:0,append:true});step(s,30);assert.ok(w.consumed);assert.equal(w.waypoints.length,0);assert.match(order(s,w,'build',{kind:'farm',x:2,z:3,append:true}),/worker/);assert.doesNotThrow(()=>S.restore(s));step(s,150);assert.ok(!s.units.includes(w));
}
{
 const {s,w}=game();ok(s,w,'move',{x:-8,z:-3});ok(s,w,'build',{kind:'farm',x:-5,z:3,append:true});ok(s,w,'gather',{resource:0,append:true});S.spawn(s,'tower',0,-5,3);const gold=s.teams[0].gold;step(s,80);assert.equal(s.units.filter(u=>u.kind==='farm').length,0);assert.match(s.announcements[0],/Queued build skipped/);assert.ok(s.teams[0].gold>=gold);assert.equal(w.order.type,'gather');
 const w2=S.spawn(s,'worker',0,-12,5);ok(s,w2,'move',{x:-8,z:5});for(let i=0;i<8;i++)ok(s,w2,'gather',{resource:0,append:true});const before=S.clone(s);assert.match(S.command(s,0,{type:'gather',ids:[w.id,w2.id],resource:0,append:true}),/full/);assert.deepEqual(s,before);ok(s,w2,'stop');assert.deepEqual(w2.waypoints,[]);
}
{
 const {s,w,hall}=game();ok(s,w,'move',{x:-8,z:-3});ok(s,w,'build',{kind:'farm',x:-5,z:3,append:true});ok(s,w,'gather',{resource:0,append:true});s.visible[1].fill(1);assert.equal(S.publicState(s,1).units.find(u=>u.id===w.id).waypoints,undefined);assert.equal(S.publicState(s,0).units.find(u=>u.id===w.id).waypoints.length,2);
 for(const edit of [u=>u.waypoints[0].kind='constructor',u=>u.waypoints[0].x=31,u=>u.waypoints[1].resource=-1,u=>u.waypoints[1]={type:'repair',target:s.serial+1},u=>u.kind='soldier',u=>u.order={type:'build',kind:'constructor',x:0,z:0}]){const bad=S.clone(s);edit(bad.units.find(u=>u.id===w.id));assert.throws(()=>S.restore(bad),/waypoint queue/);}
}
{
 const {s,w,hall}=game();hall.built=.5;ok(s,w,'gather',{resource:0});ok(s,w,'move',{x:-5,z:-5,append:true});step(s,100);assert.equal(w.order,null);assert.match(s.announcements[0],/no completed stronghold/);
 const idle=game();const gold=idle.s.teams[0].gold;ok(idle.s,idle.w,'build',{kind:'farm',x:24,z:0,append:true});assert.equal(idle.s.teams[0].gold,gold);assert.equal(idle.w.order.type,'build');step(idle.s,400);assert.equal(idle.s.units.filter(u=>u.kind==='farm'&&u.built===1).length,1);
 const inside=game(1);ok(inside.s,inside.w,'build',{kind:'farm',x:-5,z:3});step(inside.s,30);assert.ok(inside.w.inside);ok(inside.s,inside.w,'move',{x:3,z:-5,append:true});step(inside.s,200);assert.equal(inside.w.order,null);assert.ok(S.distance(inside.w,{x:3,z:-5})<.13);
 const poor=game();ok(poor.s,poor.w,'move',{x:-8,z:-3});ok(poor.s,poor.w,'build',{kind:'farm',x:-5,z:3,append:true});ok(poor.s,poor.w,'gather',{resource:0,append:true});poor.s.teams[0].gold=0;step(poor.s,30);assert.match(poor.s.announcements[0],/Not enough resources/);assert.equal(poor.w.order.type,'gather');
}
console.log('PASS: four-faction queued construction, deferred payment, gathering delivery, distant site, repair/cancel, inside worker, consumed worker, invalid site skip, queue capacity/privacy and exact save replay');
