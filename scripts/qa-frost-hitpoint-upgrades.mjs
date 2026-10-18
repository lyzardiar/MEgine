// Author: MiYu. Native source HP research: all seven unit forms, every rank, complete clocks and saved ratio policy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {hitpointCases,hitpointFixture,hitpointResearch} from './test-frost-hitpoint-upgrades.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join(nativeQaRoot,'hitpoint-upgrades-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'tmp/docs-artifacts','frost-hitpoint-upgrades'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
fs.mkdirSync(out,{recursive:true});assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE);configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds','.mengine','Library','Imported'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId=path.basename(root);fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={author:'MiYu',passed:false,protocol:S.PROTOCOL,editorExecutable:process.env.MENGINE_EDITOR_EXECUTABLE,editorSha256:hash(process.env.MENGINE_EDITOR_EXECUTABLE),sourceMainSha256:hash(path.join(source,'Assets/Scripts/Main.js')),checks:[]};
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;},snapshot=()=>query('scene.snapshot'),state=async()=>JSON.parse((await snapshot()).entities.find(e=>e.name==='Frost telemetry').components.Text.text),step=async(steps=1,deltaTime=.1)=>{for(let left=steps;left>0;left-=200)await execute('playback.step',{deltaTime,steps:Math.min(200,left)});};
const key=async k=>{await execute('playback.input',{keys:[k]});await step(1,.001);await execute('playback.input',{keys:[]});await step(1,.001);},click=async p=>{await execute('playback.input',{pointer:p,viewport:[1280,720],buttons:[0]});await step(1,.001);await execute('playback.input',{pointer:p,buttons:[]});await step(2,.001);};
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(project.storageId))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',storageHash.toString(16).padStart(16,'0'));fs.mkdirSync(storage,{recursive:true});
async function load(s){fs.writeFileSync(path.join(storage,'quicksave.json'),JSON.stringify(S.restore(s)));if((await state()).mode==='title')await key('F1');if(!(await state()).paused)await key('F10');await ui('pauseLoad');const t=await state();assert.equal(t.mode,'playing');assert.equal(t.paused,false);return t;}
const ui=async name=>click(clientWorldFixture(await snapshot()).canvasPoint(name+' box'));
async function worldClick(x,z){const t=await state();await click([640+(x-t.camera[0])/t.zoom*360,360+(z-t.camera[1])*Math.sin(Math.atan2(32,42))/t.zoom*360]);}
const save=async()=>{await key('F5');return JSON.parse(fs.readFileSync(path.join(storage,'quicksave.json')));},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let playbackStarted=false;
try{
 console.log('START native source HP upgrade readiness');try{await query('project.state');}catch(e){if(!/BridgeConnectionError|request timed out/.test(e.message))throw e;}
 await execute('project.open',{root:sample});await execute('playback.play',{paused:true});playbackStarted=true;await step(2);
 for(const c of hitpointCases){
  const f=hitpointFixture(c);let game=f.s;const producerId=f.producer.id,actorId=f.unit.id;game.units.find(u=>u.id===actorId).hp=100.25;
  for(let rank=1;rank<=c.ranks;rank++){
   const producer=game.units.find(u=>u.id===producerId),r=hitpointResearch(game,c,producer),gold=game.teams[0].gold,wood=game.teams[0].wood;await load(game);await worldClick(producer.x,producer.z);const scene=await snapshot();assert.equal(scene.entities.find(e=>e.name==='action'+r.slot+' icon').components.Image.sprite,r.icon);assert.match(scene.entities.find(e=>e.name==='action'+r.slot+' label').components.Text.text,new RegExp('\\['+r.hotkey+'\\]'));
   await key('Key'+r.hotkey);const paid=await save();assert.equal(paid.units.find(u=>u.id===producerId).queue[0].research,c.key);assert.equal(paid.teams[0].gold,gold-r.gold);assert.equal(paid.teams[0].wood,wood-r.wood);assert.equal(paid.healthUpgradeVersion,1);
   await step(r.time*5);const mid=await save();near(mid.units.find(u=>u.id===producerId).queue[0].left,r.time/2);await load(mid);await step(r.time*5-1);const before=await save(),old=before.units.find(u=>u.id===actorId);assert.ok(before.units.find(u=>u.id===producerId).queue[0].left>0);await step(1);const completed=await save(),actor=completed.units.find(u=>u.id===actorId);assert.equal(actor.maxHp,old.maxHp+c.bonus);const expected=Math.max(1,Math.floor(Math.fround(Math.fround(actor.maxHp*Math.fround(old.hp/old.maxHp))+.5)))+(S.types[c.kind].healthRegen||0)*S.DT;near(actor.hp,expected);assert.equal(completed.units.find(u=>u.id===producerId).queue.length,0);game=S.restore(completed);report.checks.push({kind:c.kind,research:c.key,rank,time:r.time,sourceHotkey:r.hotkey,sourceSlot:r.slot,gold:r.gold,wood:r.wood,fullClock:true,savedContinuation:true,beforeHp:old.hp,beforeMaxHp:old.maxHp,afterHp:actor.hp,afterMaxHp:actor.maxHp});console.log('PASS native rhpx '+c.kind+' rank '+rank+': source card/hotkey, paid full clock, mid-save resume and rounded life ratio');
  }
 }
 await execute('panel.focus',{kind:'game'});const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'hitpoint-upgrades-native.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));await execute('playback.stop');const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;
}catch(e){report.error=e.stack;try{report.failedTelemetry=await state();}catch{}process.exitCode=1;console.error(e.stack);}finally{if(playbackStarted)try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;}fs.writeFileSync(path.join(out,'native-hitpoint-upgrades.json'),JSON.stringify(report,null,2));}
