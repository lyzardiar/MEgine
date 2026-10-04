// Author: MiYu. Authoritative tree depletion, root-pivot animation, saves, fog and TCP reconnects.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import './test-frost-tree-felling-client.mjs';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js');
globalThis.Frost=S;globalThis.FrostArt=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/model-catalog.json',import.meta.url)));
const V=require('../samples/frostbound-realms/game/visuals.js');
function mapFor(tileset){const map=S.defaultMap();map.tileset=tileset;for(const field of ['terrain','heights','relief','ramps'])map[field].fill(0);map.props=[{kind:'tree',x:-14,z:16,amount:100},{kind:'tree',x:-10,z:16,amount:100}];map.units=[];map.players.forEach(p=>p.ai=false);return map;}
function rotate(q,p){const [x,y,z,w]=q,[a,b,c]=p,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];}
for(const tileset of [0,1,2])for(const faction of [0,1,2,3]){
  const s=S.create('skirmish',{map:mapFor(tileset),ai:[false,false],factions:[faction,0]});s.units=[];S.spawn(s,'hall',0,-22,16);S.spawn(s,'hall',1,22,-16);
  const r=s.resources[0];r.amount=5;const w=S.spawn(s,faction===3?'ghoul':'worker',0,-16,16);S.visibility(s);
  assert.equal(S.command(s,0,{type:'gather',ids:[w.id],resource:0}),null);S.tick(s);
  assert.equal(r.amount,0);assert.deepEqual(r.felled,{frame:s.frame,yaw:Math.PI/2,age:0});assert.equal(w.cargo,5);
  const ended=S.restore(s);ended.winner=0;const endedFrame=ended.frame;for(let i=0;i<60;i++)S.tick(ended);assert.equal(ended.frame,endedFrame);assert.equal(ended.resources[0].felled.age,6);assert.equal(V.resource(ended.resources[0],12,tileset),null,'post-victory fall finishes without advancing battle time');
  const f=structuredClone(r.felled),begin=V.resource(r,12,tileset),middle=V.resource(r,12,tileset,.75),flat=V.resource(r,12,tileset,1.5),far=V.resource(r,27,tileset,1.5);
  assert.ok(begin);assert.equal(begin.parts.length,tileset===1?3:1);assert.equal(flat.scale,far.scale);assert.deepEqual(flat.rotation,far.rotation);
  assert.ok(Math.abs(Math.hypot(...middle.rotation)-1)<1e-12);assert.ok(Math.abs(rotate(begin.rotation,[0,1,0])[1]-1)<1e-12);
  const tip=rotate(flat.rotation,[0,1,0]);assert.ok(Math.abs(tip[0]-1)<1e-12&&Math.abs(tip[1])<1e-12&&Math.abs(tip[2])<1e-12,'tree tips away from worker');
  assert.deepEqual(rotate(flat.rotation,[0,0,0]),[0,0,0]);assert.equal(flat.sink,0);assert.ok(V.resource(r,12,tileset,5).sink>0);assert.equal(V.resource(r,12,tileset,6),null);
  for(let i=0;i<7;i++)S.tick(s);const restored=S.restore(s);assert.deepEqual(restored.resources[0],r);assert.deepEqual(V.resource(restored.resources[0],12,tileset),V.resource(r,12,tileset));
  for(let i=0;i<100;i++){S.tick(s);S.tick(restored);}assert.deepEqual(restored.resources,s.resources);assert.equal(r.felled.frame,f.frame);assert.equal(r.felled.yaw,f.yaw);assert.equal(r.felled.age,6);assert.ok(s.teams[0].wood>150);assert.ok(s.resources[1].amount<100,'worker returns lumber and continues at another tree');
  const legacy=structuredClone(s);delete legacy.resources[0].felled;assert.equal(S.restore(legacy).resources[0].felled,undefined);assert.equal(V.resource(legacy.resources[0]),null);
  for(const mutate of [v=>v.felled=null,v=>v.felled.frame=-1,v=>v.felled.frame=s.frame+1,v=>v.felled.frame=.5,v=>v.felled.yaw=4,v=>v.felled.age=-1,v=>v.felled.age=7,v=>delete v.felled.age,v=>v.amount=1,v=>v.kind='mine']){const bad=structuredClone(s);mutate(bad.resources[0]);assert.throws(()=>S.restore(bad),/Invalid saved tree fall/);}
  f.age=r.felled.age;s.visible[0][S.index(r.x,r.z)]=1;s.visible[1][S.index(r.x,r.z)]=0;
  assert.deepEqual(S.publicState(s,0).resources[0].felled,f);const hidden=S.publicState(s,1).resources[0];assert.equal(hidden.amount,1);assert.equal(hidden.felled,undefined);assert.deepEqual(r.felled,f,'filtering cannot mutate authority');
}
console.log('PASS: all three biomes and four lumber factions, root pivot/direction, LOD parity, continuation, saves, legacy saves, invalid metadata and private fog');
const app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){
  const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='';sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
  socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(message)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(message);}}});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>reject(Error('Tree felling TCP timeout')),10000)};pending.push(w);});
  const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,S.PROTOCOL);return {socket,send,next};
}
try{
  const a=await peer(),b=await peer(),map=mapFor(1);map.units=[{kind:'worker',team:0,x:-16,z:16},{kind:'soldier',team:1,x:-14,z:20}];
  let next=a.next(m=>m.type==='joined');a.send({type:'create',map,faction:0});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code,faction:0});await next;
  next=a.next(m=>m.type==='room'&&m.players.length===2&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;
  next=a.next(m=>m.type==='state');a.send({type:'start'});const initial=(await next).state,room=app.rooms.get(joined.code);room.state.resources[0].amount=5;
  const worker=initial.units.find(u=>u.kind==='worker'&&u.team===0&&u.x===-16),shared=b.next(m=>m.type==='state'&&m.state.resources[0].felled);
  next=a.next(m=>m.type==='state'&&m.state.resources[0].felled);a.send({type:'order',seq:1,command:{type:'gather',ids:[worker.id],resource:0}});const fall=(await next).state.resources[0].felled;assert.deepEqual((await shared).state.resources[0].felled,fall);
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;const c=await peer();next=c.next(m=>m.type==='joined');c.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;
  assert.equal(resumed.resources[0].felled.frame,fall.frame);assert.equal(resumed.resources[0].felled.yaw,fall.yaw);assert.ok(resumed.resources[0].felled.age>=fall.age);assert.ok(resumed.frame>=fall.frame);assert.ok(V.resource(resumed.resources[0],12,1));
  const enemy=room.state.units.find(u=>u.kind==='soldier'&&u.team===1);enemy.hp=0;S.visibility(room.state);
  next=b.next(m=>m.type==='state'&&!m.state.visible[1][S.index(-14,16)]);const hidden=(await next).state.resources[0];assert.equal(hidden.felled,undefined);assert.equal(hidden.amount,0,'witnessed depletion remains known after the observer leaves');
  room.state.winner=0;const finalFrame=room.state.frame;next=c.next(m=>m.type==='state'&&m.state.resources[0].felled.age===6);const done=(await next).state;assert.equal(V.resource(done.resources[0],12,1),null);assert.equal(done.frame,finalFrame);assert.equal(room.phase,'finished');assert.equal(room.state.resources[0].felled.frame,fall.frame);
  console.log('PASS TCP: real gather command, same fall on both peers, mid-fall reconnect, hidden metadata and post-victory completion with frozen battle time');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
