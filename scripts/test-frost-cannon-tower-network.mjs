// Author: MiYu. Real TCP Cannon Tower upgrade, source projectile, opponent view and reconnect.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {cannonTowerFixture,cannonBoundaryFixture} from './frost-cannon-tower-fixture.mjs';
import {artilleryTargetsFixture} from './frost-artillery-targets-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,sockets=[];
async function peer(protocol=S.PROTOCOL){const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='',seq=0;sockets.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const message=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(message)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(message);}}});await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>{pending.splice(pending.indexOf(w),1);reject(Error('Cannon Tower TCP timeout: '+check.toString()));},12000)};pending.push(w);});const welcome=next(m=>m.type===(protocol===S.PROTOCOL?'welcome':'error'));send({type:'hello',protocol});const response=await welcome;if(protocol!==S.PROTOCOL){assert.match(response.message,/Protocol version mismatch/);socket.destroy();return;}assert.equal(response.protocol,116);return {socket,send,next,order:command=>send({type:'order',seq:++seq,command})};}
const unit=(s,id)=>s.units.find(u=>u.id===id),wait=(p,check)=>p.next(m=>m.type==='state'&&check(m.state)).catch(e=>{throw Error(e.message+' predicate: '+check.toString());});
try{
 await peer(114);let a=await peer();const b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});await next;next=a.next(m=>m.type==='room'&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=wait(a,()=>true);a.send({type:'start'});await next;
 const {s,tower,target}=cannonTowerFixture(S,{upgrade:true});app.rooms.get(joined.code).state=s;await wait(a,state=>unit(state,tower.id)?.kind==='scouttower');next=b.next(m=>m.type==='error');b.order({type:'cannonTower',ids:[tower.id]});assert.ok((await next).message);
 next=wait(a,state=>unit(state,tower.id)?.guardTowerUpgrade?.kind==='cannontower');a.order({type:'cannonTower',ids:[tower.id]});await next;assert.equal(s.teams[0].gold,9830);assert.equal(s.teams[0].wood,9900);while(tower.kind==='scouttower')S.tick(s);
 const shots=await Promise.all([wait(a,state=>state.projectiles.some(p=>p.art==='cannon-tower')),wait(b,state=>state.projectiles.some(p=>p.art==='cannon-tower'))]);for(const {state} of shots){const p=state.projectiles.find(p=>p.art==='cannon-tower');assert.equal(p.damage,undefined);assert.equal(p.weaponSlot,undefined);}
 assert.ok(s.projectiles.some(p=>p.weaponSlot===1&&p.damage>=90&&p.damage<=111));
 const closed=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await closed;a=await peer();next=a.next(m=>m.type==='joined');a.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(unit(resumed,tower.id).kind,'cannontower');assert.equal(unit(resumed,tower.id).damage,100.5);await wait(a,state=>unit(state,target.id)?.hp<target.maxHp);assert.ok(S.restore(s));
 console.log('PASS TCP Cannon ownership, upgrade payment, both-client projectile privacy, reconnect and actual damage');
 for(const radius of [50,100,125]){
  const f=cannonBoundaryFixture(S,{radius}),hp=f.victim.hp;app.rooms.get(joined.code).state=f.s;
  const hit=await wait(a,state=>state.frame>=15&&state.projectiles.length===0);
  assert.ok(Math.abs(hp-unit(hit.state,f.victim.id).hp-f.expected)<1e-5);assert.ok(S.restore(f.s));
 }
 console.log('PASS TCP Cannon authoritative inner splash tolerance and strict outer cutoff');
 for(const kind of ['cannontower','humanmortar'])for(const mode of ['ground','unit','ward']){
  const f=artilleryTargetsFixture(S,{kind,mode}),hp=f.primary.hp,other=f.nearby.hp;app.rooms.get(joined.code).state=f.s;
  await wait(a,state=>state.frame<5&&unit(state,f.attacker.id)?.kind===kind);
  const states=await Promise.all([wait(a,state=>state.frame>=20&&state.projectiles.length===0),wait(b,state=>state.frame>=20&&state.projectiles.length===0)]);
  for(const {state} of states){assert.equal(unit(state,f.nearby.id).hp,other);const primary=unit(state,f.primary.id);if(mode==='ward')assert.ok((primary?.hp||0)<hp);else assert.equal(primary.hp,hp);}
  assert.ok(S.restore(f.s));
 }
 console.log('PASS TCP Cannon/Mortar ward target masks and matching impacts for both peers');
}finally{for(const socket of sockets)socket.destroy();await app.close();}
