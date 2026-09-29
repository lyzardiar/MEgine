// Author: MiYu. Hold-position range rules and persistent, interruptible patrol routes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function game(map=S.defaultMap()){map=S.clone(map);map.terrain.fill(0);map.props=[];map.units=[];map.triggers=[];const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];s.resources=[];return s;}
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
const order=(s,us,type,x,z)=>S.command(s,0,{type,ids:us.map(u=>u.id),x,z});
{
  const s=game(),u=S.spawn(s,'soldier',0,-10,-10),enemy=S.spawn(s,'worker',1,-5,-10,{damage:0,speed:0});
  order(s,[u],'move',0,0);S.command(s,0,{type:'move',ids:[u.id],x:5,z:5,append:true});assert.equal(order(s,[u],'hold'),null);assert.deepEqual(u.waypoints,[]);S.visibility(s);step(s,20);
  assert.deepEqual([u.x,u.z],[-10,-10]);assert.equal(enemy.hp,enemy.maxHp,'hold never chases a target outside attack range');
  enemy.x=-8.5;step(s,1);assert.ok(enemy.hp<enemy.maxHp);assert.deepEqual([u.x,u.z],[-10,-10]);
  enemy.x=-5;assert.equal(order(s,[u],'stop'),null);step(s,4);assert.ok(u.x>-10,'stop releases hold and normal auto-acquisition can chase');
}
{
  const s=game(),u=S.spawn(s,'archer',0,-10,-10),hall=S.spawn(s,'hall',1,0,-10,{damage:0});s.visible[0].fill(1);
  assert.equal(order(s,[u],'hold'),null);step(s,1);assert.equal(s.projectiles.length,1,'building radius allows release at the edge of weapon range');step(s,5);assert.ok(hall.hp<hall.maxHp,'projectile reaches the building');assert.deepEqual([u.x,u.z],[-10,-10]);
}
{
  const s=game(),u=S.spawn(s,'archer',0,-1,-1),enemy=S.spawn(s,'worker',1,1,-1,{damage:0,speed:0});s.map.heights[S.index(enemy.x,enemy.z)]=3;S.visibility(s);order(s,[u],'hold');step(s,5);assert.equal(enemy.hp,enemy.maxHp,'hold respects line of fire across a cliff');assert.equal(u.x,-1);
}
{
  const s=game(),us=Array.from({length:6},(_,i)=>S.spawn(s,i%2?'archer':'soldier',0,-18+i*2,-18)),starts=us.map(u=>[u.x,u.z]);
  assert.equal(order(s,us,'patrol',-10,-4),null);const ends=us.map(u=>[u.order.x,u.order.z]),visits=us.map(()=>({start:0,end:0}));
  const scan=()=>us.forEach((u,i)=>{if(Math.hypot(u.x-starts[i][0],u.z-starts[i][1])<.2)visits[i].start++;if(Math.hypot(u.x-ends[i][0],u.z-ends[i][1])<.2)visits[i].end++;});
  step(s,30);const restored=S.restore(s);for(let i=0;i<360;i++){S.tick(s);S.tick(restored);scan();}assert.deepEqual(s.units,restored.units);assert.ok(visits.every(v=>v.start>1&&v.end>1),'all formation members repeatedly visit both endpoints');
  assert.ok(us.every(u=>u.order.type==='patrol'));s.visible[1].fill(1);assert.ok(S.publicState(s,1).units.every(u=>u.order===null));
  assert.match(S.command(s,0,{type:'move',ids:[us[0].id],x:0,z:0,append:true}),/Finish this order/);assert.equal(order(s,us,'move',-10,-10),null);assert.ok(us.every(u=>u.order.type==='move'&&!('fromX' in u.order)));
}
{
  const s=game(),u=S.spawn(s,'soldier',0,-10,-10),enemy=S.spawn(s,'worker',1,-4,-10,{hp:20,damage:0,speed:0});order(s,[u],'patrol',2,-10);let returned=false;
  for(let i=0;i<150;i++){S.tick(s);if(i>35&&u.x<-9.8)returned=true;}assert.equal(enemy.hp,0);assert.ok(returned,'patrol returns after engaging an enemy');assert.equal(u.order.type,'patrol');
}
{
  const map=S.highlandMap(),s=game(map),u=S.spawn(s,'soldier',0,-17,7);order(s,[u],'patrol',-5,7);let upper=false,lowerAgain=false;
  for(let i=0;i<160;i++){S.tick(s);if(S.unitHeight(s,u)>=2)upper=true;if(upper&&u.x<-16.8)lowerAgain=true;}assert.ok(upper&&lowerAgain,'patrol climbs and descends a real ramp');
}
{
  const s=game(),u=S.spawn(s,'creep',0,0,0,{route:[[0,0],[15,0]],waypoint:1,home:[-15,0]});order(s,[u],'hold');step(s,30);assert.deepEqual([u.x,u.z],[0,0],'hold suspends automatic lanes and home return');
  const restored=S.restore(s);step(restored,30);assert.deepEqual([restored.units[0].x,restored.units[0].z],[0,0]);
  for(const bad of [{type:'patrol',x:0,z:0},{type:'patrol',x:0,z:0,fromX:31,fromZ:0},{type:'patrol',x:NaN,z:0,fromX:0,fromZ:0}]){const save=S.clone(s);save.units[0].order=bad;assert.throws(()=>S.restore(save),/patrol or hold/);}
  const building=S.spawn(s,'barracks',0,20,20);assert.equal(order(s,[building],'hold'),null);assert.equal(building.order,null);assert.equal(order(s,[u],'patrol',NaN,0),'Invalid destination');
}
console.log('PASS: stationary hold combat/range/occlusion, stop release, six-unit patrol roundtrips/save replay, combat resumption, ramps, route overrides, privacy and invalid saves');
