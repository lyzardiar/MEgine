// Author: MiYu. Real TCP ManaEx/Well Spring, complete source clocks, ratio writes and reconnect.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {manaCases,manaFixture,manaResearch,manaRegeneration} from './test-frost-mana-upgrades.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Mana research TCP timeout'));},12000)};pending.push(w);});const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,109);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};}
const unit=(s,id)=>s.units.find(u=>u.id===id),wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`),round=x=>Math.floor(Math.fround(Math.fround(x)+.5));
try{
 let a=await peer();const b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});assert.equal((await next).state.manaUpgradeVersion,1);
 for(const c of manaCases){
  const {s,producer,unit:actor}=manaFixture(c);actor.mana=75.25;S.visibility(s);app.rooms.get(joined.code).state=s;
  for(let rank=1;rank<=c.ranks;rank++){
   const r=manaResearch(s,c,producer),gold=s.teams[0].gold,wood=s.teams[0].wood;next=b.next(m=>m.type==='error');b.order({type:c.command,ids:[producer.id],upgrade:c.key});assert.ok((await next).message);next=wait(a,state=>unit(state,producer.id)?.queue[0]?.research===c.key);a.order({type:c.command,ids:[producer.id],upgrade:c.key});const paid=(await next).state;assert.equal(paid.teams[0].gold,gold-r.gold);assert.equal(paid.teams[0].wood,wood-r.wood);assert.ok(unit(paid,producer.id).queue[0].left<=r.time);assert.ok(S.restore(s));
   const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;a=await peer();next=a.next(m=>m.type==='joined');a.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(resumed.manaUpgradeVersion,1);assert.equal(unit(resumed,producer.id).queue[0].rank,rank);
   for(let i=0;producer.queue[0].left>S.DT+1e-6;i++){assert.ok(i<1000);S.tick(s);}const mana=actor.mana,max=S.maxMana(actor);S.tick(s);const completedFrame=s.frame,nextMax=S.maxMana(actor),expected=round(Math.fround(nextMax*Math.fround(mana/max)))+manaRegeneration(s,actor)*S.DT;near(actor.mana,Math.min(nextMax,expected));assert.equal(nextMax,max+(c.key==='Rews'?125:100));const completed=(await wait(a,state=>S.maxMana(unit(state,actor.id))===nextMax)).state;near(unit(completed,actor.id).mana,Math.min(nextMax,expected+(completed.frame-completedFrame)*manaRegeneration(completed,unit(completed,actor.id))*S.DT));assert.ok(S.restore(s));
  }
  console.log('PASS TCP mana '+c.kind+': ownership, source payment, complete research clocks, mid-research reconnect, exact rounded mana ratio and saved state');
 }
}finally{for(const socket of sockets)socket.destroy();await app.close();}
