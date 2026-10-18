// Author: MiYu. Real TCP source lumber, private swings, explicit return and reconnect.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {lumberFixture} from './test-frost-worker-lumber.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){
 const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
 socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Worker lumber TCP timeout'));},12000)};pending.push(w);});
 const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,109);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};
}
const unit=(s,id)=>s.units.find(u=>u.id===id),wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
try{
 let a=await peer();const b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});assert.equal((await next).state.lumberHarvestVersion,1);
 for(const faction of [0,1,3]){
  const {s,worker,tree,hall}=lumberFixture(faction);S.spawn(s,'soldier',1,0,-4,{damage:0,order:{type:'hold'}});S.visibility(s);app.rooms.get(joined.code).state=s;
  next=b.next(m=>m.type==='error');b.order({type:'gather',ids:[worker.id],resource:0});assert.ok((await next).message);assert.equal(worker.order.type,'hold');
  next=wait(a,state=>unit(state,worker.id)?.cargo>0);a.order({type:'gather',ids:[worker.id],resource:0});const cut=(await next).state,w=unit(cut,worker.id);assert.equal(w.cargo,S.lumberHarvester(s,worker).damage);assert.ok(tree.hp<50);assert.ok(w.lumberSwing);assert.ok(S.restore(s));
  const enemy=(await wait(b,state=>state.frame>=cut.frame)).state,e=unit(enemy,worker.id);for(const k of ['lumberCd','lumberSwing','cargo','cargoKind','waypoints'])assert.equal(e[k],undefined);assert.equal(enemy.teams[0].wood,undefined);
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;a=await peer();next=a.next(m=>m.type==='joined');a.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(resumed.lumberHarvestVersion,1);assert.ok(unit(resumed,worker.id).cargo>0);assert.equal(unit(resumed,worker.id).order.type,'gather');
  next=wait(a,state=>unit(state,worker.id)?.order?.type==='returnResources');a.order({type:'returnResources',ids:[worker.id],target:hall.id});await next;const wood=s.teams[0].wood;const delivered=(await wait(a,state=>state.teams[0].wood>wood)).state;assert.equal(unit(delivered,worker.id).cargo,0);assert.equal(unit(delivered,worker.id).order.type,'gather');assert.ok(S.restore(s));
  next=wait(a,state=>unit(state,worker.id)?.order===null);a.order({type:'stop',ids:[worker.id]});await next;console.log('PASS TCP lumber faction '+faction+': source damage, ownership, private swing/cargo, reconnect, manual partial return and resumed harvest');
 }
}finally{for(const socket of sockets)socket.destroy();await app.close();}
