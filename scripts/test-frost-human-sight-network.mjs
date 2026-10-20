// Author: MiYu. Real TCP day/night visibility, fog privacy and hidden target rejection.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {humanSightFixture} from './frost-human-sight-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Human sight TCP timeout'));},12000)};pending.push(w);});const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,114);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};}
const unit=(s,id)=>s.units.find(u=>u.id===id),wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state));
try{
 const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;
 next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});await next;
 const {s,building,enemy}=humanSightFixture(S);s.map.startingHour=0;s.frame=3590;S.visibility(s);const room=app.rooms.get(joined.code);room.state=s;
 let visible=(await wait(a,state=>state.frame>=3591&&unit(state,building.id)?.x===0)).state;assert.ok(unit(visible,enemy.id));assert.equal(visible.visible[0][16*32+21],1);assert.deepEqual(visible.visible[1],[]);
 const hidden=(await wait(a,state=>state.frame>=3600)).state;assert.equal(unit(hidden,enemy.id),undefined);assert.equal(hidden.visible[0][16*32+21],0);assert.equal(hidden.explored[0][16*32+21],1);
 next=a.next(m=>m.type==='error');a.order({type:'attack',ids:[building.id],target:enemy.id});assert.match((await next).message,/not visible/);
 console.log('PASS TCP Human sight: dusk removes enemy from snapshot, preserves explored cells and rejects hidden target orders');
 const dawn=S.restore(s);dawn.frame=5999;room.state=dawn;const revealed=(await wait(a,state=>state.frame>=6000)).state;assert.ok(unit(revealed,enemy.id));assert.equal(revealed.visible[0][16*32+21],1);
 console.log('PASS TCP Human sight: dawn reintroduces enemy through the real server snapshot');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
