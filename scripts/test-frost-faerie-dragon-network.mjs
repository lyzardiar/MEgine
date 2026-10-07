import {faerieFixture} from './frost-faerie-dragon-fixture.mjs';
// Author: MiYu. Verify Faerie Dragon production, phase visibility, channel armor and reconnect over authoritative TCP.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='';sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(message)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(message);}}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=message=>socket.write(JSON.stringify(message)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Faerie TCP timeout'));},12000)};pending.push(w);}),welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,S.PROTOCOL);let seq=0;return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};}
const wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state)),unit=(s,id)=>s.units.find(u=>u.id===id);
try{
 const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish',faction:2});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code,faction:0});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});await next;
 const {s,wind,faerie}=faerieFixture(S);S.visibility(s);app.rooms.get(joined.code).state=s;
 next=wait(a,state=>unit(state,wind.id)?.queue[0]?.kind==='faeriedragon');a.order({type:'train',ids:[wind.id],kind:'faeriedragon'});const paid=(await next).state;assert.equal(paid.teams[0].gold,9845);assert.equal(paid.teams[0].wood,9975);assert.ok(S.restore(s));
 const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;const c=await peer();next=c.next(m=>m.type==='joined');c.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(unit(resumed,wind.id).queue[0].kind,'faeriedragon');wind.queue[0].left=.2;await wait(c,state=>state.units.filter(S.faerieUnit).length===2);assert.ok(S.restore(s));
 next=b.next(m=>m.type==='error');b.order({type:'phaseShift',ids:[faerie.id]});await next;
 next=wait(c,state=>unit(state,faerie.id)?.phaseLeft>0);c.order({type:'phaseShift',ids:[faerie.id]});await next;const enemy=(await wait(b,()=>true)).state;assert.equal(unit(enemy,faerie.id),undefined);assert.ok(S.restore(s));
 faerie.phaseLeft=0;faerie.phaseCd=0;faerie.mana=200;next=wait(c,state=>unit(state,faerie.id)?.flareLeft>0);c.order({type:'manaFlare',ids:[faerie.id]});await next;assert.equal(S.armorValue(faerie),12);assert.ok(S.restore(s));
 next=wait(c,state=>unit(state,faerie.id)?.flareLeft===0);c.order({type:'stop',ids:[faerie.id]});await next;assert.equal(faerie.order,null);assert.ok(S.restore(s));
 const view=(await wait(b,()=>true)).state;assert.equal(unit(view,faerie.id)?.phaseAuto,undefined);

 console.log('PASS Faerie authoritative TCP: protocol'+S.PROTOCOL+', source train/payment, disconnect/resume, ownership rejection, shifted enemy visibility, +12 channel armor and stop; completion timer controlled in fixture');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
