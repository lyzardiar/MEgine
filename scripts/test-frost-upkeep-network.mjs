// Author: MiYu. Authoritative mining tax, food transitions, privacy and reconnect over real TCP.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {upkeepFixture} from './frost-upkeep-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,clients=[];
async function peer(){
 const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='';clients.push(socket);socket.setEncoding('utf8');socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});socket.on('error',()=>{});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>reject(Error('TCP upkeep timeout')),10000)};pending.push(w);}),welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,S.PROTOCOL);return {socket,send,next};
}
try{
 const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=a.next(m=>m.type==='state');a.send({type:'start'});await next;
 const room=app.rooms.get(joined.code),{s,workers}=upkeepFixture(3,51);room.state=s;const w=workers[0];S.spawn(s,'hauntedmine',0,0,0);Object.assign(w,S.minePoint(s.resources[0],0));S.visibility(s);
 const state=a.next(m=>m.type==='state'&&m.state.teams[0].gold===5007),privacy=b.next(m=>m.type==='state'&&m.state.frame>0&&m.state.upkeepVersion===1);
 a.send({type:'order',seq:1,command:{type:'gather',ids:[w.id],resource:0}});const taxed=(await state).state;assert.deepEqual(S.upkeep(taxed,0),{tier:1,percent:70});assert.equal(taxed.resources[0].amount,990);const enemy=(await privacy).state;assert.deepEqual(enemy.teams[0],{faction:3});assert.equal(enemy.upkeep,undefined);assert.ok(enemy.units.filter(u=>u.team===0).every(u=>!u.queue.length));
 const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;const c=await peer();next=c.next(m=>m.type==='joined');c.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(resumed.teams[0].gold,5007);assert.deepEqual(S.upkeep(resumed,0),{tier:1,percent:70});
 workers[1].hp=0;w.gatherCd=0;next=c.next(m=>m.type==='state'&&m.state.teams[0].gold===5017);const reduced=(await next).state;assert.deepEqual(S.upkeep(reduced,0),{tier:0,percent:100});assert.equal(reduced.resources[0].amount,980);
 console.log('PASS TCP upkeep: taxed mining, gross depletion, own food/tax parity, enemy economy privacy, reconnect retention and death threshold transition');
}finally{for(const socket of clients)socket.destroy();await app.close();}
