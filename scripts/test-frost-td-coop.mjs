// Author: MiYu. Real TCP verifies shared-defense authority, independent seats and reconnect ownership.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js'),app=createServer({port:0}),address=await app.listening,peers=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){const end=Date.now()+7000;while(Date.now()<end){if(check())return;await sleep(20);}throw Error('Timed out: '+label);}
async function peer(protocol=S.PROTOCOL){
 const socket=net.connect(address.port,'127.0.0.1'),messages=[];let buffer='';const p={socket,messages,send:m=>socket.write(JSON.stringify(m)+'\n'),next:async check=>{await until(()=>messages.some(check),'TCP '+check);return messages.find(check);}};peers.push(p);
 socket.setEncoding('utf8');socket.on('error',()=>{});socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){messages.push(JSON.parse(buffer.slice(0,end)));buffer=buffer.slice(end+1);}});
 await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});p.send({type:'hello',protocol});await p.next(m=>m.type==='welcome'||m.type==='error');return p;
}
let monitoredState;const applied=[],originalCommand=S.command;S.command=(state,team,command)=>{const result=originalCommand(state,team,command);if(state===monitoredState)applied.push({frame:state.frame,team,command,result});return result;};
const report={author:'MiYu',passed:false,checks:[]};
try{
 const old=await peer(S.PROTOCOL-1);assert.match(old.messages.at(-1).message,/Protocol version mismatch/);old.socket.destroy();
 const a=await peer(),b=await peer(),map=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/Assets/Maps/td.json',import.meta.url)));
 a.send({type:'create',map,heroClass:2});const host=await a.next(m=>m.type==='joined');b.send({type:'join',code:host.code,heroClass:1});const guest=await b.next(m=>m.type==='joined');
 assert.equal(host.team,0);assert.equal(guest.team,0);assert.equal(host.seat,0);assert.equal(guest.seat,1);const room=app.rooms.get(host.code);
 b.send({type:'start'});await b.next(m=>m.type==='error'&&/Only the host can start/.test(m.message));b.send({type:'pick',heroClass:1});await b.next(m=>m.type==='error'&&/Only the host can choose/.test(m.message));assert.equal(room.sharedHeroClass,2);
 a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await until(()=>room.players.every(p=>p.ready),'ready');
 // Both disconnect, then the original host alone resumes. Shared configuration stays unchanged.
 a.socket.destroy();await until(()=>!room.players[0].client,'host disconnect');assert.equal(room.owner,1);assert.equal(room.sharedHeroClass,2);
 b.socket.destroy();await until(()=>!room.players[1].client,'guest disconnect');
 const c=await peer();c.send({type:'resume',code:host.code,token:host.token});const recovered=await c.next(m=>m.type==='joined');await c.next(m=>m.type==='room'&&m.owner===0);assert.equal(recovered.seat,0);assert.equal(room.sharedHeroClass,2);
 room.players.find(p=>p.seat===1).expires=Date.now()-1;await c.next(m=>m.type==='room'&&m.players.length===1);assert.equal(room.owner,0);
 const d=await peer();d.send({type:'join',code:host.code});const replacement=await d.next(m=>m.type==='joined');assert.equal(replacement.seat,1);assert.equal(replacement.team,0);
 c.send({type:'pick',heroClass:2});await until(()=>room.players.every(p=>!p.ready),'pick resets ready');c.send({type:'ready',ready:true});d.send({type:'ready',ready:true});await until(()=>room.players.every(p=>p.ready),'new guest ready');c.send({type:'start'});
 const initial=(await c.next(m=>m.type==='state')).state;monitoredState=room.state;assert.equal(initial.mode,'td');assert.equal(initial.teams[0].heroClass,2);assert.deepEqual(room.state.teams.map(t=>t.ai),[false,false]);
 const worker=initial.units.find(u=>u.kind==='worker'),hero=initial.units.find(u=>u.kind==='hero'),tower=initial.units.find(u=>u.kind==='tower');assert.ok(worker&&hero&&tower);
 c.send({type:'order',seq:1,command:{type:'build',ids:[worker.id],kind:'tower',x:-16,z:-13}});d.send({type:'order',seq:1,command:{type:'build',ids:[worker.id],kind:'tower',x:-8,z:-17}});
 await until(()=>room.state.units.filter(u=>u.kind==='tower').length===3,'both build');assert.equal(room.state.teams[0].gold,650-2*S.types.tower.gold);
 // Competing upgrades at a single shared budget are serialized; only one can spend the last 100 gold.
 room.state.teams[0].gold=100;const errorCount=c.messages.concat(d.messages).filter(m=>m.type==='error').length;
 c.send({type:'order',seq:2,command:{type:'towerUpgrade',ids:[tower.id]}});d.send({type:'order',seq:2,command:{type:'towerUpgrade',ids:[tower.id]}});
 await until(()=>c.messages.concat(d.messages).filter(m=>m.type==='error').length>errorCount,'overspend rejected');assert.equal(room.state.units.find(u=>u.id===tower.id).level,2);assert.equal(room.state.teams[0].gold,0);
 // Synchronous production-parser intake holds both seat queues before a tick; other requests travel over real TCP.
 await until(()=>room.queue.length===0,'empty queue');const queueStart=applied.length;const intake=(seat,message)=>room.players.find(p=>p.seat===seat).client.socket.emit('data',JSON.stringify(message)+'\n');for(let seq=3;seq<=14;seq++)intake(0,{type:'order',seq,command:{type:'hold',ids:[hero.id]}});intake(1,{type:'order',seq:3,command:{type:'stop',ids:[hero.id]}});assert.equal(room.queue.length,13,'both seats enqueue synchronously before the next simulation step');
 await until(()=>room.players[0].client.lastSeq===14&&room.players[1].client.lastSeq===3,'independent sequence');await until(()=>room.queue.length===0,'queues drain');assert.equal(applied.length-queueStart,13);assert.equal(new Set(applied.slice(queueStart).map(a=>a.frame)).size,1);assert.ok(applied.slice(queueStart).every(a=>a.result===null));
 assert.ok(!d.messages.some(m=>m.type==='error'&&/queue full/.test(m.message)));
 room.state.nextWave=room.state.frame+1;await until(()=>room.state.units.some(u=>u.td),'wave spawn');const creep=room.state.units.find(u=>u.td),creepId=creep.id;
 d.send({type:'order',seq:4,command:{type:'hold',ids:[creepId],team:1}});await until(()=>room.players[1].client.lastSeq===4,'spoof request consumed');await until(()=>room.queue.length===0,'spoof processed');assert.notEqual(room.state.units.find(u=>u.id===creepId)?.order?.type,'hold','guest cannot control attacking creeps');
 const commonFrame=room.state.frame+2;await c.next(m=>m.type==='state'&&m.state.frame>=commonFrame);await d.next(m=>m.type==='state'&&m.state.frame>=commonFrame);
 const left=c.messages.find(m=>m.type==='state'&&m.state.frame===commonFrame),right=d.messages.find(m=>m.type==='state'&&m.state.frame===commonFrame);assert.deepEqual(left.state,right.state,'cooperative players receive identical public state');
 d.send({type:'order',seq:5,command:{type:'hold',ids:[hero.id]}});await until(()=>room.state.units.find(u=>u.id===hero.id).order?.type==='hold','hold before reconnect');
 d.socket.destroy();await until(()=>!room.players[1].client,'guest dropped');assert.equal(room.state.teams[0].ai,false);
 const e=await peer();e.send({type:'resume',code:host.code,token:replacement.token});const resumed=await e.next(m=>m.type==='joined');assert.equal(resumed.seat,1);assert.equal(resumed.team,0);assert.equal(resumed.state.mode,'td');
 e.send({type:'order',seq:1,command:{type:'stop',ids:[hero.id]}});await until(()=>room.state.units.find(u=>u.id===hero.id).order===null,'resumed seq1 applied');
  // Force final loss through the production tick and check both defenders share the outcome semantics.
 room.state.lives=1;const runner=room.state.units.find(u=>u.id===creepId);runner.x=-23;runner.z=23;runner.waypoint=runner.route.length-1;
 const finished=await e.next(m=>m.type==='state'&&m.state.winner!==null);assert.equal(finished.state.winner,1);assert.equal(finished.state.lives,0);const hostFinished=await c.next(m=>m.type==='state'&&m.state.winner!==null);assert.deepEqual(hostFinished.state,finished.state);c.send({type:'leave'});await e.next(m=>m.type==='room'&&m.owner===1&&m.players.length===1);assert.equal(room.state.teams[0].ai,false);
 report.checks.push('protocol rejection','two independent seats on defending team','guest host/hero permissions','double disconnect owner recovery','offline slot expiry publication','shared hero survives owner transfer','shared building budget','atomic competing upgrades','per-seat queue allowance under synchronous parser intake','creep control rejection','full public state equality','reconnect sequence reset','leave without defender AI','shared loss');
 e.send({type:'start'});await e.next(m=>m.type==='error'&&/Match already started/.test(m.message));
 // Competitive modes retain separate teams, heroes and AI takeover.
 for(const mode of ['skirmish','moba']){const x=await peer(),y=await peer();x.send({type:'create',mode,heroClass:0});const joined=await x.next(m=>m.type==='joined');y.send({type:'join',code:joined.code,heroClass:1});const joinedGuest=await y.next(m=>m.type==='joined');assert.equal(joinedGuest.team,1);assert.equal(joinedGuest.seat,1);const duel=app.rooms.get(joined.code);x.send({type:'ready',ready:true});y.send({type:'ready',ready:true});await until(()=>duel.players.every(p=>p.ready),'competitive ready');x.send({type:'start'});await x.next(m=>m.type==='state');assert.deepEqual(duel.state.teams.map(t=>t.heroClass),[0,1]);assert.deepEqual(duel.state.teams.map(t=>t.ai),[false,false]);y.send({type:'leave'});await until(()=>duel.state.teams[1].ai,'competitive AI takeover');x.socket.destroy();y.socket.destroy();report.checks.push(mode+' teams, heroes and AI takeover');}
 c.send({type:'create',map});const victoryRoom=await c.next(m=>m.type==='joined'&&m.code!==host.code);e.send({type:'join',code:victoryRoom.code});await e.next(m=>m.type==='joined'&&m.code===victoryRoom.code);const defense=app.rooms.get(victoryRoom.code);c.send({type:'ready',ready:true});e.send({type:'ready',ready:true});await until(()=>defense.players.every(p=>p.ready),'victory fixture ready');c.send({type:'start'});await until(()=>defense.state!==null,'victory fixture started');defense.state.wave=defense.map.waves;defense.state.nextWave=Math.round(defense.map.waveInterval/S.DT)+100;defense.state.frame=defense.state.nextWave-Math.round(defense.map.waveInterval/S.DT)+11;const won=await c.next(m=>m.type==='state'&&m.state.winner===0),guestWon=await e.next(m=>m.type==='state'&&m.state.winner===0);assert.deepEqual(won.state,guestWon.state);report.checks.push('shared victory after final cleared wave');
 // Generated client: mouse and keyboard reach TD; readiness uses seat, never the shared team.
 const root=new URL('../samples/frostbound-realms/',import.meta.url),source=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
 assert.equal(new Set(scene.entities.map(e=>e.entity)).size,scene.entities.length,'unique generated entity IDs');
 const world=clientWorldFixture(scene),events=[],sent=[],engine=Object.assign(world.engine,{network:{poll:()=>events.splice(0),send:m=>sent.push(JSON.parse(JSON.stringify(m))),connect(){},close(){}},storage:{load:()=>null,save(){}},assets:{sampleNodes:()=>[]},playAudio(){}}),ctx=vm.createContext({engine});
 vm.runInContext(source.replace('  return {tick};','  return {tick,action,inspect:()=>({mode,team,seat,state,camera})};'),ctx);engine.input={keys:[],pressedKeys:[],releasedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720]};const tick=()=>world.render(ctx.onTick,.1);tick();ctx.FrostClient.action('network');tick();
 engine.input.pointer=[640,408];engine.input.pressedButtons=[0];tick();events.push({type:'connected'});tick();assert.equal(sent.find(m=>m.type==='create').map.mode,'td','visible cooperation button creates TD');
 const lobby={type:'room',mode:'td',phase:'lobby',owner:0,sharedHeroClass:2,players:[{seat:0,team:0,ready:true,heroClass:2,name:'Host'},{seat:1,team:0,ready:false,heroClass:1,name:'Guest'}]};events.push({type:'message',data:{...guest,state:null}},{type:'message',data:lobby});tick();ctx.FrostClient.action('modalPrimary');assert.deepEqual(sent.at(-1),{type:'ready',ready:true},'guest readies its own seat');
 const before=sent.length;ctx.FrostClient.action('lobbyHero');assert.equal(sent.length,before,'guest cannot request a shared hero change');lobby.players[1].ready=true;events.push({type:'message',data:lobby});tick();ctx.FrostClient.action('modalPrimary');assert.equal(sent.length,before,'ready guest does not start as shared team0');
 ctx.FrostClient.inspect().state.frame=50;events.push({type:'message',data:{...lobby,phase:'playing'}});tick();assert.equal(ctx.FrostClient.inspect().mode,'lobby','room metadata must not resume a previous battle state');events.push({type:'message',data:{type:'state',state:initial}});tick();assert.deepEqual(JSON.parse(JSON.stringify(ctx.FrostClient.inspect().camera)),[worker.x,worker.z]);
 ctx.FrostClient.action('network');engine.input.pressedKeys=['F4'];tick();events.push({type:'connected'});tick();assert.equal(sent.filter(m=>m.type==='create').at(-1).map.mode,'td','F4 creates TD');
 report.checks.push('generated scene IDs','mouse cooperation entry','keyboard cooperation entry','guest readiness identity','client shared hero permission','guest cannot start','defense camera');report.passed=true;
}finally{S.command=originalCommand;for(const p of peers)p.socket.destroy();await app.close();}
fs.writeFileSync(new URL('../docs/designs/frostbound-realms/td-coop-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
