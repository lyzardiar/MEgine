// Author: MiYu. Two real Players exercise the production client's authoritative TCP and reconnect paths.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from '../samples/frostbound-realms/server.mjs';

const mobaQa=process.argv.includes('--moba-objectives');
const priorityQa=process.argv.includes('--td-priority');
const waveQa=process.argv.includes('--td-waves'),mapOption=waveQa?'--td-waves':'--td-map';
const customMap=process.argv.includes(mapOption)?process.argv[process.argv.indexOf(mapOption)+1]:null;
if(process.argv.includes(mapOption)&&!customMap)throw Error(mapOption+' requires a JSON map file');
const cooperative=process.argv.includes('--td')||!!customMap||priorityQa;
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms');
const executable=path.resolve(process.env.MENGINE_RUNTIME_EXECUTABLE||path.join(repo,'target/release/mengine-runtime'+(process.platform==='win32'?'.exe':'')));
const projectRoot=path.resolve(process.env.MENGINE_QA_PROJECT_ROOT||source),tag=Date.now(),root=path.join(process.env.MENGINE_QA_ROOT||path.join(os.tmpdir(),'mengine-qa'),(mobaQa?'native-moba-objectives-':priorityQa?'native-td-targeting-':waveQa?'native-td-waves-':customMap?'native-td-route-':cooperative?'native-td-coop-':'native-authority-')+tag);
const S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
const identityRun=spawnSync(executable,['--runtime-info'],{encoding:'utf8',windowsHide:true,timeout:30000});
assert.equal(identityRun.status,0,identityRun.error?.message||identityRun.stderr);const identity=JSON.parse(identityRun.stdout);assert.equal(identity.backend,'v8');
fs.mkdirSync(root,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const project=JSON.parse(fs.readFileSync(path.join(projectRoot,'project.json')));
function storageRoot(storageName){
  let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(storageName))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);
  return path.join(process.env.LOCALAPPDATA||process.env.XDG_DATA_HOME||path.join(os.homedir(),'.local/share'),'MEngine/UserData',storageHash.toString(16).padStart(16,'0'));
}
const map=cooperative?JSON.parse(fs.readFileSync(customMap||path.join(source,'Assets/Maps/td.json'))):S.defaultMap(mobaQa?'moba':'skirmish');if(!cooperative&&!mobaQa){for(const key of ['terrain','heights','ramps','relief'])map[key].fill(0);map.props=[];map.doodads=[];map.triggers=[];
map.name='Native authority acceptance';map.units=[{kind:'soldier',team:0,x:-2,z:0},{kind:'soldier',team:1,x:2,z:0},{kind:'hero',heroClass:0,team:0,x:-18,z:18},{kind:'hero',heroClass:0,team:1,x:18,z:-18}];map.players.forEach(p=>p.ai=false);}
fs.writeFileSync(path.join(root,'fixture-map.json'),JSON.stringify(map));
const originalCreate=S.create;S.create=(mode,options)=>{const state=originalCreate(mode,options);if(mobaQa){state.nextWave=180;for(const u of state.units){if(u.mobaObjective){u.hp=50;u.damage=0;}if(u.kind==='hero'){u.hp=u.maxHp=10000;u.damage=1000;u.speed=12;}}S.visibility(state);}else for(const unit of state.units)if(unit.kind==='soldier')unit.hp=112.00000000000001;return state;};
const applied=[],originalCommand=S.command;S.command=(state,team,command)=>{
  const units=state.units.filter(u=>command.ids?.includes(u.id)),before=units.map(u=>({id:u.id,hp:u.hp,order:structuredClone(u.order)}));
  const goldBefore=state.teams[team].gold,error=originalCommand(state,team,command);applied.push({frame:state.frame,team,command:structuredClone(command),error,before,goldBefore,goldAfter:state.teams[team].gold,after:units.map(u=>({id:u.id,hp:u.hp,order:structuredClone(u.order)}))});return error;
};
const app=createServer({port:0});await app.listening;
const started=Date.now(),peers=[],wire=new Map(),events=[];let dropGuestStates=false,droppedStates=0,comparisonFrame=null;
app.server.on('connection',socket=>{
  const connection=events.filter(e=>e.type==='connected').length+1;events.push({type:'connected',connection,at:Date.now()-started});
  const originalWrite=socket.write;socket.write=function(data,...args){
    const message=JSON.parse(String(data)),client=[...app.clients].find(c=>c.socket===socket),team=client?.player?.seat;
    if(message.type==='error')events.push({type:'server-error',connection,team,message:message.message});
    const state=message.type==='state'?message.state:message.type==='joined'?message.state:null;
    if(message.type==='state'&&comparisonFrame!==null&&state.frame>comparisonFrame)return true;
    if(state&&team!==undefined)wire.set(team+':'+state.frame,{hash:hash(canonical(state)),units:state.units.map(u=>({id:u.id,x:u.x,z:u.z,hp:u.hp,mana:u.mana,kind:u.kind,team:u.team})),hidden:state.units.length<client.room.state.units.length});
    if(message.type==='state'&&team===1&&dropGuestStates){droppedStates++;return true;}
    return originalWrite.call(this,data,...args);
  };
  let buffer='';socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const text=buffer.slice(0,end);buffer=buffer.slice(end+1);try{const m=JSON.parse(text);events.push({type:m.type,connection,at:Date.now()-started,...(m.type==='order'?{seq:m.seq,command:m.command}:{})});}catch{}}});
  socket.on('timeout',()=>events.push({type:'timeout',connection}));socket.on('close',()=>events.push({type:'closed',connection}));
});
const originalSource=fs.readFileSync(path.join(source,'Assets/Scripts/Main.js'),'utf8');
assert.equal(originalSource.split('  return {tick};').length,2,'production client inspection anchor');
assert.equal(originalSource.split("address='127.0.0.1:7788'").length,2,'production server address anchor');
function launch(index){
  const key=(mobaQa?'native-moba-objectives-':priorityQa?'native-td-targeting-':waveQa?'native-td-waves-':customMap?'native-td-route-':cooperative?'native-td-coop-':'native-authority-')+tag+'-'+index,script=path.join(root,'peer-'+index+'.js');
  const peerProject=path.join(root,'project-'+index),storage=storageRoot(key);fs.mkdirSync(peerProject);fs.mkdirSync(storage,{recursive:true});
  fs.writeFileSync(path.join(peerProject,'project.json'),JSON.stringify({...project,storageId:key}));
  if(mobaQa){const linkTree=(from,to)=>{fs.mkdirSync(to,{recursive:true});for(const entry of fs.readdirSync(from,{withFileTypes:true})){const src=path.join(from,entry.name),dst=path.join(to,entry.name);if(fs.statSync(src).isDirectory())linkTree(src,dst);else fs.linkSync(src,dst);}};linkTree(path.join(projectRoot,'Assets'),path.join(peerProject,'Assets'));}else fs.symlinkSync(path.join(projectRoot,'Assets'),path.join(peerProject,'Assets'),process.platform==='win32'?'junction':'dir');
  const expose='  return {tick,action,order,inspect:()=>({state,online,mode,team,seat,seq,room,rooms})};';
  const content=originalSource.replace('  return {tick};',expose).replace("address='127.0.0.1:7788'","address='127.0.0.1:"+app.server.address().port+"'");
  const wrapper=`
// Owned QA instrumentation calls production actions; networking and rendering remain native.
var qaKey=${JSON.stringify(key)},qaMoba=${mobaQa},qaMobaTarget=0,qaMobaHeld=false,qaMobaCombat=false,qaMobaInitial=false,qaCoop=${cooperative},qaPeer=${index},qaMap=${JSON.stringify(map)},qaStarted=Date.now(),qaBoot=false,qaOrder=false,qaResume=false,qaResumes=0,qaLocalTicks=0,qaTicks=0,qaSnapshots=0,qaBatch=[],qaBatchIndex=0,qaLastFrame=-1,qaLastJson='',qaSavedAt=0,qaFinished=false,qaActionAt=0,qaPriority=false;
function qaFlush(){if(qaBatch.length){engine.storage.save(qaKey+'-batch-'+qaBatchIndex++,qaBatch);qaBatch=[];}}
if(qaCoop)FrostMapCatalog.td=JSON.parse(JSON.stringify(qaMap));
var qaDefaultMap=Frost.defaultMap;Frost.defaultMap=function(mode){return !mode||mode==='skirmish'?JSON.parse(JSON.stringify(qaMap)):qaDefaultMap(mode);};
var qaSimulationTick=Frost.tick;Frost.tick=function(state){if(FrostClient.inspect().online){qaLocalTicks++;throw Error('Online native client attempted independent simulation');}return qaSimulationTick(state);};
var qaOriginalTick=onTick;
onTick=function(dt,frame){
 if(qaFinished)return;
 try{
  engine.input={keys:[],pressedKeys:[],buttons:[],pressedButtons:[],releasedButtons:[],pointer:[640,360],viewport:[1280,720],wheel:0};
  qaOriginalTick(dt,frame);qaTicks++;var now=Date.now(),v=FrostClient.inspect();
  if(!qaBoot){qaBoot=true;FrostClient.action(qaPeer===0?(qaMoba?'netMoba':qaCoop?'netTd':'netSkirmish'):'netBrowse');}
  if(v.mode==='rooms'&&now>qaActionAt){FrostClient.action(v.rooms.length?'modalPrimary':'roomRefresh');qaActionAt=now+1000;}
  if(v.mode==='lobby'&&now>qaActionAt){var self=v.room?.players.find(p=>p.seat===v.seat);if(!self?.ready||(qaPeer===0&&v.room.players.length===2&&v.room.players.every(p=>p.ready)))FrostClient.action('modalPrimary');qaActionAt=now+500;}
  if(v.mode==='reconnecting')qaResume=true;
  if(v.mode==='playing'){
   var own=v.state.units.find(u=>u.kind==='soldier'&&u.team===v.team),enemy=v.state.units.find(u=>u.kind==='soldier'&&u.team!==v.team);
   var hero=v.state.units.find(u=>u.kind==='hero'&&u.team===v.team&&u.hp>0);
   if(!qaOrder&&qaCoop&&hero){var worker=v.state.units.find(u=>u.kind==='worker'&&u.team===v.team);if(worker){FrostClient.order({type:'build',ids:[worker.id],kind:'tower',x:qaPeer===0?-16:-8,z:qaPeer===0?-13:-17});if(qaPeer===1)FrostClient.order({type:'hold',ids:[hero.id]});qaOrder=true;}}
   if(${priorityQa}&&!qaPriority&&v.state.frame>=(qaPeer===0?10:30)){var tower=v.state.units.find(u=>u.kind==='tower'&&u.team===v.team&&u.built===1);if(tower){FrostClient.order({type:'tdPriority',ids:[tower.id],priority:qaPeer===0?'strongest':'weakest'});qaPriority=true;}}
   if(!qaOrder&&!qaCoop&&!qaMoba&&own&&enemy&&hero){FrostClient.order(qaPeer===0?{type:'attack',ids:[own.id],target:enemy.id}:{type:'hold',ids:[own.id,hero.id]});qaOrder=true;}
   if(qaMoba&&qaMobaCombat&&hero&&!qaMobaHeld){var lane=qaPeer===0?0:2;var objectives=v.state.mobaObjectives.filter(o=>o.team!==v.team&&o.lane===lane&&o.alive&&(o.role==='tower'||o.role==='melee'));var next=objectives.sort((a,b)=>(a.role==='tower'?a.tier:4)-(b.role==='tower'?b.tier:4))[0];if(next&&next.id!==qaMobaTarget){var visible=v.state.units.find(u=>u.id===next.id);if(visible){FrostClient.order({type:'attack',ids:[hero.id],target:next.id});qaMobaTarget=next.id;}else if(now>qaActionAt){var site=Frost.mobaObjectives.layout(1-v.team).find(o=>o.role===next.role&&o.lane===next.lane&&o.tier===next.tier);FrostClient.order({type:'move',ids:[hero.id],x:site.p[0],z:site.p[1]});qaActionAt=now+1000;}}else if(!next){FrostClient.order({type:'hold',ids:[hero.id]});qaMobaHeld=true;}}
   if(qaResume){qaResume=false;qaResumes++;if(!hero)throw Error('No living hero for reconnect command');FrostClient.order({type:'stop',ids:[hero.id]});}
   if(qaMoba&&v.state.mobaObjectives.every(o=>o.alive))qaMobaInitial=true;
   var serialized=JSON.stringify(v.state);
   if(v.state.frame===qaLastFrame&&serialized!==qaLastJson)throw Error('Client changed authoritative state without a new server frame');
   if(v.state.frame!==qaLastFrame){
    qaBatch.push(JSON.parse(serialized));qaSnapshots++;if(qaBatch.length===4)qaFlush();if(qaSnapshots>500)throw Error('Native acceptance captured-frame deadline');
   }
   qaLastFrame=v.state.frame;qaLastJson=serialized;
  }
  if(now-qaSavedAt>250){qaSavedAt=now;var command=engine.storage.load(qaKey+'-control');if(command?.combat)qaMobaCombat=true;var report={initialObjectives:qaMobaInitial,mode:v.mode,frame:v.state?.frame,team:v.team,resumes:qaResumes,localSimulationTicks:qaLocalTicks,clientTicks:qaTicks,snapshots:qaSnapshots,elapsed:now-qaStarted};engine.storage.save(qaKey+'-status',report);if(command?.finish){qaFlush();qaFinished=true;engine.storage.save(qaKey+'-final',report);engine.quit();}}
  if(now-qaStarted>120000)throw Error('Native authority acceptance deadline');
 }catch(error){qaFinished=true;engine.storage.save(qaKey+'-failure',{message:String(error),stack:error.stack});engine.quit();}
};
`;
  fs.writeFileSync(script,content+wrapper);
  const stdout=fs.openSync(path.join(root,'peer-'+index+'.stdout.log'),'w'),stderr=fs.openSync(path.join(root,'peer-'+index+'.stderr.log'),'w');
  const child=spawn(executable,['--project-root',peerProject,'--scene',path.join(source,'Assets/Scenes/Main.mscene'),'--script',script,'--title','MEngine native authority '+index],{windowsHide:true,stdio:['ignore',stdout,stderr]});
  fs.closeSync(stdout);fs.closeSync(stderr);
  const peer={index,key,child,script,storage,project:peerProject,exit:null,error:null};peer.done=new Promise(resolve=>{child.once('error',e=>{peer.error=String(e);resolve();});child.once('exit',(code,signal)=>{peer.exit={code,signal};resolve();});});peers.push(peer);
  fs.writeFileSync(path.join(root,'owners.json'),JSON.stringify({executable,started:tag,players:peers.map(p=>({pid:p.child.pid,script:p.script}))},null,2));return peer;
}
function read(peer,key){try{return JSON.parse(fs.readFileSync(path.join(peer.storage,key+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e;}}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){for(const peer of peers){const failure=read(peer,peer.key+'-failure');if(failure)throw Error('Player '+peer.index+': '+failure.message);if(peer.error)throw Error(peer.error);if(peer.exit)throw Error('Player '+peer.index+' exited before '+label+': '+JSON.stringify(peer.exit));}if(await check())return;await sleep(100);}throw Error('Native authority timeout: '+label);}
const status=peer=>read(peer,peer.key+'-status');
const report={author:'MiYu',passed:false,scope:'Two standalone V8 Players on one host, production generated client and scene, real authoritative TCP. Every distinct authoritative frame presented by a client is checked. Scripted game actions, no physical input or two-machine acceptance.',fixture:{mapFile:path.join(root,'fixture-map.json'),mapSha256:hash(canonical(map)),...(mobaQa?{mode:'moba',objectiveHp:50,objectiveDamage:0,heroHp:10000,heroDamage:1000,heroSpeed:12,firstWaveDelayAfterBaseline:180,scope:'Accelerated objective combat fixture; not a complete match or balance acceptance.'}:cooperative?{mode:'td',unmodifiedShippedMap:!customMap,customMap:customMap?path.resolve(customMap):null}:{initialSoldierHp:112.00000000000001}),instrumentation:mobaQa?'Expose native client actions; authoritative setup lowers objective HP, increases hero stats, waits for both clients to capture intact objectives, then positions heroes near opposing T1 towers. Native clients send normal move/attack/hold orders through the server; two corresponding melee barracks are destroyed, future waves and reconnect are compared. Isolated storage and physical asset paths backed by file hard links on the same volume.':cooperative?'Expose private client inspection/actions; load the recorded TD map into the client catalog and call the production cooperation menu; replace physical input with empty input; fail on online simulation. Each Player has isolated storage and an Assets directory link.':'Expose private client inspection/actions; replace default skirmish map with a flat map containing opposing soldiers and heroes, no props/doodads/triggers; assign precision sentinel HP at server creation; replace physical input with empty input; fail on any online simulation tick. Each Player has an isolated project storage ID and an Assets directory link to the supplied project.'},runtime:identity,executable,executableSha256:hash(fs.readFileSync(executable)),clientSha256:hash(originalSource),sceneSha256:hash(fs.readFileSync(path.join(source,'Assets/Scenes/Main.mscene'))),projectRoot,root};
try{
  const host=launch(0),guest=launch(1);
  if(mobaQa){
    await until(()=>status(host)?.initialObjectives&&status(guest)?.initialObjectives,"both clients capture intact objectives");
    const state=[...app.rooms.values()][0].state;assert.ok(state.mobaObjectives.every(o=>o.alive));
    for(const u of state.units.filter(u=>u.kind==="hero")){u.x=u.team?13:-13;u.z=u.team?20:-20;}state.nextWave=state.frame+180;S.visibility(state);
    report.combatStartFrame=state.frame;for(const peer of peers)fs.writeFileSync(path.join(peer.storage,peer.key+"-control.json"),JSON.stringify({combat:true}));
  }
  await until(()=>status(host)?.frame>=(mobaQa?report.combatStartFrame+205:cooperative?135:15)&&status(guest)?.frame>=(mobaQa?report.combatStartFrame+205:cooperative?135:15),'both clients receive live match');
  assert.equal(app.rooms.size,1);const room=[...app.rooms.values()][0];assert.equal(room.players.length,2);
  console.log('PASS two native clients create, browse, join, ready and start');
  if(cooperative){assert.deepEqual(room.players.map(p=>p.team),[0,0]);assert.deepEqual(room.players.map(p=>p.seat),[0,1]);assert.deepEqual(room.state.teams.map(t=>t.ai),[false,false]);const builds=applied.filter(a=>a.command.type==='build');assert.equal(builds.length,2);assert.ok(builds.every(a=>a.error===null&&a.goldBefore-a.goldAfter===S.types.tower.gold));assert.ok(room.state.wave>=1);assert.deepEqual(room.state.map.tdPath,map.tdPath);assert.ok(room.state.units.some(u=>u.td&&canonical(u.route)===canonical(map.tdPath)));report.sharedBuilds=builds;report.wave=room.state.wave;}
  const oldGuest=[...app.clients].find(c=>c.player?.seat===1);if(mobaQa){assert.ok(oldGuest.lastSeq>=5);assert.equal(room.state.mobaObjectives.filter(o=>o.role==='melee'&&!o.alive).length,2);assert.ok(room.state.units.some(u=>u.mobaReinforcement===1));assert.ok(S.restore(room.state));}else assert.equal(oldGuest.lastSeq,priorityQa?3:cooperative?2:1);assert.ok(applied.some(a=>a.team===(cooperative?0:1)&&a.command.type==='hold'&&a.error===null));
  dropGuestStates=true;const lastSent=Math.max(...[...wire.keys()].filter(k=>k.startsWith('1:')).map(k=>Number(k.slice(2))));
  await until(()=>status(guest)?.frame===lastSent,'guest consumes the last snapshot sent before withholding');
  const held=status(guest).frame,guestTicks=status(guest).clientTicks,hostBefore=status(host).frame;
  await sleep(1400);assert.equal(status(guest).frame,held,'missing snapshots must not advance native guest');assert.ok(status(guest).clientTicks>guestTicks,'guest keeps executing callbacks while snapshots are withheld');assert.ok(status(host).frame>hostBefore,'host continues receiving authority');assert.ok(droppedStates>0);report.guestTicksWhileStalled=status(guest).clientTicks-guestTicks;dropGuestStates=false;
  await until(()=>status(guest).frame>held,'guest catches up after withheld snapshots');report.stalledGuestFrame=held;report.droppedSnapshots=droppedStates;
  console.log('PASS missing snapshots hold guest simulation, then recover');
  const before=[...app.clients].find(c=>c.player?.seat===1);assert.ok(before);before.socket.destroy();
  await until(()=>status(guest).resumes===1&&[...app.clients].some(c=>c!==before&&c.player?.seat===1),'real guest TCP reconnect');
  await until(()=>events.some(e=>e.type==='resume')&&events.some(e=>e.type==='order'&&e.connection===events.find(v=>v.type==='resume').connection&&e.seq===1),'sequence restarts on resumed connection');
  await until(()=>applied.some(a=>a.team===(cooperative?0:1)&&a.command.type==='stop'),'resumed command applied by authority');
  const resumedClient=[...app.clients].find(c=>c.player?.seat===1),stop=applied.find(a=>a.team===(cooperative?0:1)&&a.command.type==='stop');
  assert.equal(resumedClient.lastSeq,1);assert.equal(stop.error,null);assert.ok(stop.before.some(u=>u.hp>0&&u.order?.type==='hold'));assert.ok(stop.after.some(u=>u.hp>0&&u.order===null));report.resumedCommand=stop;
  const resumeFrame=status(guest).frame;await until(()=>status(host).frame>resumeFrame+10&&status(guest).frame>resumeFrame+10,'continued state after reconnect');
  console.log('PASS native reconnect restores match and resets order sequence');
  if(mobaQa){comparisonFrame=room.state.frame+1;await until(()=>status(host)?.frame===comparisonFrame&&status(guest)?.frame===comparisonFrame,'both clients present the same authoritative comparison frame');report.comparisonFrame=comparisonFrame;}
  for(const peer of peers)fs.writeFileSync(path.join(peer.storage,peer.key+'-control.json'),JSON.stringify({finish:true}));
  let exitTimer;try{await Promise.race([Promise.all(peers.map(p=>p.done)),new Promise((_,reject)=>{exitTimer=setTimeout(()=>reject(Error('Players did not exit normally')),15000);})]);}finally{clearTimeout(exitTimer);}
  let comparisons=0,shared=0,hidden=0,precise=0;const captured=new Map();
  for(const peer of peers){assert.deepEqual(peer.exit,{code:0,signal:null});const final=read(peer,peer.key+'-final');assert.ok(final);assert.equal(final.localSimulationTicks,0);assert.ok(final.snapshots>=4);peer.final=final;
    const files=fs.readdirSync(peer.storage).filter(f=>f.startsWith(peer.key+'-batch-')),states=files.flatMap(file=>JSON.parse(fs.readFileSync(path.join(peer.storage,file))));assert.equal(states.length,final.snapshots,'every presented new frame has evidence');
    for(const state of states){const expected=wire.get(peer.index+':'+state.frame);assert.ok(expected,'server frame recorded');assert.equal(hash(canonical(state)),expected.hash,'native state equals complete authoritative public snapshot');comparisons++;if(expected.hidden)hidden++;if(state.units.some(u=>u.hp===112.00000000000001))precise++;captured.set(peer.index+':'+state.frame,state);}
  }
  for(const [key,left] of captured){if(!key.startsWith('0:'))continue;const right=captured.get('1:'+left.frame);if(!right)continue;if(cooperative)assert.deepEqual(left,right,'cooperative complete state equality');if(mobaQa)assert.deepEqual(left.mobaObjectives,right.mobaObjectives,'opposing clients share objective progression despite fog');for(const unit of left.units){const other=right.units.find(u=>u.id===unit.id);if(other){for(const key of ['x','z','hp','mana','kind','team','mobaObjective','mobaProtected','mobaReinforcement'])assert.deepEqual(unit[key],other[key],'shared actor '+key);shared++;}}}
  if(priorityQa){const changes=applied.filter(a=>a.command.type==='tdPriority');assert.equal(changes.length,2);assert.deepEqual(changes.map(a=>a.command.priority),['strongest','weakest']);assert.ok(changes.every(a=>a.error===null));assert.equal(changes[0].command.ids[0],changes[1].command.ids[0]);const id=changes[0].command.ids[0];for(let seat=0;seat<2;seat++){const states=[...captured].filter(([key])=>key.startsWith(seat+':')).map(([,state])=>state);for(const priority of ['strongest','weakest'])assert.ok(states.some(s=>s.units.find(u=>u.id===id)?.tdPriority===priority));assert.equal(states.at(-1).units.find(u=>u.id===id)?.tdPriority,'weakest');}report.priorityCommands=changes;}
  if(waveQa){const observed=[];for(let seat=0;seat<2;seat++){const monsters=new Map();for(const [key,state]of captured){if(!key.startsWith(seat+':'))continue;assert.deepEqual(state.map.tdWaves,map.tdWaves,'authored waves preserved on native client');for(const u of state.units.filter(u=>u.td))monsters.set(u.id,{kind:u.kind,hp:u.maxHp,speed:u.speed,bounty:u.tdBounty,lives:u.tdLives,boss:u.tdBoss});}for(const g of map.tdWaves[0].groups)assert.ok([...monsters.values()].filter(u=>Object.keys(u).every(k=>u[k]===g[k])).length>=g.count,'native seat observes every authored monster group');observed.push({seat,monsters:[...monsters.values()]});}report.authoredWaves=observed;}
  if(mobaQa){for(const seat of [0,1]){const states=[...captured].filter(([key])=>key.startsWith(seat+':')).map(([,state])=>state);assert.ok(states.some(s=>s.mobaObjectives.every(o=>o.alive)));assert.ok(states.some(s=>s.mobaObjectives.filter(o=>o.role==='melee'&&!o.alive).length===2));assert.ok(states.some(s=>s.units.some(u=>u.team===seat&&u.mobaReinforcement===1)));assert.equal(states.at(-1).mobaObjectives.filter(o=>o.role==='melee'&&!o.alive).length,2);}assert.ok(applied.every(a=>a.error===null));report.objectiveCommands=applied;report.objectives=room.state.mobaObjectives;}
  assert.ok(shared>0);if(!cooperative){assert.ok(hidden>0);if(!mobaQa)assert.ok(precise>0);}assert.equal(events.filter(e=>e.type==='timeout').length,0);assert.deepEqual(events.filter(e=>e.type==='server-error'),[]);
  report.snapshotComparisons=comparisons;report.sharedActorComparisons=shared;report.fogFilteredSnapshots=hidden;report.exactFloatSnapshots=precise;report.clients=peers.map(p=>({pid:p.child.pid,project:p.project,storage:p.storage,instrumentedScriptSha256:hash(fs.readFileSync(p.script)),final:p.final,exit:p.exit}));report.passed=true;
}catch(error){report.error=String(error.stack||error);throw error;}
finally{
  for(const peer of peers)if(!peer.exit&&!peer.error)peer.child.kill();await Promise.all(peers.map(p=>p.done));await app.close();S.create=originalCreate;S.command=originalCommand;
  report.elapsedMs=Date.now()-started;report.events=events;fs.writeFileSync(path.join(root,'report.json'),JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(path.join(repo,'docs/designs/frostbound-realms/'+(mobaQa?'native-moba-objectives-validation.json':priorityQa?'native-td-targeting-validation.json':waveQa?'native-td-wave-validation.json':customMap?'native-td-route-validation.json':cooperative?'native-td-coop-validation.json':'native-v8-authority-validation.json')),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({passed:report.passed,comparisons:report.snapshotComparisons,sharedActors:report.sharedActorComparisons,elapsedMs:report.elapsedMs,report:path.join(root,'report.json')}));
