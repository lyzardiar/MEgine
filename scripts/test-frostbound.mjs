// Author: MiYu. Rule, editor-data and real TCP acceptance checks.
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRequire} from 'node:module';
import {createServer} from '../samples/frostbound-realms/server.mjs';
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const step=(s,n)=>{for(let i=0;i<n;i++)S.tick(s);};
const s=S.create('skirmish',{ai:[false,false]});step(s,250);assert.ok(s.teams[0].gold>500,'workers deliver gold');assert.ok(s.teams[0].wood>250,'workers deliver lumber');
const barracks=s.units.find(u=>u.team===0&&u.kind==='barracks'),worker=s.units.find(u=>u.team===0&&u.kind==='worker');
assert.equal(S.command(s,0,{type:'train',ids:[barracks.id],kind:'archer'}),null);step(s,75);assert.ok(s.units.some(u=>u.team===0&&u.kind==='archer'));
const enemy=s.units.find(u=>u.team===1&&u.kind==='hero'),old=[enemy.x,enemy.z];S.command(s,0,{type:'move',ids:[enemy.id],x:0,z:0});assert.deepEqual([enemy.x,enemy.z],old);assert.equal(enemy.order,null,'cannot command opponent');
assert.ok(S.command(s,0,{type:'attack',ids:[worker.id],target:enemy.id}),'unseen enemy cannot be targeted');
assert.ok(S.command(s,0,{type:'build',ids:[worker.id],kind:'tower',x:NaN,z:0}));
const h=s.units.find(u=>u.team===0&&u.kind==='hero');h.x=0;h.z=0;enemy.x=2;enemy.z=0;S.visibility(s);const hp=enemy.hp;assert.equal(S.command(s,0,{type:'spell',ids:[h.id],slot:0,x:2,z:0}),null);assert.ok(enemy.hp<hp);assert.ok(S.command(s,0,{type:'spell',ids:[h.id],slot:0,x:2,z:0}),'cooldown enforced');
const route=S.path(s,{x:-10,z:0,id:0},10,0);assert.ok(route.length);assert.ok(route.every(([x,z])=>s.map.terrain[S.index(x,z)]!==1));
const map=S.defaultMap('td');map.name='Roundtrip';map.startingGold=1100;map.terrain[70]=1;assert.deepEqual(S.validateMap(JSON.parse(JSON.stringify(map))),S.validateMap(map));assert.throws(()=>S.validateMap({...map,terrain:[1]}));assert.throws(()=>S.validateMap({...map,props:[{kind:'tree',x:Infinity,z:0}]}));
const td=S.create('td');td.map.waves=3;td.map.waveInterval=10;for(const u of td.units)u.damage=0;step(td,1800);assert.equal(td.winner,1,'unopposed creeps reach the exit and win');
const win=S.create('td');win.map.waves=3;win.map.waveInterval=10;for(let i=0;i<700;i++){S.tick(win);for(const u of win.units)if(u.td)u.hp=0;if(win.winner!==null)break;}assert.equal(win.winner,0,'defeating the final wave wins');
const moba=S.create('moba',{ai:[false,false]});step(moba,42);assert.ok(moba.units.filter(u=>u.kind==='creep').length>=18,'three lanes spawn for both teams');const mh=moba.units.find(u=>u.kind==='hero');mh.hp=0;mh.respawn=.2;step(moba,3);assert.equal(mh.hp,mh.maxHp,'MOBA heroes respawn');
for(let faction=0;faction<4;faction++){
  const game=S.create('skirmish',{factions:[faction,0],ai:[false,false]}),b=game.units.find(u=>u.team===0&&u.kind==='barracks'),hall=game.units.find(u=>u.team===0&&u.kind==='hall'),roster=S.trainable(game,b);
  assert.equal(new Set(S.armies.flatMap(a=>a.units)).size,16);assert.ok(S.command(game,0,{type:'train',ids:[b.id],kind:roster[2]}),'advanced unit is locked');assert.equal(S.command(game,0,{type:'tech',ids:[hall.id]}),null);step(game,201);assert.equal(game.teams[0].tier,2);game.teams[0].gold=1000;game.teams[0].wood=1000;
  assert.equal(S.command(game,0,{type:'train',ids:[b.id],kind:roster[2]}),null);step(game,110);assert.ok(game.units.some(u=>u.kind===roster[2]&&u.team===0));
}
const triggered=S.defaultMap();triggered.units=[{kind:'archer',team:0,x:0,z:0}];triggered.triggers=[{when:'timer',action:'gold',team:0,value:2,after:-1,x:0,z:0,text:'Supply'},{when:'enter',action:'spawn',kind:'soldier',team:0,value:1,after:0,x:0,z:0,text:'Reinforcement'}];
const tg=S.create('skirmish',{map:JSON.parse(JSON.stringify(triggered)),ai:[false,false]});step(tg,25);assert.deepEqual(tg.triggered,[0,1]);const serial=tg.serial;step(tg,25);assert.equal(tg.serial,serial,'one-shot triggers do not repeat');assert.throws(()=>S.validateMap({...triggered,triggers:[{...triggered.triggers[0],after:0}]}));assert.throws(()=>S.validateMap({...triggered,units:[{kind:'constructor',team:0,x:0,z:0}]}));
const fog=S.create('skirmish',{ai:[false,false]}),fh=fog.units.find(u=>u.kind==='hero'&&u.team===0),fe=fog.units.find(u=>u.kind==='hero'&&u.team===1);fh.x=0;fh.z=0;fe.x=14;fe.z=0;S.visibility(fog);const hpHidden=fe.hp;assert.ok(S.command(fog,0,{type:'spell',ids:[fh.id],slot:0,x:14,z:0}));assert.equal(fe.hp,hpHidden);assert.equal(S.publicState(fog,0).teams[1].gold,undefined);
// Play the entire RPG with legal orders, without altering units, health, money or quest state.
let rpg=S.create('rpg'),restored=false;
for(let i=0;i<3000&&rpg.winner===null;i++){
  const hero=rpg.units.find(u=>u.kind==='hero'&&u.team===0);
  if(hero.hp>0&&i%10===0){const enemy=rpg.units.filter(u=>u.team!==0&&u.hp>0).sort((a,b)=>S.distance(a,hero)-S.distance(b,hero))[0],drop=rpg.loot[0];
    if(drop)S.command(rpg,0,{type:'move',ids:[hero.id],x:drop.x+2.2,z:drop.z});else if(enemy)S.command(rpg,0,{type:S.isVisible(rpg,0,enemy)?'attack':'attackMove',ids:[hero.id],target:enemy.id,x:enemy.x+2.2,z:enemy.z});else S.command(rpg,0,{type:'move',ids:[hero.id],x:-20.8,z:23});
    if(hero.hp<hero.maxHp*.7)S.command(rpg,0,{type:'spell',ids:[hero.id],slot:1,x:hero.x,z:hero.z});if(enemy&&S.distance(hero,enemy)<12)for(const slot of [0,3])S.command(rpg,0,{type:'spell',ids:[hero.id],slot,x:enemy.x,z:enemy.z});
  }S.tick(rpg);if(!restored&&rpg.quest.stage===1){rpg=S.restore(JSON.parse(JSON.stringify(rpg)));restored=true;}
}
assert.ok(restored);assert.equal(rpg.winner,0);assert.equal(rpg.quest.stage,4);assert.ok(rpg.units.find(u=>u.kind==='hero').inventory.length>0);console.log('PASS: four faction rosters and tech gates, one-shot map triggers, fog privacy, full RPG legal-order quest/loot/growth/save roundtrip ('+rpg.frame+' ticks)');
assert.throws(()=>S.restore({...rpg,teams:null}));assert.throws(()=>S.restore({...rpg,units:[{...rpg.units[0],spell:null}]}));assert.throws(()=>S.validateMap({...S.defaultMap('rpg'),units:[]}));
assert.equal(S.publicState(tg,1).map.units.length,0,'authored units stay on the server');assert.equal(S.publicState(tg,1).map.triggers.length,0);
const app=createServer({port:0}),address=await app.listening,peers=[];
async function peer(){const messages=[],waiting=[];const socket=net.connect(address.port,'127.0.0.1');await new Promise((r,j)=>{socket.once('connect',r);socket.once('error',j);});let buffer='';socket.setEncoding('utf8');socket.on('data',b=>{buffer+=b;let end;while((end=buffer.indexOf('\n'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);messages.push(m);for(const w of [...waiting])if(w.predicate(m)){waiting.splice(waiting.indexOf(w),1);clearTimeout(w.timer);w.resolve(m);}}});const p={socket,messages,send:m=>socket.write(JSON.stringify(m)+'\n'),next:predicate=>new Promise((resolve,reject)=>{const w={predicate,resolve,timer:setTimeout(()=>reject(Error('Network message timed out')),6000)};waiting.push(w);})};peers.push(p);const welcome=p.next(m=>m.type==='welcome');p.send({type:'hello',protocol:1,name:'Tester'});await welcome;return p;}
try{
  const a=await peer(),b=await peer();let next=a.next(m=>m.type==='joined');a.send({type:'create',mode:'skirmish'});const joined=await next;
  next=b.next(m=>m.type==='joined');b.send({type:'join',code:joined.code});const guest=await next;assert.notEqual(guest.team,joined.team);
  const ready=a.next(m=>m.type==='room'&&m.players.length===2&&m.players.every(p=>p.ready));a.send({type:'ready',ready:true});b.send({type:'ready',ready:true});await ready;
  next=a.next(m=>m.type==='state');a.send({type:'start'});let state=(await next).state;assert.ok(state.units.every(u=>u.team!==1),'fog hides the distant opponent');
  const hero=state.units.find(u=>u.kind==='hero'),before=[hero.x,hero.z];a.send({type:'order',seq:1,command:{type:'move',ids:[hero.id],x:-16,z:15}});state=(await a.next(m=>m.type==='state'&&m.state.frame>12)).state;const moved=state.units.find(u=>u.id===hero.id);assert.ok(Math.hypot(moved.x-before[0],moved.z-before[1])>.5);
  next=a.next(m=>m.type==='error');a.send({type:'order',seq:1,command:{type:'move',ids:[hero.id],x:0,z:0}});assert.match((await next).message,/Stale/);
  b.socket.destroy();await new Promise(r=>setTimeout(r,100));const c=await peer();next=c.next(m=>m.type==='joined');c.send({type:'resume',code:guest.code,token:guest.token});assert.equal((await next).team,guest.team);
  next=a.next(m=>m.type==='room'&&m.players.length===1);c.send({type:'leave'});await next;assert.equal(app.rooms.get(joined.code).state.teams[1].ai,true,'AI takes over a voluntarily vacated team');
  console.log('PASS: economy, production, ownership, fog, spell cooldown, navigation, map validation, TD defeat/victory, MOBA lanes/respawn, TCP rooms/orders/reconnect');
}finally{for(const p of peers)p.socket.destroy();await app.close();}
