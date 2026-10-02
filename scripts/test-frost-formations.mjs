// Author: MiYu. Real marching, arrival, terrain fallback and saved formation orders.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function game(map=S.defaultMap()){
  map=S.clone(map);map.props=[];map.units=[];map.triggers=[];
  const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];s.map.relief.fill(0);return s;
}
function flat(){const m=S.defaultMap();m.terrain.fill(0);m.heights.fill(0);m.relief.fill(0);m.ramps.fill(0);return game(m);}
const advance=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
const issue=(s,us,x,z,type='move')=>S.command(s,0,{type,ids:us.map(u=>u.id),x,z});
const goals=us=>us.map(u=>({id:u.id,x:u.order.x,z:u.order.z}));
function arrived(s,targets){for(const p of targets){const u=s.units.find(u=>u.id===p.id);assert.ok(S.distance(u,p)<=.121,JSON.stringify({id:u.id,position:[u.x,u.z],target:p,order:u.order}));assert.equal(u.order,null);}}
{
  const s=flat(),u=S.spawn(s,'worker',0,-8,-8);assert.equal(issue(s,[u],4.3,6.7),null);assert.deepEqual([u.order.x,u.order.z],[4.3,6.7]);
  advance(s,90);assert.ok(S.distance(u,{x:4.3,z:6.7})<=.121,'single unit reaches the actual clicked point');assert.equal(u.order,null);
}
{
  const s=flat(),us=Array.from({length:40},(_,i)=>S.spawn(s,['soldier','archer','knight','catapult'][i%4],0,-23+i%8*2,-23+Math.floor(i/8)*2));
  const reversed=S.restore(s);assert.equal(issue(s,us,12,12),null);assert.equal(issue(reversed,[...reversed.units].reverse(),12,12),null);assert.deepEqual(goals(us),goals(reversed.units),'selection order does not alter assignments');
  const target=goals(us);for(let i=0;i<us.length;i++)for(let j=0;j<i;j++)assert.ok(S.distance(target[i],target[j])>1.29,'distinct arrival slots');
  advance(s,45);const restored=S.restore(s);advance(s,500);advance(restored,500);arrived(s,target);arrived(restored,target);assert.deepEqual(s.units,restored.units,'mid-march saves retain exact movement');
  const melee=us.filter(u=>S.unitType(u).range<4),ranged=us.filter(u=>S.unitType(u).range>=4),front=units=>units.reduce((n,u)=>n+u.x+u.z,0)/units.length;assert.ok(front(melee)>front(ranged),'melee rows lead ranged rows');
  const enemy=S.spawn(s,'worker',1,24,-24),building=S.spawn(s,'barracks',0,-20,20);assert.equal(issue(s,[enemy,building],0,0),null);assert.equal(enemy.order,null);assert.equal(building.order,null);
}
{
  const s=flat(),block=S.spawn(s,'barracks',0,5,5),idle=S.spawn(s,'soldier',0,9,5),us=Array.from({length:8},(_,i)=>S.spawn(s,'soldier',0,-11+i*1.5,-5));
  assert.equal(issue(s,us,block.x,block.z),null);const target=goals(us);assert.ok(target.every(p=>!S.solid(s,p.x,p.z)&&S.distance(p,idle)>1.29));advance(s,180);arrived(s,target);
}
{
  const s=game(S.highlandMap()),us=Array.from({length:6},(_,i)=>S.spawn(s,'soldier',0,-19-i%3*2,5+Math.floor(i/3)*2));
  assert.equal(issue(s,us,-5,7),null);const target=goals(us);advance(s,160);arrived(s,target);assert.ok(us.every(u=>S.elevation(s.map,u.x,u.z)>=2),'formation ascends the ramp');
}
{
  const m=S.highlandMap();m.ramps.fill(0);const s=game(m),us=Array.from({length:6},(_,i)=>S.spawn(s,'soldier',0,-19-i%3*2,5+Math.floor(i/3)*2));
  assert.equal(issue(s,us,-5,7),null);const target=goals(us);assert.ok(target.every(p=>S.elevation(s.map,p.x,p.z)===0),'sealed plateau resolves to reachable low ground');advance(s,220);arrived(s,target);
}
{
  const s=flat();for(let z=0;z<32;z++)for(let x=15;x<=17;x++)s.map.terrain[z*32+x]=1;
  const ground=S.spawn(s,'soldier',0,-10,5),fly=S.spawn(s,'dragon',0,-10,5);assert.equal(issue(s,[ground,fly],12,5),null);const target=goals([ground,fly]);assert.ok(ground.order.x<0);assert.equal(fly.order.x,12);advance(s,120);arrived(s,target);
}
{
  const s=flat(),us=Array.from({length:12},(_,i)=>S.spawn(s,'soldier',0,-10+i%4*2,-10+Math.floor(i/4)*2));assert.equal(issue(s,us,30,30,'attackMove'),null);const target=goals(us);assert.ok(target.every(p=>Math.abs(p.x)<=30&&Math.abs(p.z)<=30));advance(s,420);arrived(s,target);
}
{
  const s=flat();s.map.terrain.fill(1);s.map.terrain[S.index(1,1)]=0;const us=Array.from({length:8},()=>S.spawn(s,'soldier',0,1,1));
  const before=S.clone(us);assert.match(issue(s,us,12,12),/No reachable space/);assert.deepEqual(us,before,'failed allocation leaves all previous orders untouched');
}
{
  const s=flat(),u=S.spawn(s,'worker',0,-23,23),hall=S.spawn(s,'hall',1,23,-23);hall.damage=0;u.damage=0;S.visibility(s);
  const empty=S.restore(s);empty.units=empty.units.filter(v=>v.id!==hall.id);assert.equal(S.isVisible(s,0,hall),false);
  assert.equal(issue(s,[u],hall.x,hall.z),null);assert.equal(issue(empty,empty.units,hall.x,hall.z),null);
  assert.deepEqual(u.order,empty.units[0].order,'hidden buildings do not disclose their footprint through assigned orders');
  advance(s,15);advance(empty,15);assert.deepEqual(S.publicState(s,0).units,S.publicState(empty,0).units,'owned positions, paths and orders do not expose distant hidden obstacles');
  advance(s,300);assert.equal(u.order,null,'newly revealed occupied goal resolves to a reachable arrival');assert.ok(!S.solid(s,u.x,u.z));assert.ok(S.distance(u,hall)>2.8&&S.distance(u,hall)<5);
}
console.log('PASS: exact single movement, 40-unit mixed formation arrival, selection determinism/save restore, rows, blockers, ramps, sealed cliffs, air/ground, edge bounds and atomic rejection');
