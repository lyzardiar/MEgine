// Author: MiYu. Isolated native worker HUD, paid training and saved continuation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {workerFixture} from './test-frost-worker-balance.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join(nativeQaRoot,'worker-balance-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'tmp/docs-artifacts/frost-worker-balance'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
fs.mkdirSync(out,{recursive:true});assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE);configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds','.mengine','Library','Imported'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId=path.basename(root);fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={author:'MiYu',passed:false,protocol:S.PROTOCOL,editorExecutable:process.env.MENGINE_EDITOR_EXECUTABLE,editorSha256:hash(process.env.MENGINE_EDITOR_EXECUTABLE),sourceMainSha256:hash(path.join(source,'Assets/Scripts/Main.js')),checks:[]};
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;},snapshot=()=>query('scene.snapshot'),state=async()=>JSON.parse((await snapshot()).entities.find(e=>e.name==='Frost telemetry').components.Text.text),step=(steps=1)=>execute('playback.step',{deltaTime:.1,steps});
const key=async k=>{await execute('playback.input',{keys:[k]});await step();await execute('playback.input',{keys:[]});await step();},click=async p=>{await execute('playback.input',{pointer:p,viewport:[1280,720],buttons:[0]});await step();await execute('playback.input',{pointer:p,buttons:[]});await step(2);};
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(project.storageId))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',storageHash.toString(16).padStart(16,'0'));fs.mkdirSync(storage,{recursive:true});
async function load(s){fs.writeFileSync(path.join(storage,'quicksave.json'),JSON.stringify(S.restore(s)));if((await state()).mode==='title')await key('F1');if(!(await state()).paused)await key('F10');await ui('pauseLoad');const t=await state();assert.equal(t.mode,'playing');assert.equal(t.paused,false);return t;}
const ui=async name=>click(clientWorldFixture(await snapshot()).canvasPoint(name+' box'));
async function worldClick(x,z){const t=await state();await click([640+(x-t.camera[0])/t.zoom*360,360+(z-t.camera[1])*Math.sin(Math.atan2(32,42))/t.zoom*360]);}
let playbackStarted=false;
try{
 console.log('START native worker balance readiness');try{await query('project.state');}catch(e){if(!/BridgeConnectionError|request timed out/.test(e.message))throw e;}
 await execute('project.open',{root:sample});await execute('playback.play',{paused:true});playbackStarted=true;await step(2);console.log('START native worker scenarios');
 for(const [faction,hp,label] of [[0,220,'Peasant'],[1,250,'Peon'],[3,220,'Acolyte']]){
  const {s,hall,worker}=workerFixture(faction);await load(s);let t=await state();assert.equal(t.worker.maxHp,hp);assert.equal(t.worker.mana,0);await worldClick(hall.x,hall.z);t=await state();assert.deepEqual(t.selected,[hall.id]);const scene=await snapshot();assert.equal(scene.entities.find(e=>e.name==='action8 label').components.Text.text,label+' 75');const before=t.gold;await ui('action8');t=await state();assert.equal(t.gold,before-75);assert.equal(t.production.find(u=>u.id===hall.id).queue.length,1);
  await key('F5');const saved=JSON.parse(fs.readFileSync(path.join(storage,'quicksave.json')));await load(saved);t=await state();assert.equal(t.production.find(u=>u.id===hall.id).queue.length,1);await step(150);t=await state();const trained=t.gatherers.find(u=>u.id!==worker.id&&u.team===0);assert.ok(trained);assert.equal(trained.maxHp,hp);assert.equal(trained.mana,0);assert.equal(t.production.find(u=>u.id===hall.id).queue.length,0);report.checks.push({faction,label,hp,source:trained.workerBalance,paid:75,fullTraining:true,savedQueue:true});console.log('PASS native '+label+' source HUD, paid full training and saved queue');
 }
 await key('Space');await execute('panel.focus',{kind:'game'});await step(2);const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'worker-balance-native.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
 await execute('playback.stop');const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;console.log('PASS native worker balance scenarios: '+report.checks.length);
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}finally{if(playbackStarted)try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;}fs.writeFileSync(path.join(out,'native-worker-balance.json'),JSON.stringify(report,null,2));}
