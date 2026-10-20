// Author: MiYu. Native Feedback armor, actual mana removal, source effect and saved missile replay.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {spellbreakerFixture} from './frost-human-spellbreaker-fixture.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join(nativeQaRoot,'feedback-armor-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'tmp/docs-artifacts','frost-feedback'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
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
 console.log('START native Feedback armor readiness');try{await query('project.state');}catch(e){if(!/BridgeConnectionError|request timed out/.test(e.message))throw e;}
 await execute('project.open',{root:sample});await execute('playback.play',{paused:true});playbackStarted=true;await step(2);
 for(const kind of ['unarmored','inner-fire','hero']){
  const f=spellbreakerFixture(S);f.breaker.spellStealAuto=false;let v=f.victim;
  if(kind==='inner-fire')v.innerFire={source:v.id,team:1,frame:0,left:60};
  if(kind==='hero'){f.s.units=f.s.units.filter(u=>u!==v);v=S.spawn(f.s,'hero',1,1,0,{mana:100,cd:99,order:{type:'hold'}});}
  S.visibility(f.s);assert.ok(S.fire(f.s,f.breaker,v));const shot=f.s.projectiles[0],burn=kind==='hero'?4:20,armor=S.armorValue(v,f.s);
  await load(f.s);const checkpoint=await save();assert.equal(checkpoint.units.find(u=>u.id===v.id).feedbackFrame,undefined);assert.deepEqual(checkpoint.projectiles,f.s.projectiles);await load(checkpoint);
  await step(5);const saved=await save(),target=saved.units.find(u=>u.id===v.id);assert.equal(target.feedbackAmount,burn);assert.ok(S.restore(saved));
  // Compare identical control ticks to remove passive health/mana regeneration from the measurement.
  const control=S.restore(checkpoint);control.humanSpellbreakerVersion=0;for(let i=0;i<5;i++)S.tick(control);const baseline=control.units.find(u=>u.id===v.id);
  near(baseline.hp-target.hp,burn/(1+.06*armor));near(baseline.mana-target.mana,burn);
  const scene=await snapshot(),fx=scene.entities.find(e=>e.active&&e.components.SampledEffect?.effect==='Assets/HumanSpellbreakerEffects/Effects/SpellBreakerAttack.mfx');assert.ok(fx,'original Feedback particles active');
  report.checks.push({target:kind,armor,burn,rawAttack:shot.damage,feedbackDamage:baseline.hp-target.hp,savedMissile:true,sourceEffect:true});console.log('PASS native Feedback '+kind+': mana '+burn+', armor '+armor+', bonus damage '+(baseline.hp-target.hp));
 }
 report.testedMainSha256=hash(path.join(sample,'Assets/Scripts/Main.js'));assert.equal(report.testedMainSha256,report.sourceMainSha256);const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;
}catch(e){report.error=e.stack;try{report.failedTelemetry=await state();}catch{}process.exitCode=1;console.error(e.stack);}finally{if(playbackStarted)try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;process.exitCode=1;}fs.writeFileSync(path.join(out,'native-feedback-armor.json'),JSON.stringify(report,null,2));}
