// Author: MiYu. Native Guard Tower upgrade, damage panel and original missile replay.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {guardTowerFixture} from './frost-guard-tower-fixture.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join(nativeQaRoot,'guard-tower-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'tmp/docs-artifacts','frost-guard-tower'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
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
 console.log('START native Guard Tower readiness');try{await query('project.state');}catch(e){if(!/BridgeConnectionError|request timed out/.test(e.message))throw e;}
 await execute('project.open',{root:sample});await execute('playback.play',{paused:true});playbackStarted=true;await step(2);
 for(const targetKind of ['cryptfiend','gargoyle']){
  const f=guardTowerFixture(S,{upgrade:targetKind==='cryptfiend',targetKind});f.target.cd=999;await load(f.s);await worldClick(f.tower.x,f.tower.z);
  if(targetKind==='cryptfiend'){
   await key('KeyG');let saved=await save(),tower=saved.units.find(u=>u.id===f.tower.id);assert.equal(tower.guardTowerUpgrade.left,50);assert.equal(saved.teams[0].gold,9930);assert.equal(saved.teams[0].wood,9950);
   await step(499);saved=await save();tower=saved.units.find(u=>u.id===f.tower.id);assert.equal(tower.kind,'scouttower');near(tower.guardTowerUpgrade.left,.1);await load(saved);await step(1);saved=await save();tower=saved.units.find(u=>u.id===f.tower.id);assert.equal(tower.kind,'guardtower');assert.equal(tower.guardTowerRules,1);assert.equal(tower.damage,25);await step(3);
  }else await step(4);
  await worldClick(f.tower.x,f.tower.z);let scene=await snapshot();assert.equal(scene.entities.find(e=>e.name==='HUD Stat Attack value').components.Text.text.split('\n')[0],'23 - 27');
  await step(1);let saved=await save(),p=saved.projectiles.find(p=>p.guardTowerRules===1);assert.ok(p);assert.equal(p.art,'guard-tower');assert.ok(p.damage>=23&&p.damage<=27);assert.ok(p.y>p.baseY);
  scene=await snapshot();const parts=scene.entities.filter(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/GuardTowerMissile/'));assert.ok(parts.length>0,'original missile rendered');assert.ok(parts.some(e=>e.components.MeshRenderer.mesh.includes('#pose=')));
  await execute('panel.focus',{kind:'game'});const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'guard-'+targetKind+'-native.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
  const before=structuredClone(saved.projectiles),hp=saved.units.find(u=>u.id===f.target.id).hp;await load(saved);saved=await save();assert.deepEqual(saved.projectiles,before);await step(5);saved=await save();assert.ok(saved.units.find(u=>u.id===f.target.id).hp<hp);
  if(targetKind==='cryptfiend'){await step(90);saved=await save();assert.ok(saved.projectileSerial>=10);assert.ok(saved.units.find(u=>u.id===f.target.id).hp>0);}
  report.checks.push({targetKind,fullUpgrade:targetKind==='cryptfiend',continuousShots:targetKind==='cryptfiend'?saved.projectileSerial:0,damageRange:[23,27],sourceMissile:true,curvedFlight:true,savedMissile:true,actualHit:true});console.log('PASS native Guard Tower '+targetKind+': source weapon panel, original sampled missile, arc, saved projectile and hit');
 }
 for(const [x,shots] of [[8.5,1],[11.5,0]]){
  const f=guardTowerFixture(S);S.tick(f.s);f.target.x=x;S.visibility(f.s);await load(f.s);await step(3);const saved=await save();assert.equal(saved.projectileSerial,shots);assert.equal(saved.units.find(u=>u.id===f.tower.id).weaponWindup,undefined);assert.ok(S.restore(saved));
  if(shots)assert.ok((await snapshot()).entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/GuardTowerMissile/')));
  report.checks.push({releaseRange:x,shots,savedWindup:true});console.log('PASS native Guard release range '+x+': expected shots '+shots);
 }
 {const f=guardTowerFixture(S);S.tick(f.s);f.target.x=8.5;S.visibility(f.s);await load(f.s);await worldClick(f.tower.x,f.tower.z);await key('KeyS');await step(3);const saved=await save();assert.equal(saved.projectileSerial,0);assert.equal(saved.units.find(u=>u.id===f.tower.id).weaponWindup,undefined);report.checks.push({stopKey:true,shots:0});console.log('PASS native Guard Stop key cancels buffered windup');}
 for(const [targetKind,x,shots] of [['cryptfiend',8.039,1],['cryptfiend',8.041,0],['gargoyle',7.79,1]]){
  const f=guardTowerFixture(S,{targetKind});f.target.x=x;S.visibility(f.s);await load(f.s);const checkpoint=await save();await load(checkpoint);await step(4);const saved=await save();assert.equal(saved.projectileSerial,shots);
  if(shots)assert.ok((await snapshot()).entities.some(e=>e.active&&e.components.MeshRenderer?.mesh.includes('/GuardTowerMissile/')));
  report.checks.push({collisionTarget:targetKind,x,shots,savedAcquisition:true});console.log('PASS native Guard collision '+targetKind+' at '+x+': expected shots '+shots);
 }
 report.testedMainSha256=hash(path.join(sample,'Assets/Scripts/Main.js'));assert.equal(report.testedMainSha256,report.sourceMainSha256);await execute('playback.stop');const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;
}catch(e){report.error=e.stack;try{report.failedTelemetry=await state();}catch{}process.exitCode=1;console.error(e.stack);}finally{if(playbackStarted)try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;}fs.writeFileSync(path.join(out,'native-guard-tower.json'),JSON.stringify(report,null,2));}
