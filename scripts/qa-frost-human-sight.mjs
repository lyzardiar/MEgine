// Author: MiYu. Native Human building vision and enemy rendering across saved dawn/dusk.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {humanSightFixture} from './frost-human-sight-fixture.mjs';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join(nativeQaRoot,'human-sight-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'tmp/docs-artifacts','frost-human-sight'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
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
const save=async()=>{await key('F5');return JSON.parse(fs.readFileSync(path.join(storage,'quicksave.json')));};
let playbackStarted=false;
try{
 console.log('START native Human sight readiness');try{await query('project.state');}catch(e){if(!/BridgeConnectionError|request timed out/.test(e.message))throw e;}
 await execute('project.open',{root:sample});await execute('playback.play',{paused:true});playbackStarted=true;await step(2);
 const {s}=humanSightFixture(S);s.map.startingHour=0;s.frame=3599;S.visibility(s);await load(s);
 const body=async()=>(await snapshot()).entities.find(e=>e.name==='Unit 1');assert.ok((await body())?.active,'enemy rendered in daylight');
 const checkpoint=await save();await load(checkpoint);await step(1);const dusk=await save();assert.equal(dusk.frame,3600);assert.equal((await body()).active,false);assert.equal(dusk.explored[0][16*32+21],1);
 report.checks.push({savedDusk:true,enemyHidden:true,exploredRetained:true});console.log('PASS native Human sight: saved dusk hides enemy body and retains explored fog');
 dusk.frame=1199;await load(dusk);assert.equal((await body()).active,false);await step(1);assert.equal((await body()).active,true);
 report.checks.push({savedDawn:true,enemyVisible:true});console.log('PASS native Human sight: saved dawn reveals enemy body');
 report.testedMainSha256=hash(path.join(sample,'Assets/Scripts/Main.js'));assert.equal(report.testedMainSha256,report.sourceMainSha256);await execute('playback.stop');const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;
}catch(e){report.error=e.stack;try{report.failedTelemetry=await state();}catch{}process.exitCode=1;console.error(e.stack);}finally{if(playbackStarted)try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;}fs.writeFileSync(path.join(out,'native-human-sight.json'),JSON.stringify(report,null,2));}
