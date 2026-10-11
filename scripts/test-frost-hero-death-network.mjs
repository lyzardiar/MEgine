// Author: MiYu. Hero source Death/Dissipate privacy, fog, reconnect, expiry and paid revival over actual TCP.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {heroDeathFixture,killHero} from './frost-hero-death-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){
  const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
  socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(message)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(message);}}});
  await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
  const send=message=>socket.write(JSON.stringify(message)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Hero death TCP timeout'));},10000)};pending.push(w);}),welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,81);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};
}
const wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state)),hero=(s,id)=>s.units.find(u=>u.id===id);
try{
  const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish',faction:3});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code,faction:0});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});assert.equal((await next).state.heroDeathVersion,1);
  const f=heroDeathFixture(S),{s,h,killer,altar}=f;killHero(S,f);app.rooms.get(joined.code).state=s;next=wait(b,v=>hero(v,h.id)?.heroDeath);const enemy=hero((await next).state,h.id);assert.deepEqual(Object.keys(enemy).sort(),['id','kind','team','heroClass','sourceHero','x','z','yaw','hp','built','heroDeath'].sort());assert.equal(S.heroDeathStage({heroDeathVersion:1},enemy).name,'Death');assert.equal(s.corpses.length,0);
  h.heroDeath.age=S.heroDeathSource(s,h).deathTime+.2;next=wait(a,v=>hero(v,h.id)?.heroDeath&&S.heroDeathStage(v,hero(v,h.id)).name==='Dissipate');const body=hero((await next).state,h.id);assert.deepEqual(body.inventory,[9]);assert.ok(S.restore(s));
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;const resumed=await peer();next=resumed.next(m=>m.type==='joined');resumed.send({type:'resume',code:joined.code,token:joined.token});const saved=hero((await next).state,h.id);assert.ok(saved.heroDeath.age>=body.heroDeath.age);assert.equal(saved.id,h.id);assert.deepEqual(saved.inventory,[9]);
  killer.x=22;killer.z=22;S.visibility(s);next=wait(b,v=>!hero(v,h.id));await next;killer.x=1;killer.z=0;S.visibility(s);next=wait(b,v=>hero(v,h.id)?.heroDeath);await next;
  h.heroDeath.age=S.heroDeathDuration(s,h)-.2;next=wait(b,v=>!hero(v,h.id));await next;next=wait(resumed,v=>hero(v,h.id)&&!hero(v,h.id).heroDeath);assert.equal(hero((await next).state,h.id).hp,0);assert.ok(S.restore(s));
  next=wait(resumed,v=>v.units.find(u=>u.id===altar.id)?.queue.some(q=>q.revive===h.id));resumed.order({type:'revive',ids:[altar.id],target:h.id});const queued=(await next).state;assert.ok(queued.teams[0].gold<10000);assert.equal(queued.units.find(u=>u.id===altar.id).queue[0].paidGold,S.heroRevival(h).gold);assert.ok(queued.units.find(u=>u.id===altar.id).queue[0].left<=S.heroRevival(h).time);const ticks=Math.ceil(altar.queue[0].left/S.DT)+1;for(let i=0;i<ticks;i++)S.tick(s);next=wait(resumed,v=>hero(v,h.id)?.hp>0);const alive=hero((await next).state,h.id);assert.equal(alive.heroDeath,undefined);assert.deepEqual(alive.inventory,[9]);assert.ok(S.restore(s));
  const ended=heroDeathFixture(S);killHero(S,ended);ended.h.heroDeath.age=S.heroDeathDuration(ended.s,ended.h)-.2;ended.s.winner=0;const frame=ended.s.frame;app.rooms.get(joined.code).state=ended.s;next=wait(resumed,v=>v.winner===0&&hero(v,ended.h.id)&&!hero(v,ended.h.id).heroDeath);assert.equal((await next).state.frame,frame);
  console.log('PASS hero death actual TCP: protocol 79, private enemy Death/Dissipate body, retained owner inventory/identity, mid-phase resume, fog disappearance/reappearance, body expiry, paid altar queue/revival snapshot and post-victory expiry');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
