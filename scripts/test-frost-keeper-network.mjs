import {keeperFixture} from './frost-keeper-fixture.mjs';
// Author: MiYu. Verify source hero ownership, delayed spells, transform state and reconnect over actual TCP.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='';sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(message)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(message);}}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=message=>socket.write(JSON.stringify(message)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Keeper TCP timeout'));},12000)};pending.push(w);}),welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,S.PROTOCOL);let seq=0;return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};}
const wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state)),unit=(s,id)=>s.units.find(u=>u.id===id);
try{
 const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish',faction:2,heroClass:1});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code,faction:0});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});await next;
 const {s,h}=keeperFixture(S,6),enemy=S.spawn(s,'soldier',1,2,0,{damage:0,order:{type:'hold'}});for(const slot of [0,1,2,3])S.command(s,0,{type:'learn',ids:[h.id],slot});h.mana=400;S.visibility(s);app.rooms.get(joined.code).state=s;
 next=b.next(m=>m.type==='error');b.order({type:'spell',ids:[h.id],slot:0,target:enemy.id});await next;
 next=wait(a,state=>unit(state,enemy.id)?.keeperRoots);a.order({type:'spell',ids:[h.id],slot:0,target:enemy.id});const rooted=(await next).state;assert.equal(unit(rooted,h.id).sourceHero,'Ekee');assert.ok(unit(rooted,h.id).spell[0]>0);assert.ok(S.restore(s));
 next=wait(a,state=>state.units.filter(S.keeperTreant).length===2);a.order({type:'spell',ids:[h.id],slot:1,resource:0});await next;
 next=wait(a,state=>unit(state,h.id)?.tranquility);a.order({type:'spell',ids:[h.id],slot:3});await next;assert.ok(S.restore(s));
 const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;const c=await peer();next=c.next(m=>m.type==='joined');c.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.ok(unit(resumed,h.id).tranquility);assert.equal(resumed.units.filter(S.keeperTreant).length,2);next=wait(c,state=>!unit(state,h.id)?.tranquility);c.order({type:'stop',ids:[h.id]});await next;assert.ok(S.restore(s));
 console.log('PASS source Keeper TCP: protocol'+S.PROTOCOL+', ownership rejection, delayed Roots, source Treants and Tranquility, disconnect/reconnect continuation and stop interruption');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
