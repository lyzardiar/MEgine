import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createOutpostServer} from '../samples/ion-outpost/server.mjs';
const S=createRequire(import.meta.url)('../samples/ion-outpost/game/simulation.js');
let passed=0;
function check(name,run){run();passed++;console.log('PASS',name);}
check('input validation rejects non-finite values and clamps movement',()=>{
  assert.equal(S.cleanInput({...S.neutral(),yaw:NaN}),null);assert.equal(S.cleanInput({...S.neutral(),seq:1.5}),null);
  assert.equal(S.cleanInput({...S.neutral(),x:1e9}).x,1);
});
check('movement, collision, jump and diagonal speed',()=>{
  const a=S.actor('a','A'),b=S.actor('b','B');Object.assign(a,{x:-10,z:12,yaw:0});Object.assign(b,{x:-10,z:12,yaw:0});
  for(let i=0;i<30;i++){S.move(a,{...S.neutral(),x:1});S.move(b,{...S.neutral(),x:1,z:1});}
  assert.ok(Math.abs(Math.hypot(a.x+10,a.z-12)-Math.hypot(b.x+10,b.z-12))<1e-6);
  Object.assign(a,{x:0,z:6});for(let i=0;i<120;i++)S.move(a,{...S.neutral(),z:1});assert.ok(a.z>=2.05);
  S.move(a,{...S.neutral(),jump:true});assert.ok(a.y>0);for(let i=0;i<100;i++)S.move(a,S.neutral());assert.equal(a.y,0);
});
function duel(){const state=S.create();state.actors=[S.actor('a','A'),S.actor('b','B')];S.start(state);Object.assign(state.actors[0],{x:-12,z:10,yaw:0,protection:0});Object.assign(state.actors[1],{x:-12,z:0,protection:0});return state;}
check('authoritative shots, headshots, ammo, death and respawn',()=>{
  const state=duel(),a=state.actors[0],b=state.actors[1];
  for(let i=0;i<50;i++)S.step(state,{a:{...S.neutral(),fire:true,seq:i}});
  assert.equal(a.kills,1);assert.equal(b.deaths,1);assert.ok(b.dead>0);assert.ok(a.ammo[0]<24);assert.ok(state.events.some(e=>e.type==='kill'&&e.head));
  for(let i=0;i<180;i++)S.step(state);assert.equal(b.dead,0);assert.equal(b.hp,100);assert.ok(b.protection>0);
});
check('cover occludes hits, spawn protection and reload cooldown',()=>{
  const state=duel(),a=state.actors[0],b=state.actors[1];Object.assign(a,{x:0,z:5});Object.assign(b,{x:0,z:-5});
  for(let i=0;i<100;i++)S.step(state,{a:{...S.neutral(),fire:true,seq:i}});assert.equal(b.hp,100);assert.equal(b.shield,40);
  a.ammo[0]=0;S.step(state);assert.equal(a.reloading,S.weapons[0].reload);for(let i=0;i<S.weapons[0].reload;i++)S.step(state);assert.equal(a.ammo[0],24);
  Object.assign(a,{x:-12,z:10});Object.assign(b,{x:-12,z:0,protection:100});S.step(state,{a:{...S.neutral(),fire:true}});assert.equal(b.shield,40);
});
check('fixed-frame replay and active bot combat',()=>{
  const a=S.create(),b=S.create();for(const state of [a,b]){for(let i=0;i<6;i++)state.actors.push(S.actor('b'+i,'Bot '+i,true,i));S.start(state);}
  const begin=performance.now();for(let i=0;i<2400;i++){S.step(a);S.step(b);}
  assert.deepEqual(a,b);assert.ok(a.actors.some(p=>p.kills>0));assert.ok(a.events.some(e=>e.type==='shot'));assert.ok(a.actors.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
  console.log('  4800 six-bot simulation frames:',(performance.now()-begin).toFixed(1),'ms; kills:',a.actors.reduce((n,p)=>n+p.kills,0));
});
check('match limit and heal pickup',()=>{const s=duel(),a=s.actors[0];Object.assign(a,{x:-12,z:12,hp:50,shield:0});S.step(s);assert.equal(a.hp,95);assert.equal(a.shield,40);assert.equal(s.pickups[0],600);s.remaining=1;S.step(s);assert.equal(s.phase,'finished');});
check('authoritative input-frame replay verifies checksums and rejects a missing frame',()=>{
  const state=duel(),checkpoint=S.snapshot(state),frames=[];
  for(let i=1;i<=12;i++){const inputs={a:{...S.neutral(),seq:i,frame:i,x:1}};S.step(state,inputs);frames.push({frame:state.frame,inputs});}
  const replay=S.replayFrames(checkpoint,frames);assert.equal(S.checksum(replay),S.checksum(state));assert.equal(checkpoint.frame,0);
  assert.equal(S.replayFrames(checkpoint,frames.slice(1)),null);replay.actors[0].hp--;assert.notEqual(S.checksum(replay),S.checksum(state));
});

const app=createOutpostServer({port:0,autoTick:false});const address=await app.listening;
const peers=[];
async function peer(name){
  const socket=net.connect(address.port,'127.0.0.1');socket.setEncoding('utf8');let buffer='';const messages=[];
  socket.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){messages.push(JSON.parse(buffer.slice(0,i)));buffer=buffer.slice(i+1);}});
  socket.on('error',()=>{});const send=m=>socket.write(JSON.stringify(m)+'\n');
  const wait=async predicate=>{const end=Date.now()+2500;while(Date.now()<end){const i=messages.findIndex(predicate);if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw new Error('Timed out waiting for '+predicate+'; messages: '+JSON.stringify(messages).slice(-500));};
  await new Promise(r=>socket.once('connect',r));send({type:'hello',protocol:1,name});await wait(m=>m.type==='welcome');const p={socket,send,wait,messages};peers.push(p);return p;
}
try{
  const a=await peer('Alpha'),b=await peer('Bravo'),c=await peer('Other room');
  a.send({type:'create',name:'Alpha room',bots:3});const joinedA=await a.wait(m=>m.type==='joined');
  b.send({type:'join',code:joinedA.code});const joinedB=await b.wait(m=>m.type==='joined');
  c.send({type:'create',name:'Isolation',bots:0});const joinedC=await c.wait(m=>m.type==='joined');
  b.send({type:'start'});assert.equal((await b.wait(m=>m.type==='error')).code,'owner_required');
  a.send({type:'start'});assert.equal((await a.wait(m=>m.type==='error')).code,'not_ready');
  b.send({type:'ready',ready:true});await b.wait(m=>m.type==='room'&&m.players.find(p=>p.id===joinedB.id)?.ready);
  a.send({type:'start'});await a.wait(m=>m.type==='state'&&m.state.phase==='playing');
  const room=app.rooms.get(joinedA.code);assert.equal(room.state.actors.length,5);const before=room.state.actors.find(p=>p.id===joinedA.id).x;
  a.send({type:'input',input:{...S.neutral(),seq:1,frame:1,x:1,yaw:0}});await new Promise(r=>setTimeout(r,15));for(let i=0;i<3;i++)app.tick();
  const as=await a.wait(m=>m.type==='state'&&m.state.frame===3),bs=await b.wait(m=>m.type==='state'&&m.state.frame===3),cs=await c.wait(m=>m.type==='state'&&m.state.frame===3);
  assert.deepEqual(as.state,bs.state);assert.deepEqual(as.frames,bs.frames);assert.equal(as.frames.length,3);assert.ok(as.state.actors.find(p=>p.id===joinedA.id).x>before);assert.equal(cs.state.actors.length,1);assert.equal(cs.state.actors[0].id,joinedC.id);
  a.send({type:'input',input:{...S.neutral(),seq:1,frame:3}});assert.equal((await a.wait(m=>m.type==='error')).code,'invalid_input');
  a.send({type:'input',input:{...S.neutral(),seq:99999,frame:99999,x:Infinity}});assert.equal((await a.wait(m=>m.type==='error')).code,'invalid_input');
  const position=room.state.actors.find(p=>p.id===joinedA.id);assert.ok(position.hp<=100);b.socket.destroy();await new Promise(r=>setTimeout(r,20));assert.equal(room.state.actors.find(p=>p.id===joinedB.id).connected,false);
  const resumed=await peer('Reconnected');resumed.send({type:'resume',code:joinedB.code,token:joinedB.token});const welcome=await resumed.wait(m=>m.type==='joined');assert.equal(welcome.id,joinedB.id);assert.equal(welcome.resumed,true);
  const intruder=await peer('Intruder');intruder.send({type:'resume',code:joinedB.code,token:'bad'});assert.equal((await intruder.wait(m=>m.type==='error')).code,'resume_expired');
  a.send({type:'leave'});await a.wait(m=>m.type==='left');assert.equal(room.owner,joinedB.id);
  resumed.send({type:'leave'});await resumed.wait(m=>m.type==='left');assert.ok(!app.rooms.has(joinedA.code));
  c.socket.destroy();await new Promise(r=>setTimeout(r,20));
  const replacement=await peer('New owner');replacement.send({type:'join',code:joinedC.code});const rejoined=await replacement.wait(m=>m.type==='joined');
  assert.equal(app.rooms.get(joinedC.code).owner,rejoined.id,'joining an ownerless reserved room elects an online owner');
  passed++;console.log('PASS TCP rooms, readiness, owner control, frame sync, input validation, isolation, reconnect, owner migration and room cleanup');
}finally{for(const p of peers)p.socket.destroy();await app.close();}
console.log(`PASS ${passed} Ion Outpost checks`);
