// Author: MiYu. Native source repair icons, actual R/right-click commands, costs and saved jobs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {repairFixture} from './test-frost-worker-repair.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join(nativeQaRoot,'worker-repair-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'tmp/docs-artifacts','frost-worker-repair'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
fs.mkdirSync(out,{recursive:true});assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE);configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds','.mengine','Library','Imported'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId=path.basename(root);fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={author:'MiYu',passed:false,protocol:S.PROTOCOL,editorExecutable:process.env.MENGINE_EDITOR_EXECUTABLE,editorSha256:hash(process.env.MENGINE_EDITOR_EXECUTABLE),sourceMainSha256:hash(path.join(source,'Assets/Scripts/Main.js')),checks:[]};
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;},snapshot=()=>query('scene.snapshot'),state=async()=>JSON.parse((await snapshot()).entities.find(e=>e.name==='Frost telemetry').components.Text.text),step=(steps=1,deltaTime=.1)=>execute('playback.step',{deltaTime,steps});
const key=async k=>{await execute('playback.input',{keys:[k]});await step(1,.001);await execute('playback.input',{keys:[]});await step(1,.001);},click=async p=>{await execute('playback.input',{pointer:p,viewport:[1280,720],buttons:[0]});await step(1,.001);await execute('playback.input',{pointer:p,buttons:[]});await step(2,.001);};
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(project.storageId))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',storageHash.toString(16).padStart(16,'0'));fs.mkdirSync(storage,{recursive:true});
async function load(s){fs.writeFileSync(path.join(storage,'quicksave.json'),JSON.stringify(S.restore(s)));if((await state()).mode==='title')await key('F1');if(!(await state()).paused)await key('F10');await ui('pauseLoad');const t=await state();assert.equal(t.mode,'playing');assert.equal(t.paused,false);return t;}
const ui=async name=>click(clientWorldFixture(await snapshot()).canvasPoint(name+' box'));
async function worldClick(x,z){const t=await state();await click([640+(x-t.camera[0])/t.zoom*360,360+(z-t.camera[1])*Math.sin(Math.atan2(32,42))/t.zoom*360]);}
const save=async()=>{await key('F5');return JSON.parse(fs.readFileSync(path.join(storage,'quicksave.json')));},near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let playbackStarted=false;
try{
 console.log('START native worker repair readiness');try{await query('project.state');}catch(e){if(!/BridgeConnectionError|request timed out/.test(e.message))throw e;}
 await execute('project.open',{root:sample});await execute('playback.play',{paused:true});playbackStarted=true;await step(2);
 for(const faction of [0,1,2,3]){
  const {s,worker,target}=repairFixture(faction),r=S.workerRepair(s,worker),d=S.unitType(target);await load(s);await worldClick(worker.x,worker.z);assert.deepEqual((await state()).selected,[worker.id]);let scene=await snapshot();assert.equal(scene.entities.find(e=>e.name==='action5 icon').components.Image.sprite,r.icon);assert.match(scene.entities.find(e=>e.name==='action5 label').components.Text.text,/R/);
  await key('KeyR');await worldClick(target.x,target.z);assert.equal((await state()).worker.order.type,'repair');await step(20);const saved=await save(),a=saved.units.find(u=>u.id===target.id),paid=saved.teams[0];assert.ok(a.hp>target.hp);near(s.teams[0].gold-paid.gold,d.gold*(a.hp-target.hp)/target.maxHp*.35);near(s.teams[0].wood-paid.wood,d.wood*(a.hp-target.hp)/target.maxHp*.35);assert.equal(saved.units.find(u=>u.id===worker.id).order.target,target.id);
  await load(saved);const expected=S.restore(saved);for(let i=0;i<10;i++)S.tick(expected);await step(10);const continued=await save();near(continued.units.find(u=>u.id===target.id).hp,expected.units.find(u=>u.id===target.id).hp);near(continued.teams[0].gold,expected.teams[0].gold);
  await worldClick((await state()).worker.x,(await state()).worker.z);await key('KeyS');const stopped=await save(),hp=stopped.units.find(u=>u.id===target.id).hp;assert.equal(stopped.units.find(u=>u.id===worker.id).order,null);await step(5);near((await save()).units.find(u=>u.id===target.id).hp,hp);
  const t=await state(),point=[640+(target.x-t.camera[0])/t.zoom*360,360+(target.z-t.camera[1])*Math.sin(Math.atan2(32,42))/t.zoom*360];await execute('playback.input',{pointer:point,viewport:[1280,720],buttons:[2]});await step(1,.001);await execute('playback.input',{pointer:point,buttons:[]});await step(1,.001);assert.equal((await state()).worker.order.type,'repair');await step(3);assert.ok((await save()).units.find(u=>u.id===target.id).hp>hp);
  report.checks.push({faction,ability:r.id,sourceIcon:r.icon,manualHotkey:true,rightClick:true,savedContinuation:true,costRatio:.35});console.log('PASS native repair '+r.id+': original command icon/R, mechanical target, source payment, saved continuation, Stop and right click');
 }
 await execute('panel.focus',{kind:'game'});const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'worker-repair-native.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));await execute('playback.stop');const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;
}catch(e){report.error=e.stack;try{report.failedTelemetry=await state();}catch{}process.exitCode=1;console.error(e.stack);}finally{if(playbackStarted)try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;}fs.writeFileSync(path.join(out,'native-worker-repair.json'),JSON.stringify(report,null,2));}
