// Author: MiYu. Native Arcane Tower upgrade, damage panel and original missile replay.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {arcaneFixture} from './frost-arcane-tower-fixture.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join(nativeQaRoot,'arcane-tower-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'tmp/docs-artifacts','frost-arcane-tower'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
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
 console.log('START native Arcane Tower QA');for(let attempt=0;;attempt++){try{await query('project.state');break;}catch(e){if(attempt>=20||!/Workspace services are not ready|BridgeConnectionError|request timed out/.test(e.message))throw e;await new Promise(r=>setTimeout(r,500));}}
 await execute('project.open',{root:sample});await execute('playback.play',{paused:true});playbackStarted=true;await step(2);
 {
  const f=arcaneFixture(S,{upgrade:true});await load(f.s);await worldClick(f.tower.x,f.tower.z);await key('KeyN');let saved=await save();assert.equal(saved.units.find(u=>u.id===f.tower.id).guardTowerUpgrade.left,50);await step(499);saved=await save();assert.equal(saved.units.find(u=>u.id===f.tower.id).kind,'scouttower');await load(saved);await step(1);saved=await save();assert.equal(saved.units.find(u=>u.id===f.tower.id).kind,'arcanetower');
  await worldClick(f.tower.x,f.tower.z);let scene=await snapshot();assert.equal(scene.entities.find(e=>e.name==='HUD Stat Attack value').components.Text.text.split('\n')[0],'8 - 10');assert.ok(scene.entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('HumanTower')&&/#pose=9:/.test(e.components.MeshRenderer.mesh)));
  await step(4);saved=await save();assert.ok(saved.projectiles.some(p=>p.art==='arcane-tower'));scene=await snapshot();assert.ok(scene.entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/OrbOfDeathMissile/')));await load(saved);await step(8);saved=await save();assert.equal(saved.units.find(u=>u.id===f.target.id).feedbackAmount,24);assert.ok(S.restore(saved));scene=await snapshot();assert.ok(scene.entities.some(e=>e.active&&e.components.SampledEffect?.effect?.includes('ArcaneTowerFeedback')));
  report.checks.push({fullUpgrade:true,sourceModel:true,sourceMissile:true,savedFlight:true,feedback:24});console.log('PASS native Arcane full upgrade, 8-10 HUD, source body/missile/Feedback and saved impact');
 }
 {
  const f=arcaneFixture(S);f.target.x=20;f.s.teams[0].humanSanctum.Rhse=1;S.refreshMagicSentry(f.s);S.visibility(f.s);await load(f.s);await worldClick(0,0);await key('KeyR');await worldClick(20,0);await step(2);let saved=await save();assert.equal(saved.arcaneReveals.length,1);assert.ok(saved.units.find(u=>u.id===f.tower.id).arcaneRevealCd>179);let scene=await snapshot();assert.ok(scene.entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/CrystalBallCaster/')));
  await execute('panel.focus',{kind:'game'});const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'arcane-native.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
  await load(saved);await step(155);saved=await save();assert.equal(saved.arcaneReveals.length,0);scene=await snapshot();assert.ok(!scene.entities.some(e=>e.active&&e.components.SampledEffect?.effect?.includes('ArcaneTowerReveal')));
  report.checks.push({revealHotkey:true,remoteDetection:true,sourceCaster:true,savedArea:true,expiry:true});console.log('PASS native Reveal ground targeting, original effect, save/load and expiry');
 }
 report.testedMainSha256=hash(path.join(sample,'Assets/Scripts/Main.js'));assert.equal(report.testedMainSha256,report.sourceMainSha256);await execute('playback.stop');const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;
}catch(e){report.error=e.stack;try{report.failedTelemetry=await state();}catch{}process.exitCode=1;console.error(e.stack);}finally{if(playbackStarted)try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;}fs.writeFileSync(path.join(out,'native-arcane-tower.json'),JSON.stringify(report,null,2));}
