// Author: MiYu. Real TCP commands and reconnects preserve authoritative mining stations.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
import {createServer} from '../samples/frostbound-realms/server.mjs';
const app=createServer({port:0}),address=await app.listening,clients=[];
async function peer(){
  const socket=net.connect(address.port,'127.0.0.1'),pending=[],messages=[];let buffer='';clients.push(socket);
  socket.setEncoding('utf8');socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);messages.push(m);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});socket.on('error',()=>{});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>reject(Error('TCP mining timeout')),10000)};pending.push(w);}),welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:22});assert.equal((await welcome).protocol,22);return {socket,send,next,messages};
}
try{
  const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish',faction:3});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code,faction:0});await next;
  next=a.next(m=>m.type==='room'&&m.players.length===2&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=a.next(m=>m.type==='state');a.send({type:'start'});let state=(await next).state;assert.equal(state.units.filter(u=>u.kind==='hauntedmine'&&u.team===0).length,1);
  let seq=0;const goldMine=state.resources.findIndex(r=>r.kind==='mine'&&state.units.some(u=>u.kind==='hauntedmine'&&u.team===0&&S.distance(u,r)<.01));for(const u of state.units.filter(u=>u.kind==='worker'&&u.team===0))a.send({type:'order',seq:++seq,command:{type:'gather',ids:[u.id],resource:goldMine}});
  next=a.next(m=>m.type==='state'&&m.state.teams[0].gold>500);state=(await next).state;const worker=state.units.find(u=>u.kind==='worker'&&u.team===0),tree=state.resources.findIndex(r=>r.kind==='tree');next=a.next(m=>m.type==='error');a.send({type:'order',seq:++seq,command:{type:'gather',ids:[worker.id],resource:tree}});assert.match((await next).message,/ghouls/);
  next=a.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===worker.id)?.order===null);a.send({type:'order',seq:++seq,command:{type:'stop',ids:[worker.id]}});await next;
  const resource=state.resources.findIndex(r=>r.kind==='mine');next=a.next(m=>m.type==='state'&&Number.isInteger(m.state.units.find(u=>u.id===worker.id)?.order?.mineSlot));a.send({type:'order',seq:++seq,command:{type:'gather',ids:[worker.id],resource}});state=(await next).state;const slot=state.units.find(u=>u.id===worker.id).order.mineSlot;
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;const c=await peer();next=c.next(m=>m.type==='joined');c.send({type:'resume',code:joined.code,token:joined.token});const resumed=await next;assert.equal(resumed.state.units.find(u=>u.id===worker.id).order.mineSlot,slot);assert.ok(resumed.state.teams[0].gold>=state.teams[0].gold);assert.ok(b.messages.filter(m=>m.type==='state').every(m=>m.state.teams[0].gold===undefined));
  console.log('PASS TCP: protocol 22, Revenant start, direct income, rejected acolyte lumber, stop/restaff, private treasury and mining-slot reconnect');
}finally{for(const socket of clients)socket.destroy();await app.close();}
