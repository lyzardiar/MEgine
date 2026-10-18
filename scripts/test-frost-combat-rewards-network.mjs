// Author: MiYu. Authoritative kill settlement and enemy resource privacy over real TCP.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {rewardsFixture,rewardFight} from './frost-combat-rewards-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,clients=[];
async function peer(){
 const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;clients.push(socket);socket.setEncoding('utf8');
 socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});socket.on('error',()=>{});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Combat rewards TCP timeout'));},12000)};pending.push(w);});
 const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,S.PROTOCOL);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};
}
try{
 const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;
 next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=a.next(m=>m.type==='state');a.send({type:'start'});assert.equal((await next).state.combatRewardsVersion,1);
 for(const [kind,team,xp,gold] of [['humanfootman',1,40,[0,0]],['ghoul',-1,32,[26,38]]]){
  const {s,hero}=rewardsFixture(S),{killer,victim}=rewardFight(S,s,kind,team),before=s.teams[0].gold;killer.order=null;app.rooms.get(joined.code).state=s;
  next=a.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===hero.id)?.xp===xp);const other=b.next(m=>m.type==='state'&&m.state.frame>5&&m.state.combatRewardsVersion===1);a.order({type:'attack',ids:[killer.id],target:victim.id});const result=(await next).state,enemy=(await other).state;
  assert.ok(result.teams[0].gold-before>=gold[0]&&result.teams[0].gold-before<=gold[1]);assert.deepEqual(enemy.teams[0],{faction:0});assert.equal(result.teams[0].kills,1);assert.ok(S.restore(app.rooms.get(joined.code).state));
 }
 console.log('PASS combat rewards TCP: protocol '+S.PROTOCOL+', real attacks, original XP, neutral dice bounty and hidden enemy resources');
}finally{for(const socket of clients)socket.destroy();await app.close();}
