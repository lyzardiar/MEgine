// Author: MiYu. Real TCP repair ownership, source payment, observer privacy and saved reconnect.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {repairFixture} from './test-frost-worker-repair.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){
 const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
 socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Worker repair TCP timeout'));},12000)};pending.push(w);});
 const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,111);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};
}
const unit=(s,id)=>s.units.find(u=>u.id===id),wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
try{
 let a=await peer();const b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});assert.equal((await next).state.workerRepairVersion,1);
 for(const faction of [0,1,2,3]){
  const {s,worker,target}=repairFixture(faction),observer=S.spawn(s,'soldier',1,-5,0,{damage:0,order:{type:'hold'}});S.visibility(s);app.rooms.get(joined.code).state=s;const hp=target.hp,gold=s.teams[0].gold,wood=s.teams[0].wood,d=S.unitType(target);
  next=b.next(m=>m.type==='error');b.order({type:'repair',ids:[worker.id],target:target.id});assert.ok((await next).message);assert.equal(worker.order.type,'hold');
  next=wait(a,state=>unit(state,target.id)?.hp>hp);a.order({type:'repair',ids:[worker.id],target:target.id});const paid=(await next).state;assert.equal(unit(paid,worker.id).order.type,'repair');near(gold-paid.teams[0].gold,d.gold*(unit(paid,target.id).hp-hp)/target.maxHp*.35);near(wood-paid.teams[0].wood,d.wood*(unit(paid,target.id).hp-hp)/target.maxHp*.35);
  const enemy=(await wait(b,state=>unit(state,target.id)?.hp>hp)).state;assert.equal(enemy.teams[0].gold,undefined);assert.equal(unit(enemy,worker.id).order,null);assert.ok(S.restore(s));
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;a=await peer();next=a.next(m=>m.type==='joined');a.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(resumed.workerRepairVersion,1);assert.equal(unit(resumed,worker.id).order.type,'repair');
  next=wait(a,state=>unit(state,worker.id)?.order===null);a.order({type:'stop',ids:[worker.id]});const stopped=(await next).state,value=unit(stopped,target.id).hp;const later=(await wait(a,state=>state.frame>=stopped.frame+3)).state;near(unit(later,target.id).hp,value);assert.ok(S.restore(s));console.log('PASS TCP repair faction '+faction+': mechanical repair, original cost, ownership, private order/resources, reconnect and Stop');
 }
}finally{for(const socket of sockets)socket.destroy();await app.close();}
