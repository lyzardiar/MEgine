// Author: MiYu. Real tree footprints, harvesting passages, placement, fog knowledge and save replay.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import net from 'node:net';
import {createServer} from '../samples/frostbound-realms/server.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
function fixture(wall=true,tileset=1){
  const map=S.defaultMap();map.tileset=tileset;for(const field of ['terrain','heights','relief','ramps'])map[field].fill(0);map.props=wall?Array.from({length:30},(_,i)=>({kind:'tree',x:0,z:-29+i*2,amount:100})):[{kind:'tree',x:0,z:1,amount:100}];map.units=[];map.triggers=[];map.players.forEach(p=>p.ai=false);
  const s=S.create('skirmish',{map,ai:[false,false]});s.units=[];S.spawn(s,'hall',0,-20,12);S.spawn(s,'hall',1,20,-20);S.visibility(s);return s;
}
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
for(const tileset of [0,1,2]){
  const s=fixture(true,tileset),unit=S.spawn(s,'soldier',0,-5,1),worker=S.spawn(s,'worker',0,-2,1),flyer=S.spawn(s,'dragon',0,-5,6);S.visibility(s);
  for(let i=0;i<s.resources.length;i++){const r=s.resources[i];assert.equal(S.resourceAt(s,r.x,r.z,0),i,'dense forest picks the closest tree, regardless of list order');}
  assert.equal(S.walkClear(s,unit,5,1),false);assert.equal(S.walkClear(s,flyer,5,6),true);assert.ok(S.solid(s,0,1));assert.equal(S.buildingSite(s,0,1,S.types.farm.radius),false);
  assert.equal(S.command(s,0,{type:'move',ids:[unit.id],x:5,z:1}),null);assert.equal(S.command(s,0,{type:'move',ids:[flyer.id],x:5,z:6}),null);step(s,60);assert.ok(unit.x<0,'sealed forest blocks ground passage');assert.ok(flyer.x>4,'air unit crosses forest');
  const money=s.teams[0].gold;assert.match(S.command(s,0,{type:'build',ids:[worker.id],kind:'farm',x:0,z:1}),/clear flat dry/);assert.equal(s.teams[0].gold,money);assert.equal(worker.order,null,'blocked site rejects without changing order');
  const ri=s.resources.findIndex(r=>r.z===1),tree=s.resources[ri];tree.amount=5;assert.equal(S.command(s,0,{type:'gather',ids:[worker.id],resource:ri}),null);step(s,1);
  assert.equal(tree.amount,0);assert.ok(tree.felled);assert.ok(s.clearedResources[0].includes(ri));assert.equal(S.treeClear(s,-2,1,2,1,S.movementRadius(unit),0),true,'depletion opens cached passage in the same simulation frame');
  assert.equal(S.command(s,0,{type:'move',ids:[unit.id],x:5,z:1}),null);const saved=S.restore(s);step(s,60);step(saved,60);assert.ok(unit.x>4,'movement command crosses the harvested opening');assert.deepEqual(saved.resources,s.resources);assert.deepEqual(saved.clearedResources,s.clearedResources);assert.deepEqual(saved.units,s.units,'save replay preserves opened route');
  assert.equal(S.buildingSite(s,0,1,S.types.farm.radius),false,'walking gap still needs more clearing for a building');
  for(const i of [ri-1,ri+1]){s.resources[i].amount=5;worker.x=-2;worker.z=1;assert.equal(S.command(s,0,{type:'gather',ids:[worker.id],resource:i}),null);step(s,20);assert.equal(s.resources[i].amount,0);}
  assert.equal(S.buildingSite(s,0,1,S.types.farm.radius),true);S.command(s,0,{type:'stop',ids:[worker.id]});worker.x=-2;worker.z=1;S.visibility(s);assert.equal(S.command(s,0,{type:'build',ids:[worker.id],kind:'farm',x:0,z:1}),null,'cleared site admits a real construction command');
}
{
  const s=fixture(false),tree=s.resources[0],unit=S.spawn(s,'soldier',0,-5,1);S.visibility(s);S.command(s,0,{type:'move',ids:[unit.id],x:5,z:1});const track=[];for(let i=0;i<80;i++){S.tick(s);track.push([unit.x,unit.z]);assert.ok(Math.hypot(unit.x-tree.x,unit.z-tree.z)>=S.TREE_RADIUS+S.movementRadius(unit)-1e-6,'ground unit never cuts the trunk footprint');}assert.ok(unit.x>4);assert.ok(track.some(([x,z])=>Math.abs(z-1)>1.2),'movement detours around isolated tree');
  for(const kind of ['soldier','knight','ballista']){const r=S.movementRadius({kind}),start={kind,team:0,x:-3,z:1};assert.equal(S.walkClear(s,start,3,1),false);assert.equal(S.treeClear(s,-3,1+S.TREE_RADIUS+r+.01,3,1+S.TREE_RADIUS+r+.01,r,0),true);assert.equal(S.treeClear(s,-3,1+S.TREE_RADIUS+r-.01,3,1+S.TREE_RADIUS+r-.01,r,0),false);}
  const trapped=S.spawn(s,'worker',0,tree.x,tree.z);S.command(s,0,{type:'move',ids:[trapped.id],x:-5,z:1});step(s,30);assert.ok(Math.hypot(trapped.x-tree.x,trapped.z-tree.z)>S.TREE_RADIUS+S.movementRadius(trapped),'old embedded unit can escape without crossing a second trunk');
  assert.equal(S.treeClear(s,-3,1,3,1,0,-1),false,'long swept check blocks tunneling');
}
{
  const s=fixture(false),worker=S.spawn(s,'worker',0,-2,1),observer=S.spawn(s,'soldier',1,22,-22),tree=s.resources[0];tree.amount=5;S.visibility(s);S.command(s,0,{type:'gather',ids:[worker.id],resource:0});S.tick(s);assert.deepEqual(s.clearedResources,[[0],[]]);
  assert.equal(S.publicState(s,1).resources[0].amount,1,'unseen depletion stays private');assert.deepEqual(S.publicState(s,1).clearedResources,[[],[]]);assert.equal(S.treeClear(s,-2,1,2,1,.5,1),false,'unaware team does not route through a secret opening');assert.equal(S.treeClear(s,-2,1,2,1,.5,-1),true,'physical authority knows the opening');
  const unaware=S.spawn(s,'worker',1,22,-20);assert.equal(S.command(s,1,{type:'gather',ids:[unaware.id],resource:0}),null,'gather request does not reveal unseen depletion');S.tick(s);assert.equal(unaware.order.resource,0,'gatherer approaches before learning depletion');assert.equal(S.resourceAvailable(s,0,1),true);assert.equal(S.resourceAvailable(s,0,0),false);
  observer.x=0;observer.z=4;S.visibility(s);assert.deepEqual(s.clearedResources,[[0],[0]]);observer.x=22;observer.z=-22;S.visibility(s);const view=S.publicState(s,1);assert.equal(view.resources[0].amount,0);assert.equal(view.resources[0].felled,undefined);assert.deepEqual(view.clearedResources,[[],[0]]);assert.equal(S.treeClear(s,-2,1,2,1,.5,1),true,'discovered opening remains known after vision leaves');
  const restored=S.restore(s);assert.deepEqual(restored.clearedResources,s.clearedResources);const legacy=S.clone(s);delete legacy.clearedResources;const old=S.restore(legacy);assert.ok(old.clearedResources[0].includes(0));assert.deepEqual(old.clearedResources[1],[],'legacy migration learns only currently visible depletion');
  for(const value of [null,[],[[0,0],[]],[[2],[]],[['0'],[]]]){const bad=S.clone(s);bad.clearedResources=value;assert.throws(()=>S.restore(bad),/Invalid saved resource knowledge/);}
  const bad=S.clone(s);bad.resources[0].amount=100;delete bad.resources[0].felled;assert.throws(()=>S.restore(bad),/Invalid saved resource knowledge/);
}
console.log('PASS forest: three sealed biomes, air bypass, swept trunks and body radii, detours, embedded recovery, immediate harvest opening, building rejection/acceptance, exact save replay and private persistent discovery');
const app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){
  const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='';sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
  socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(m.type==='error'||w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);if(m.type==='error')w.reject(Error(m.message));else w.resolve(m);}}});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>reject(Error('Forest TCP timeout '+check.toString().slice(0,180))),10000)};pending.push(w);}),welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});await welcome;return {socket,send,next};
}
try{
  const a=await peer(),b=await peer(),map=fixture().map;map.units=[{kind:'soldier',team:0,x:-5,z:1},{kind:'worker',team:0,x:-2,z:1}];let next=a.next(m=>m.type==='joined');a.send({type:'create',map});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;
  next=a.next(m=>m.type==='room'&&m.players.length===2&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=a.next(m=>m.type==='state');a.send({type:'start'});const initial=(await next).state,unit=initial.units.find(u=>u.kind==='soldier'&&u.team===0),worker=initial.units.find(u=>u.kind==='worker'&&u.team===0&&u.x===-2),ri=initial.resources.findIndex(r=>r.z===1),room=app.rooms.get(joined.code);room.state.resources[ri].amount=5;
  next=a.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===unit.id)?.order===null&&m.state.frame>15);a.send({type:'order',seq:1,command:{type:'move',ids:[unit.id],x:5,z:1}});const blocked=(await next).state.units.find(u=>u.id===unit.id);assert.ok(blocked.x<0);
  next=a.next(m=>m.type==='state'&&m.state.resources[ri].amount===0);const gatherFrame=room.state.frame,privateView=b.next(m=>m.type==='state'&&m.state.frame>gatherFrame);a.send({type:'order',seq:2,command:{type:'gather',ids:[worker.id],resource:ri}});const harvested=(await next).state;assert.ok(harvested.clearedResources[0].includes(ri));assert.deepEqual(harvested.clearedResources[1],[]);const hidden=(await privateView).state;assert.equal(hidden.resources[ri].amount,1);assert.equal(hidden.resources[ri].felled,undefined);assert.deepEqual(hidden.clearedResources,[[],[]]);
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;const c=await peer();next=c.next(m=>m.type==='joined');c.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.ok(resumed.clearedResources[0].includes(ri));assert.equal(resumed.resources[ri].amount,0);
  next=c.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===unit.id)?.x>4);c.send({type:'order',seq:1,command:{type:'move',ids:[unit.id],x:5,z:1}});const crossed=(await next).state;assert.ok(crossed.units.find(u=>u.id===unit.id).x>4);assert.ok(crossed.clearedResources[0].includes(ri));console.log('PASS TCP forest: sealed movement, actual harvest opening, private discovery, persisted reconnect and passage crossing');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
