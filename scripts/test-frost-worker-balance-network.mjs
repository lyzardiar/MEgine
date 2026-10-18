// Author: MiYu. Source worker prices and attributes through the authoritative TCP production path.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {workerFixture} from './test-frost-worker-balance.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,clients=[];
async function peer(){
 const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;clients.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
 socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Worker balance TCP timeout'));},12000)};pending.push(w);});
 const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,99);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};
}
const unit=(s,id)=>s.units.find(u=>u.id===id);
try{
 let a=await peer();const b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;
 next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=a.next(m=>m.type==='state');a.send({type:'start'});assert.equal((await next).state.workerBalanceVersion,1);
 for(const [faction,hp,source] of [[0,220,'hpea'],[1,250,'opeo'],[3,220,'uaco']]){
  const {s,hall,worker}=workerFixture(faction);S.spawn(s,'worker',1,hall.x+4,hall.z+4);S.visibility(s);app.rooms.get(joined.code).state=s;const gold=s.teams[0].gold;
  next=a.next(m=>m.type==='state'&&unit(m.state,hall.id)?.queue.length===1);a.order({type:'train',ids:[hall.id],kind:'worker'});const paid=(await next).state;assert.equal(paid.teams[0].gold,gold-75);assert.ok(unit(paid,hall.id).queue[0].left<=15);assert.equal(unit(paid,worker.id).workerBalance,source);
  const enemy=(await b.next(m=>m.type==='state'&&unit(m.state,hall.id))).state;assert.equal(enemy.teams[0].gold,undefined);assert.deepEqual(unit(enemy,hall.id).queue,[]);
  next=b.next(m=>m.type==='error');b.order({type:'train',ids:[hall.id],kind:'worker'});assert.match((await next).message,/production/);
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;a=await peer();next=a.next(m=>m.type==='joined');a.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(resumed.workerBalanceVersion,1);assert.equal(unit(resumed,hall.id).queue.length,1);
  // MiYu: accelerate only the server fixture clock; commands and snapshots cross the real TCP connection.
  next=a.next(m=>m.type==='state'&&m.state.units.some(u=>u.kind==='worker'&&u.team===0&&u.id!==worker.id));for(let i=0;i<150;i++)S.tick(s);const trained=(await next).state.units.find(u=>u.kind==='worker'&&u.team===0&&u.id!==worker.id);assert.equal(trained.maxHp,hp);assert.equal(trained.workerBalance,source);assert.ok(S.restore(s));
  console.log('PASS TCP '+source+': paid full training, source HP, enemy privacy, ownership and mid-production reconnect');
 }
}finally{for(const socket of clients)socket.destroy();await app.close();}
