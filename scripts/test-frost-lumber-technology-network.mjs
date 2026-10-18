// Author: MiYu. Real TCP Rhlh ownership, paid ranks, private research and reconnect.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {lumberTechnologyFixture} from './test-frost-lumber-technology.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(){
 const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
 socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Lumber technology TCP timeout'));},12000)};pending.push(w);});
 const welcome=next(m=>m.type==='welcome');send({type:'hello',protocol:S.PROTOCOL});assert.equal((await welcome).protocol,109);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};
}
const unit=(s,id)=>s.units.find(u=>u.id===id),wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state)),near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
try{
 let a=await peer();const b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});assert.equal((await next).state.lumberTechnologyVersion,1);
 const {s,worker,hall,mill}=lumberTechnologyFixture();S.spawn(s,'soldier',1,-6,4,{damage:0,order:{type:'hold'}});S.visibility(s);app.rooms.get(joined.code).state=s;
 next=b.next(m=>m.type==='error');b.order({type:'lumberResearch',ids:[mill.id]});assert.ok((await next).message);next=a.next(m=>m.type==='error');a.order({type:'lumberResearch',ids:[mill.id]});assert.match((await next).message,/prerequisites/);
 for(const rank of [1,2]){
  hall.upgradeTier=rank+1;S.updateTechnology(s);const r=S.lumberTechnology.levels[rank-1],gold=s.teams[0].gold;next=wait(a,state=>unit(state,mill.id)?.queue[0]?.rank===rank);a.order({type:'lumberResearch',ids:[mill.id]});let paid=(await next).state;assert.equal(paid.teams[0].gold,gold-r.gold);assert.equal(unit(paid,mill.id).queue[0].research,'Rhlh');assert.ok(unit(paid,mill.id).queue[0].left<=r.time);
  const enemy=(await wait(b,state=>state.frame>=paid.frame)).state;assert.deepEqual(unit(enemy,mill.id).queue,[]);assert.equal(enemy.teams[0].lumberResearch,undefined);assert.ok(S.restore(s));
  const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;a=await peer();next=a.next(m=>m.type==='joined');a.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(resumed.lumberTechnologyVersion,1);assert.equal(unit(resumed,mill.id).queue[0].rank,rank);assert.equal(resumed.teams[0].gold,gold-r.gold);
  mill.queue[0].left=.2;const complete=(await wait(a,state=>state.teams[0].lumberResearch===rank)).state;assert.equal(S.lumberHarvester(complete,unit(complete,worker.id)).capacity,10+rank*10);assert.ok(S.restore(s));console.log('PASS TCP Rhlh rank '+rank+': real ownership/prerequisite rejection, exact payment, private shared queue, mid-research reconnect and completed capacity');
 }
 next=wait(a,state=>unit(state,worker.id)?.cargo===1);a.order({type:'gather',ids:[worker.id],resource:0});const cut=(await next).state;assert.equal(cut.resources[0].hp,49);assert.equal(S.lumberHarvester(cut,unit(cut,worker.id)).capacity,30);assert.equal(S.lumberHarvester(cut,unit(cut,worker.id)).damage,1);assert.ok(S.restore(s));console.log('PASS TCP Rhlh harvest: rank2 capacity30 retains original one-point tree/cargo strike');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
