// Author: MiYu. Source corpse phases, eighty-body snapshots, fog projection and reconnect over actual TCP.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {corpseFixture} from './frost-corpse-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){
  const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
  socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(message)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(message);}}});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  const send=message=>socket.write(JSON.stringify(message)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Corpse TCP timeout'));},10000)};pending.push(w);}),welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,88);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};
}
const wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state));
try{
  const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish',faction:0});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code,faction:3});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});assert.equal((await next).state.corpseVersion,1);
  const {s}=corpseFixture(S);app.rooms.get(joined.code).state=s;const c=s.corpses[0];
  for(const [age,name] of [[.2,'Death'],[2,'Decay Flesh'],[30,'Decay Bone']]){c.age=age;next=wait(a,v=>v.corpses.some(b=>b.id===c.id&&S.corpseStage(v,b).name===name));const v=(await next).state;assert.equal(v.corpseVersion,1);assert.equal(v.corpses.find(b=>b.id===c.id).sourceUnit,'hrif');assert.equal(v.teams[1].gold,undefined);assert.ok(S.restore(s));}
  next=wait(b,v=>v.corpses.length===0);assert.equal((await next).state.corpses.length,0,'enemy corpse identities stay private under fog');
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;const resumed=await peer();next=resumed.next(m=>m.type==='joined');resumed.send({type:'resume',code:joined.code,token:joined.token});const v=(await next).state;assert.equal(v.corpseVersion,1);assert.ok(v.corpses.find(b=>b.id===c.id).age>=30);
  const n=S.spawn(s,'necromancer',1,-1,1,{mana:400,damage:0,raiseDeadAuto:false,order:{type:'hold'}});S.visibility(s);next=wait(b,v=>v.corpses.some(b=>b.id===c.id));await next;next=wait(b,v=>!v.corpses.some(b=>b.id===c.id)&&v.units.filter(u=>u.summoned&&u.kind.startsWith('skeleton')).length===2);b.order({type:'raiseDead',ids:[n.id],corpse:c.id});await next;assert.ok(S.restore(s));
  const crowded=corpseFixture(S,80).s;app.rooms.get(joined.code).state=crowded;next=wait(resumed,v=>v.corpses.length===80);const many=(await next).state;assert.equal(new Set(many.corpses.map(c=>c.id)).size,80);assert.ok(many.corpses.every(c=>S.corpseStage(many,c).name==='Decay Bone'));assert.ok(S.restore(crowded));
  console.log('PASS corpse actual TCP: protocol 79, original source identities, Death/flesh/bones, fog/resource privacy, thirty-second bone reconnect, paid Raise Dead and eighty-body snapshots');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
