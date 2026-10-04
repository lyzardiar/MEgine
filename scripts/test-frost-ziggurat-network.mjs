// Author: MiYu. TCP ownership, cancellation and reconnect for both Ziggurat upgrade branches.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,clients=[];
async function peer(protocol=S.PROTOCOL){
 const socket=net.connect(address.port,'127.0.0.1'),pending=[];let buffer='';clients.push(socket);socket.setEncoding('utf8');socket.on('error',()=>{});
 socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);for(const w of [...pending])if(w.check(m)){pending.splice(pending.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});const send=m=>socket.write(JSON.stringify(m)+'\n'),next=check=>new Promise((resolve,reject)=>{const w={check,resolve,timer:setTimeout(()=>reject(Error('TCP Ziggurat timeout')),10000)};pending.push(w);}),welcome=next(m=>m.type==='welcome'||m.type==='error');send({type:'hello',protocol});const response=await welcome;if(protocol===S.PROTOCOL)assert.equal(response.protocol,S.PROTOCOL);else assert.match(response.message,/Protocol version mismatch/);return {socket,send,next};
}
try{
 await peer(30);const a=await peer(),b=await peer(),map=S.defaultMap();for(const field of ['terrain','heights','ramps','relief'])map[field].fill(0);map.props=[];map.players.forEach(p=>p.ai=false);map.startingGold=1000;map.startingWood=500;map.units=[{kind:'farm',team:0,x:-10,z:10},{kind:'farm',team:0,x:-4,z:10},{kind:'soldier',team:1,x:2,z:10}];
 let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish',map,faction:3});const joined=await next;next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code,faction:0});await next;
 next=a.next(m=>m.type==='room'&&m.players.length===2&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await next;next=a.next(m=>m.type==='state');a.send({type:'start'});const initial=(await next).state,farms=initial.units.filter(u=>u.kind==='farm'&&u.team===0),id=farms[0].id,ice=farms[1].id,room=app.rooms.get(joined.code);let seq=0;
 for(const u of room.state.units.filter(u=>u.team===1)){u.damage=0;u.speed=0;}const target=room.state.units.find(u=>u.kind==='soldier'&&u.team===1);target.hp=target.maxHp=10000;
 next=a.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===id)?.zigguratUpgrade);a.send({type:'order',seq:++seq,command:{type:'zigguratUpgrade',ids:[id],kind:'spirittower'}});const upgrading=(await next).state;assert.equal(upgrading.units.find(u=>u.id===id).zigguratUpgrade.kind,'spirittower');assert.equal(S.population(upgrading,0).cap,30);
 next=b.next(m=>m.type==='error');b.send({type:'order',seq:1,command:{type:'cancelZigguratUpgrade',ids:[id]}});assert.match((await next).message,/No Ziggurat/);assert.ok(room.state.units.find(u=>u.id===id).zigguratUpgrade);
 const treasury=room.state.teams[0].gold;next=a.next(m=>m.type==='state'&&!m.state.units.find(u=>u.id===id)?.zigguratUpgrade);a.send({type:'order',seq:++seq,command:{type:'cancelZigguratUpgrade',ids:[id]}});await next;assert.ok(room.state.teams[0].gold>=treasury+108);
 next=a.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===ice)?.zigguratUpgrade);a.send({type:'order',seq:++seq,command:{type:'zigguratUpgrade',ids:[ice],kind:'nerubiantower'}});await next;
 const close=new Promise(resolve=>a.socket.once('close',resolve));a.socket.destroy();await close;const c=await peer();next=c.next(m=>m.type==='joined');c.send({type:'resume',code:joined.code,token:joined.token});const resumed=(await next).state;assert.equal(resumed.units.find(u=>u.id===ice).zigguratUpgrade.kind,'nerubiantower');assert.ok(resumed.units.find(u=>u.id===ice).zigguratUpgrade.left<=30);
 room.state.units.find(u=>u.id===ice).zigguratUpgrade.left=.2;next=c.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===ice)?.kind==='nerubiantower');const complete=(await next).state;assert.equal(S.population(complete,0).cap,30);
 next=c.next(m=>m.type==='state'&&m.state.units.some(u=>u.id===target.id&&u.cold>0));const chilled=(await next).state.units.find(u=>u.id===target.id);assert.ok(chilled.hp<10000);assert.equal(S.moveRate(chilled),.5);assert.equal(S.attackRate(chilled),.75);
 next=c.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===id)?.zigguratUpgrade);c.send({type:'order',seq:1,command:{type:'zigguratUpgrade',ids:[id],kind:'spirittower'}});await next;room.state.units.find(u=>u.id===id).zigguratUpgrade.left=.2;
 next=c.next(m=>m.type==='state'&&m.state.units.find(u=>u.id===id)?.kind==='spirittower');const final=(await next).state;assert.equal(S.population(final,0).cap,30);assert.equal(final.units.find(u=>u.id===id).maxHp,550);
 console.log('PASS TCP Ziggurat: protocol 31/old-client rejection, both branches, supply, foreign cancellation rejection, refund, mid-upgrade reconnect, projectile cold and completion; final completion timers shortened in authoritative fixture');
}finally{for(const socket of clients)socket.destroy();await app.close();}
