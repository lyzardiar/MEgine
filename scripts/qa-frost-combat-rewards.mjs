// Author: MiYu. Isolated native playback of real kill settlement and saved continuation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {rewardsFixture,rewardFight} from './frost-combat-rewards-fixture.mjs';
import {nativeQaRoot,configureNativeQa,closeNativeQa,removeNativeQaFixture} from './frost-native-qa-runtime.mjs';
const repo=fileURLToPath(new URL('../',import.meta.url)),source=path.join(repo,'samples/frostbound-realms'),root=path.join(nativeQaRoot,'combat-rewards-'+Date.now()),sample=path.join(root,'sample'),out=path.join(repo,'docs/designs/frostbound-realms/rea'),S=createRequire(import.meta.url)('../samples/frostbound-realms/game/simulation.js');
assert.ok(process.env.MENGINE_EDITOR_EXECUTABLE);configureNativeQa(root);fs.cpSync(source,sample,{recursive:true,filter:p=>!['SourceAssets','Builds','.mengine','Library','Imported'].includes(path.basename(p))});
const project=JSON.parse(fs.readFileSync(path.join(sample,'project.json')));project.storageId=path.basename(root);fs.writeFileSync(path.join(sample,'project.json'),JSON.stringify(project));
Object.assign(process.env,{MENGINE_AGENT_EDITOR_MODE:'auto-background',MENGINE_EDITOR_CONFIG_DIR:path.join(root,'config'),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows'});fs.mkdirSync(process.env.MENGINE_EDITOR_CONFIG_DIR,{recursive:true});
const {bridgeQuery:query,bridgeExecute,closeBridgeConnection}=await import('../packages/agent/mcp/server.mjs');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),report={author:'MiYu',passed:false,protocol:S.PROTOCOL,editorExecutable:process.env.MENGINE_EDITOR_EXECUTABLE,editorSha256:hash(process.env.MENGINE_EDITOR_EXECUTABLE),sourceMainSha256:hash(path.join(source,'Assets/Scripts/Main.js')),checks:[]};
const execute=async(name,args={})=>{const r=await bridgeExecute(name,args,{requestId:crypto.randomUUID(),timeoutMs:120000});assert.ok(r.ok,JSON.stringify(r));return r.result;},snapshot=()=>query('scene.snapshot'),state=async()=>JSON.parse((await snapshot()).entities.find(e=>e.name==='Frost telemetry').components.Text.text),step=(steps=1)=>execute('playback.step',{deltaTime:.1,steps});
const key=async k=>{await execute('playback.input',{keys:[k]});await step();await execute('playback.input',{keys:[]});await step();},click=async p=>{await execute('playback.input',{pointer:p,viewport:[1280,720],buttons:[0]});await step();await execute('playback.input',{pointer:p,buttons:[]});await step(2);};
let storageHash=0xcbf29ce484222325n;for(const byte of Buffer.from(project.storageId))storageHash=BigInt.asUintN(64,(storageHash^BigInt(byte))*0x100000001b3n);const storage=path.join(process.env.LOCALAPPDATA,'MEngine/UserData',storageHash.toString(16).padStart(16,'0'));fs.mkdirSync(storage,{recursive:true});
async function load(s){fs.writeFileSync(path.join(storage,'quicksave.json'),JSON.stringify(S.restore(s)));if((await state()).mode==='title')await key('F1');if(!(await state()).paused)await key('F10');await click([640,388]);const t=await state();assert.equal(t.mode,'playing');assert.equal(t.paused,false);return t;}
let playbackStarted=false;
try{
 console.log('START native combat reward readiness');try{await query('project.state');}catch(e){if(!/BridgeConnectionError|request timed out/.test(e.message))throw e;}
 await execute('project.open',{root:sample});await execute('playback.play',{paused:true});playbackStarted=true;await step(2);console.log('START native reward scenarios');
 for(const scenario of [{name:'legacy save',kind:'ghoul',team:-1,version:0,xp:35,gold:[25,25]},{name:'enemy player',kind:'humanfootman',team:1,version:1,xp:40,gold:[0,0]},{name:'neutral creep',kind:'ghoul',team:-1,version:1,xp:32,gold:[26,38]}]){
  console.log('START '+scenario.name);const {s}=rewardsFixture(S,{combatRewardsVersion:scenario.version});rewardFight(S,s,scenario.kind,scenario.team);const before=s.teams[0].gold;await load(s);await step(25);const t=await state();assert.equal(t.hero.xp,scenario.xp);assert.ok(t.gold-before>=scenario.gold[0]&&t.gold-before<=scenario.gold[1]);report.checks.push({name:scenario.name,xp:t.hero.xp,gold:t.gold-before});console.log('PASS '+scenario.name);
 }
 await key('Space');await execute('panel.focus',{kind:'game'});await step(2);const shot=await query('view.screenshot',{target:'game'});fs.writeFileSync(path.join(out,'combat-rewards-native.png'),Buffer.from(shot.dataUrl.split(',')[1],'base64'));
 await execute('playback.stop');const logs=await query('console.get_logs',{limit:100});assert.ok(!logs.some(l=>l.level==='error'),JSON.stringify(logs));report.consoleErrors=0;report.passed=true;console.log('PASS native combat reward scenarios: '+report.checks.length);
}catch(e){report.error=e.stack;process.exitCode=1;console.error(e.stack);}finally{if(playbackStarted)try{await execute('playback.stop');}catch{}closeBridgeConnection();try{report.cleanup=await closeNativeQa(root);if(report.cleanup.normalExit&&report.cleanup.runtimeRemoved)Object.assign(report.cleanup,removeNativeQaFixture(root,storage));}catch(e){report.cleanupError=e.message;}fs.writeFileSync(path.join(out,'native-combat-rewards.json'),JSON.stringify(report,null,2));}
