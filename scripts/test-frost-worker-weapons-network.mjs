// Author: MiYu. Real authoritative TCP worker attacks, windup privacy, reconnect and Stop cancellation.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {weaponFixture} from './test-frost-worker-weapons.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){
 const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
 socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Worker weapon TCP timeout'));},12000)};pending.push(w);});
 const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,99);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};
}
const unit=(s,id)=>s.units.find(u=>u.id===id),wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state));
try{
 let a=await peer();const b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;
 next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});assert.equal((await next).state.workerCombatVersion,1);
 for(const [faction,source,min,max] of [[0,'hpea',5,6],[1,'opeo',7,8],[3,'uaco',9,10]]){
  const {s,worker,target}=weaponFixture(faction),room=app.rooms.get(joined.code);room.state=s;const hp=target.hp,observed=wait(b,state=>unit(state,worker.id)?.workerAttackActive);
  next=wait(a,state=>unit(state,worker.id)?.weaponWindup);a.order({type:'attack',ids:[worker.id],target:target.id});const pending=(await next).state;room.phase='lobby';assert.ok(worker.weaponWindup);const frozenFrame=s.frame;assert.equal(unit(pending,target.id).hp,hp);assert.equal(unit(pending,worker.id).workerCombat,1);assert.equal(unit(pending,worker.id).workerAttackActive,true);
  // MiYu: freeze only the fixture clock during transport handshakes so suite CPU load cannot finish the attack.
  const enemy=(await observed).state;assert.equal(unit(enemy,worker.id).weaponWindup,undefined);assert.equal(enemy.teams[0].gold,undefined);assert.ok(S.restore(s));
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;a=await peer();next=a.next(m=>m.type==='joined');a.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(resumed.workerCombatVersion,1);assert.ok(unit(resumed,worker.id).weaponWindup,'reconnect retains the unfinished source attack');assert.equal(unit(resumed,target.id).hp,hp);assert.equal(s.frame,frozenFrame);room.phase='playing';
  next=wait(a,state=>unit(state,target.id)?.hp<hp);const hit=(await next).state,factor=S.workerWeapons.damageTable.normal[S.unitType(target).armor]??1,damage=(hp-unit(hit,target.id).hp)/factor;assert.ok(Math.abs(damage-min)<1e-7||Math.abs(damage-max)<1e-7);assert.equal(unit(hit,worker.id).workerBalance,source);assert.ok(S.restore(s));
  console.log('PASS TCP worker '+source+': source damage after full windup, observer privacy and mid-attack reconnect');
 }
 {
  const {s,worker,target}=weaponFixture();app.rooms.get(joined.code).state=s;const hp=target.hp,rng=s.rng;next=wait(a,state=>unit(state,worker.id)?.weaponWindup);a.order({type:'attack',ids:[worker.id],target:target.id});await next;
  next=wait(a,state=>!unit(state,worker.id)?.weaponWindup&&!unit(state,worker.id)?.workerAttackActive);a.order({type:'stop',ids:[worker.id]});await next;assert.equal(target.hp,hp);assert.equal(s.rng,rng);assert.ok(S.restore(s));
  console.log('PASS TCP worker Stop: no pending hit, animation or RNG debit after accepted cancellation');
 }
}finally{for(const socket of sockets)socket.destroy();await app.close();}
