// Author: MiYu. Bounded movement queues, command interruption, save validation and privacy.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function game(){const map=S.defaultMap();map.terrain.fill(0);map.props=[];map.units=[];map.triggers=[];const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];return s;}
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
const command=(s,us,type,x,z,append=false)=>S.command(s,0,{type,ids:us.map(u=>u.id),x,z,append});
{
  const s=game(),u=S.spawn(s,'soldier',0,-15,-15);
  for(const [x,z,type] of [[-5,-15,'move'],[-5,5,'attackMove'],[12,5,'move']])assert.equal(command(s,[u],type,x,z,true),null);
  const expected=[S.clone(u.order),...S.clone(u.waypoints)];assert.equal(u.waypoints.length,2);const visited=[];
  for(let i=0;i<200;i++){const previous=u.order;S.tick(s);if(previous!==u.order&&previous)visited.push({x:u.x,z:u.z,type:previous.type});}
  assert.equal(visited.length,3);expected.forEach((p,i)=>assert.ok(S.distance(p,visited[i])<=.121));assert.equal(u.order,null);assert.deepEqual(u.waypoints,[]);
}
{
  const s=game(),us=Array.from({length:6},(_,i)=>S.spawn(s,i%2?'archer':'soldier',0,-17+i*2,-17));
  assert.equal(command(s,us,'move',-8,-8),null);assert.equal(command(s,us,'move',10,-8,true),null);assert.equal(command(s,us,'attackMove',10,12,true),null);
  const goals=us.map(u=>S.clone(u.waypoints.at(-1)));step(s,30);const restored=S.restore(s);step(s,300);step(restored,300);assert.deepEqual(s.units,restored.units);us.forEach((u,i)=>{assert.ok(S.distance(u,goals[i])<=.121);assert.equal(u.order,null);});
}
{
  const s=game(),u=S.spawn(s,'soldier',0,-12,-12),enemy=S.spawn(s,'worker',1,0,-12,{hp:20,damage:0,speed:0});
  command(s,[u],'attackMove',4,-12);command(s,[u],'move',4,8,true);let fought=false;
  for(let i=0;i<220;i++){S.tick(s);if(!fought&&enemy.hp<=0){fought=true;assert.equal(u.waypoints.length,1,'combat retains the later waypoint');}}
  assert.ok(fought);assert.ok(S.distance(u,{x:4,z:8})<=.121);assert.equal(u.order,null);
}
{
  const s=game(),us=[S.spawn(s,'soldier',0,-15,-15),S.spawn(s,'soldier',0,-12,-15)];command(s,us,'move',0,0);
  for(let i=0;i<8;i++)assert.equal(command(s,[us[0]],'move',i,10,true),null);
  let previous=S.clone(us);assert.match(command(s,us,'attackMove',2,2,true),/full/);assert.deepEqual(us,previous,'full member rejects entire group append');
  assert.match(S.command(s,0,{type:'move',ids:[us[1].id],x:2,z:2,append:'yes'}),/Only movement/);assert.deepEqual(us,previous);
  assert.equal(command(s,us,'stop'),null);assert.ok(us.every(u=>!u.order&&!u.waypoints.length));
  command(s,us,'move',0,0);command(s,us,'move',5,5,true);assert.equal(command(s,us,'move',-5,-5),null);assert.ok(us.every(u=>!u.waypoints.length));
  const worker=S.spawn(s,'worker',0,-10,0);s.resources=[{kind:'tree',x:-5,z:0,amount:100}];worker.order={type:'gather',resource:0};previous=S.clone(worker);assert.match(command(s,[worker],'move',10,0,true),/Issue a move/);assert.deepEqual(worker,previous);
}
{
  const s=game(),worker=S.spawn(s,'worker',0,0,0);s.teams[0].gold=2000;command(s,[worker],'move',5,0);command(s,[worker],'move',10,0,true);
  assert.equal(S.command(s,0,{type:'build',ids:[worker.id],kind:'farm',x:0,z:5}),null);assert.equal(worker.order.type,'construct');assert.deepEqual(worker.waypoints,[]);
  command(s,[worker],'move',5,0);command(s,[worker],'move',10,0,true);s.resources=[{kind:'tree',x:5,z:5,amount:100}];assert.equal(S.command(s,0,{type:'gather',ids:[worker.id],resource:0}),null);assert.deepEqual(worker.waypoints,[]);
}
{
  const s=game(),u=S.spawn(s,'hero',0,-10,-10,{heroClass:0});u.skills=[0,0,1,0];u.skillPoints=0;S.visibility(s);command(s,[u],'move',-6,-6);command(s,[u],'move',0,0,true);
  assert.equal(S.command(s,0,{type:'spell',ids:[u.id],slot:2,x:-7,z:-7}),null);assert.equal(u.order,null);assert.deepEqual(u.waypoints,[]);
  command(s,[u],'move',-6,-6);command(s,[u],'move',0,0,true);u.hp=1;u.speed=0;const enemy=S.spawn(s,'soldier',1,-7,-6);enemy.cd=0;S.visibility(s);step(s,1);assert.ok(u.hp<=0);assert.deepEqual(u.waypoints,[]);
}
{
  const s=game(),u=S.spawn(s,'soldier',0,-10,-10);command(s,[u],'move',0,0);command(s,[u],'attackMove',5,5,true);s.visible[1].fill(1);
  assert.equal(S.publicState(s,1).units[0].waypoints,undefined);assert.equal(S.publicState(s,0).units[0].waypoints.length,1);
  const legacy=S.clone(s);delete legacy.units[0].waypoints;assert.deepEqual(S.restore(legacy).units[0].waypoints,[]);
  for(const value of [null,{},Array(9).fill({type:'move',x:0,z:0}),[{type:'build',x:0,z:0}],[{type:'move',x:NaN,z:0}],[{type:'move',x:31,z:0}]]){const bad=S.clone(s);bad.units[0].waypoints=value;assert.throws(()=>S.restore(bad),/waypoint queue/);}
  const bad=S.clone(s);bad.units[0].order={type:'gather',resource:0};assert.throws(()=>S.restore(bad),/waypoint queue/);
}
console.log('PASS: ordered route arrival, group queues/save replay, eight-waypoint atomic limit, command/work/blink/death cancellation, busy rejection, legacy/malformed saves and opponent privacy');
